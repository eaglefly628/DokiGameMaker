/**
 * devServer —— 引擎预览 dev server 的生命周期管理(纯逻辑 + 依赖注入,规则 14)。
 *
 * 语义:
 *   - **全进程至多一个**。引擎的 Vite 配了 `strictPort: 5180`,同机起第二个必挂;
 *     所以这里不做 Map<engineDir, …>,而是「已有别的仓库在跑」就如实拒绝,由用户
 *     自己决定停哪个 —— 静默抢占端口比报错更难排查。
 *   - **先探活再拉起**。端口上已经有服务(用户自己 `pnpm dev:engine`、或上次会话
 *     遗留)就直接复用并标 `external`;这类进程不归我们管,`stop()` 也不去杀。
 *   - **就绪判据是"端口真的能应答"**,不是"子进程还活着"。stdout 里 Vite 自报的
 *     `Local:` 地址只作为加速信号,且必须过 `isLoopbackHttpUrl` 才采信 —— 子进程
 *     输出是不可信来源。
 *
 * Electron 相关的东西(真 spawn / 真 HTTP 探活 / app 退出回收)全在 index.ts,
 * 本文件不 import electron,单测不需要 Electron runtime。
 */

import {
  GAME_PREVIEW_DEV_URL,
  GAME_PREVIEW_STOPPED,
  isLoopbackHttpUrl,
  type GamePreviewStatus,
} from '../../shared/gamePreviewIpc.js';
import type { EngineLocation } from './enginePackage.js';

export type GamePreviewErrorCode =
  /** 引擎包依赖没装(找不到 vite bin)。不代跑安装,如实报错。 */
  | 'DEPS_MISSING'
  /** 子进程起不来或起来后立刻退出。 */
  | 'START_FAILED'
  /** 超时仍未能在端口上应答。 */
  | 'START_TIMEOUT'
  /** 端口已被**另一个**仓库的预览占着。 */
  | 'OTHER_PROJECT_RUNNING';

export class GamePreviewError extends Error {
  constructor(readonly previewCode: GamePreviewErrorCode, message: string) {
    super(message);
    this.name = 'GamePreviewError';
  }
}

