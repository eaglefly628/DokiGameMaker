/**
 * game-preview/index.ts —— 引擎预览的 Electron 组装层(规则 14:adapter,不含业务体)。
 *
 * 三件事:
 *   1. 把真 spawn / 真 HTTP 探活 / 真 bin 查找注入 `GamePreviewManager`;
 *   2. 注册 `game-preview:*` 三个 invoke handler(带 sender 闸与 payload 校验);
 *   3. 应用退出时回收我们自己拉起的子进程。
 *
 * 安全口径(见 docs/dev-rules/electron-security-and-process-boundaries.md):
 *   - handler 一律先过 `assertTrustedAppRendererEvent` —— 只有 Cindy 自有顶层
 *     Renderer 能调,WebView / Ghost / 子 frame 一律拒绝;
 *   - renderer 传来的只有 `workdir` 一个字符串,**不是命令**。要执行什么由
 *     `resolveEngineLocation` 从仓库结构推导(package.json 的 name 必须恰为
 *     `@zerocraft/apollo-engine`),renderer 无从指定可执行文件、参数或环境;
 *   - 子进程的 stdout/stderr 只进主进程日志,错误回给 renderer 的只有错误码 +
 *     固定文案,不带绝对路径与堆栈。
 */

import { spawn, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  GAME_PREVIEW_INVOKE,
  type GamePreviewStatus,
} from '../../shared/gamePreviewIpc.js';
import { createLogger } from '../logger.js';
import { assertTrustedAppRendererEvent } from '../security/trustedAppRenderer.js';
import { requireObject, requireString, throwIpcError } from '../utils/ipcValidate.js';
import {
  resolveEngineLocation,
  viteBinCandidates,
  type EngineLocation,
} from './enginePackage.js';
import {
  GamePreviewError,
  GamePreviewManager,
  type DevServerProcess,
} from './devServer.js';

const log = createLogger('game-preview');

/** 探活单次请求上限。loopback 请求要么立刻通、要么立刻 ECONNREFUSED。 */
const PROBE_TIMEOUT_MS = 1_500;

let manager: GamePreviewManager | null = null;
let ipcRegistered = false;

function findViteBin(location: EngineLocation): string | null {
  for (const candidate of viteBinCandidates(location, process.platform)) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // 不存在就看下一个候选。
    }
  }
  return null;
}

/**
 * 起 dev server 子进程。
 *
 * POSIX 直接 spawn `.bin/vite`(shell:false,没有 shell 解析面)。Windows 上
 * Node 自 18.20 起拒绝不带 shell 地 spawn `.cmd/.CMD`,所以显式借 `cmd.exe /d /s /c`
 * 启动,并把 bin 路径作为**独立参数**交给 Node 去引用 —— 不自己拼命令行字符串。
 */
function spawnDevServer(bin: string, args: readonly string[], cwd: string): DevServerProcess {
  const env = {
    ...process.env,
    // 关掉颜色,stdout 里的 `Local:` 行才好解析(仍会 stripAnsi 兜一层)。
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    // 避免任何环节尝试拉起系统浏览器 —— 预览就是要跑在右侧栏里。
    BROWSER: 'none',
  };
  const common: SpawnOptions = {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  };
  if (process.platform === 'win32' && /\.cmd$/i.test(bin)) {
    const comspec = process.env.ComSpec || 'cmd.exe';
    return spawn(comspec, ['/d', '/s', '/c', bin, ...args], common) as unknown as DevServerProcess;
  }
  return spawn(bin, [...args], common) as unknown as DevServerProcess;
}

/** 端口探活:拿到任意 HTTP 状态码即认为「有人在这个端口上服务」。 */
function probe(url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (alive: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(alive);
    };
    let request: http.ClientRequest;
    try {
      const transport = url.startsWith('https:') ? https : http;
      request = transport.request(url, { method: 'GET', timeout: PROBE_TIMEOUT_MS }, (res) => {
        res.resume(); // 丢弃 body,只关心「有没有应答」
        done(true);
      });
    } catch {
      done(false);
      return;
    }
    request.on('timeout', () => {
      request.destroy();
      done(false);
    });
    request.on('error', () => done(false));
    request.end();
  });
}

export function getGamePreviewManager(): GamePreviewManager {
  if (!manager) {
    manager = new GamePreviewManager({
      findViteBin,
      spawn: spawnDevServer,
      probe,
      log,
    });
  }
  return manager;
}

/** workdir → 引擎包位置;不在 ZeroCraft 仓库内时抛 IPC 错误。 */
function requireEngineLocation(workdir: string): EngineLocation {
  const located = resolveEngineLocation(workdir, {
    readJson(filePath) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
      } catch {
        return null;
      }
    },
  });
  if (!located) {
    throwIpcError(
      'NOT_FOUND',
      'the current working directory is not inside a ZeroCraft repository',
    );
  }
  return located;
}

function mapPreviewError(err: unknown): never {
  if (err instanceof GamePreviewError) {
    // DEPS_MISSING / OTHER_PROJECT_RUNNING 都是「前置条件不满足」,renderer 侧按
    // previewCode 分文案;IpcErrorCode 复用既有枚举,不为此扩表。
    throwIpcError('PRECONDITION_FAILED', err.previewCode);
  }
  log.error('game preview failed', { err: String(err) });
  throwIpcError('INTERNAL', 'failed to start the engine preview server');
}

export function registerGamePreviewIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle(
    GAME_PREVIEW_INVOKE.START,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<GamePreviewStatus> => {
      assertTrustedAppRendererEvent(event);
      const workdir = requireString(requireObject(payload).workdir, 'workdir');
      const location = requireEngineLocation(workdir);
      try {
        return await getGamePreviewManager().start(location);
      } catch (err) {
        mapPreviewError(err);
      }
    },
  );

  ipcMain.handle(GAME_PREVIEW_INVOKE.STOP, (event: IpcMainInvokeEvent): GamePreviewStatus => {
    assertTrustedAppRendererEvent(event);
    return getGamePreviewManager().stop();
  });

  ipcMain.handle(GAME_PREVIEW_INVOKE.STATUS, (event: IpcMainInvokeEvent): GamePreviewStatus => {
    assertTrustedAppRendererEvent(event);
    return getGamePreviewManager().status();
  });

  // 退出时回收我们自己拉起的 dev server(external 的不动 —— 不是我们起的)。
  app.on('will-quit', () => {
    manager?.dispose();
  });
}