/** 子进程的最小结构型别 —— 只用到这几件事,便于单测替身。 */
export interface DevServerProcess {
  readonly pid?: number | undefined;
  readonly stdout: { on(event: 'data', listener: (chunk: unknown) => void): unknown } | null;
  readonly stderr: { on(event: 'data', listener: (chunk: unknown) => void): unknown } | null;
  once(event: 'exit' | 'error', listener: (...args: unknown[]) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface DevServerDeps {
  /** 返回 null = 依赖未安装(没找到可执行的 vite)。 */
  findViteBin(location: EngineLocation): string | null;
  spawn(bin: string, args: readonly string[], cwd: string): DevServerProcess;
  /** 端口探活:能拿到任意 HTTP 响应即视为在服务(4xx/5xx 也算 —— 端口有人应答)。 */
  probe(url: string): Promise<boolean>;
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };
  /** 就绪等待上限。Vite 冷启动要预打包 three 等重依赖,默认给足 90s。 */
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
}

interface RunningEntry {
  engineDir: string;
  url: string;
  origin: 'spawned' | 'external';
  child: DevServerProcess | null;
}

const DEFAULT_READY_TIMEOUT_MS = 90_000;
const DEFAULT_POLL_INTERVAL_MS = 400;
/** stdout / stderr 各留最后这么多字符,仅进主进程日志,不回传 renderer。 */
const OUTPUT_TAIL_LIMIT = 4_000;

const ANSI_RE = /\[[0-9;]*[A-Za-z]/g;
/** Vite 启动横幅里的 `➜  Local:   http://localhost:5180/`。 */
const LOCAL_URL_RE = /Local:\s*(\S+)/;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export class GamePreviewManager {
  private entry: RunningEntry | null = null;
  private starting: Promise<GamePreviewStatus> | null = null;
  private startingEngineDir: string | null = null;

  constructor(private readonly deps: DevServerDeps) {}

  status(): GamePreviewStatus {
    if (!this.entry) return { ...GAME_PREVIEW_STOPPED };
    return { running: true, url: this.entry.url, origin: this.entry.origin };
  }

  async start(location: EngineLocation): Promise<GamePreviewStatus> {
    if (this.entry) {
      if (this.entry.engineDir !== location.engineDir) {
        throw new GamePreviewError(
          'OTHER_PROJECT_RUNNING',
          'another ZeroCraft preview server is already running on this port',
        );
      }
      return this.status();
    }
    if (this.starting) {
      // 单飞:用户连点 / 多窗口同时点,只起一个服务。目标仓库不同时如实拒绝。
      if (this.startingEngineDir !== location.engineDir) {
        throw new GamePreviewError(
          'OTHER_PROJECT_RUNNING',
          'another ZeroCraft preview server is starting on this port',
        );
      }
      return this.starting;
    }
    this.startingEngineDir = location.engineDir;
    this.starting = this.doStart(location).finally(() => {
      this.starting = null;
      this.startingEngineDir = null;
    });
    return this.starting;
  }

  private async doStart(location: EngineLocation): Promise<GamePreviewStatus> {
    // 1) 先探活 —— 端口上已经有人在服务就复用,不抢占(strictPort 抢不过,也不该抢)。
    if (await this.deps.probe(GAME_PREVIEW_DEV_URL)) {
      this.entry = {
        engineDir: location.engineDir,
        url: GAME_PREVIEW_DEV_URL,
        origin: 'external',
        child: null,
      };
      this.deps.log?.info('reusing an already running engine dev server');
      return this.status();
    }

    // 2) 找可执行文件。没有 = 依赖未安装,如实报错(不代跑 install)。
    const bin = this.deps.findViteBin(location);
    if (!bin) {
      throw new GamePreviewError(
        'DEPS_MISSING',
        'vite binary not found in the engine package; dependencies are not installed',
      );
    }

    // 3) 拉起并等它真的能应答。
    const child = this.deps.spawn(bin, [], location.engineDir);
    const url = await this.waitForReady(child).catch((err) => {
      this.killQuietly(child);
      throw err;
    });
    this.entry = { engineDir: location.engineDir, url, origin: 'spawned', child };
    child.once('exit', () => {
      if (this.entry?.child === child) {
        this.deps.log?.warn('engine dev server exited');
        this.entry = null;
      }
    });
    this.deps.log?.info('engine dev server started', { pid: child.pid, url });
    return this.status();
  }

  /**
   * 就绪等待:轮询探活为准,stdout 里自报的 Local 地址只作加速信号(且必须是
   * loopback 才采信)。子进程提前退出 / spawn 报错 → START_FAILED;超时 → START_TIMEOUT。
   */
  private waitForReady(child: DevServerProcess): Promise<string> {
    const timeoutMs = this.deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    const intervalMs = this.deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let announcedUrl: string | null = null;
      let outputTail = '';
      let poll: ReturnType<typeof setInterval> | null = null;
      let deadline: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        settled = true;
        if (poll !== null) clearInterval(poll);
        if (deadline !== null) clearTimeout(deadline);
      };
      const succeed = (url: string): void => {
        if (settled) return;
        cleanup();
        resolve(url);
      };
      const fail = (code: GamePreviewErrorCode, message: string): void => {
        if (settled) return;
        cleanup();
        if (outputTail.trim()) {
          // 子进程输出只进主进程日志:可能含绝对路径 / 内部细节,不回传 renderer
          // (安全规则 §5:错误不把堆栈与内部绝对路径原样返回)。
          this.deps.log?.error('engine dev server output', { tail: outputTail.slice(-OUTPUT_TAIL_LIMIT) });
        }
        reject(new GamePreviewError(code, message));
      };

      const onChunk = (chunk: unknown): void => {
        const text = stripAnsi(String(chunk));
        outputTail = (outputTail + text).slice(-OUTPUT_TAIL_LIMIT);
        if (announcedUrl) return;
        const matched = LOCAL_URL_RE.exec(text);
        if (matched && isLoopbackHttpUrl(matched[1])) announcedUrl = matched[1];
      };
      child.stdout?.on('data', onChunk);
      child.stderr?.on('data', onChunk);

      child.once('error', () => {
        fail('START_FAILED', 'failed to spawn the engine dev server');
      });
      child.once('exit', () => {
        fail('START_FAILED', 'the engine dev server exited before it became reachable');
      });

      const tick = (): void => {
        const target = announcedUrl ?? GAME_PREVIEW_DEV_URL;
        void this.deps
          .probe(target)
          .then((alive) => {
            if (alive) succeed(target);
          })
          .catch(() => undefined);
      };
      poll = setInterval(tick, intervalMs);
      deadline = setTimeout(() => {
        fail('START_TIMEOUT', 'the engine dev server did not become reachable in time');
      }, timeoutMs);
      tick();
    });
  }

  /**
   * 停止本进程拉起的 dev server。`external` 的服务不是我们起的,只解绑不杀
   * —— 杀掉用户自己终端里跑的东西是越权。
   */
  stop(): GamePreviewStatus {
    const entry = this.entry;
    this.entry = null;
    if (entry?.origin === 'spawned' && entry.child) this.killQuietly(entry.child);
    return { ...GAME_PREVIEW_STOPPED };
  }

  /** 应用退出时回收(只回收我们自己拉起的)。 */
  dispose(): void {
    this.stop();
  }

  private killQuietly(child: DevServerProcess): void {
    try {
      child.kill();
    } catch (err) {
      this.deps.log?.warn('failed to kill engine dev server', { err: String(err) });
    }
  }
}
