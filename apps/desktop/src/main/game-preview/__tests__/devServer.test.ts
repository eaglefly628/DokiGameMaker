import { describe, expect, it, vi } from 'vitest';

import { GAME_PREVIEW_DEV_URL } from '../../../shared/gamePreviewIpc';
import { GamePreviewError, GamePreviewManager, type DevServerProcess } from '../devServer';

const LOCATION = { repoRoot: '/repo', engineDir: '/repo/packages/apollo-engine' };
const OTHER_LOCATION = { repoRoot: '/other', engineDir: '/other/packages/apollo-engine' };

/** 可编排的子进程替身:测试自行决定何时吐 stdout / 退出。 */
function makeFakeChild(): DevServerProcess & {
  emitStdout(text: string): void;
  emitExit(): void;
  kill: ReturnType<typeof vi.fn>;
} {
  const stdoutListeners: Array<(chunk: unknown) => void> = [];
  const onceListeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    pid: 4242,
    stdout: {
      on(_event: 'data', listener: (chunk: unknown) => void) {
        stdoutListeners.push(listener);
        return this;
      },
    },
    stderr: null,
    once(event: 'exit' | 'error', listener: (...args: unknown[]) => void) {
      const list = onceListeners.get(event) ?? [];
      list.push(listener);
      onceListeners.set(event, list);
      return this;
    },
    kill: vi.fn(() => true),
    emitStdout(text: string) {
      for (const listener of stdoutListeners) listener(Buffer.from(text));
    },
    emitExit() {
      for (const listener of onceListeners.get('exit') ?? []) listener(0);
    },
  };
}

/** 前 `deadCalls` 次探活返回 false,之后返回 true。 */
function probeAliveAfter(deadCalls: number): (url: string) => Promise<boolean> {
  let calls = 0;
  return async () => {
    calls += 1;
    return calls > deadCalls;
  };
}

function makeManager(overrides: Partial<ConstructorParameters<typeof GamePreviewManager>[0]> = {}) {
  const child = makeFakeChild();
  const spawn = vi.fn(() => child as DevServerProcess);
  const manager = new GamePreviewManager({
    findViteBin: () => '/repo/packages/apollo-engine/node_modules/.bin/vite',
    spawn,
    probe: probeAliveAfter(1),
    readyTimeoutMs: 2_000,
    pollIntervalMs: 5,
    ...overrides,
  });
  return { manager, child, spawn };
}

describe('GamePreviewManager.start', () => {
  it('端口上已有服务时复用而不是抢占(strictPort 抢不过,也不该抢)', async () => {
    const spawn = vi.fn(() => makeFakeChild() as DevServerProcess);
    const { manager } = makeManager({ probe: async () => true, spawn });

    const status = await manager.start(LOCATION);

    expect(status).toEqual({ running: true, url: GAME_PREVIEW_DEV_URL, origin: 'external' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('依赖没装时报 DEPS_MISSING —— 不代跑安装', async () => {
    const spawn = vi.fn(() => makeFakeChild() as DevServerProcess);
    const { manager } = makeManager({
      probe: async () => false,
      findViteBin: () => null,
      spawn,
    });

    await expect(manager.start(LOCATION)).rejects.toMatchObject({
      previewCode: 'DEPS_MISSING',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('拉起子进程并等到端口真能应答才算就绪', async () => {
    const { manager, spawn } = makeManager();

    const status = await manager.start(LOCATION);

    expect(spawn).toHaveBeenCalledWith(
      '/repo/packages/apollo-engine/node_modules/.bin/vite',
      [],
      LOCATION.engineDir,
    );
    expect(status).toEqual({ running: true, url: GAME_PREVIEW_DEV_URL, origin: 'spawned' });
    expect(manager.status()).toEqual(status);
  });

  it('子进程还没就绪就退出 → START_FAILED', async () => {
    const child = makeFakeChild();
    const { manager } = makeManager({
      probe: async () => false,
      spawn: () => child as DevServerProcess,
    });

    const started = manager.start(LOCATION);
    // 让 waitForReady 先挂上 exit 监听,再模拟子进程退出。
    await Promise.resolve();
    child.emitExit();

    await expect(started).rejects.toMatchObject({ previewCode: 'START_FAILED' });
    expect(manager.status().running).toBe(false);
  });

  it('迟迟不能应答 → START_TIMEOUT,并回收子进程', async () => {
    const child = makeFakeChild();
    const { manager } = makeManager({
      probe: async () => false,
      spawn: () => child as DevServerProcess,
      readyTimeoutMs: 30,
      pollIntervalMs: 5,
    });

    await expect(manager.start(LOCATION)).rejects.toMatchObject({
      previewCode: 'START_TIMEOUT',
    });
    expect(child.kill).toHaveBeenCalled();
  });

  it('另一个仓库的预览还占着端口时如实拒绝,不静默抢占', async () => {
    const { manager } = makeManager({ probe: async () => true });
    await manager.start(LOCATION);

    await expect(manager.start(OTHER_LOCATION)).rejects.toMatchObject({
      previewCode: 'OTHER_PROJECT_RUNNING',
    });
  });

  it('同一仓库重复 start 直接返回现状,不重复拉起', async () => {
    const { manager, spawn } = makeManager();
    const first = await manager.start(LOCATION);
    const second = await manager.start(LOCATION);

    expect(second).toEqual(first);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('并发 start 单飞:连点只起一个服务', async () => {
    const { manager, spawn } = makeManager();
    const [a, b] = await Promise.all([manager.start(LOCATION), manager.start(LOCATION)]);

    expect(a).toEqual(b);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('stdout 自报的非 loopback 地址不被采信,仍回落固定 dev 地址', async () => {
    const child = makeFakeChild();
    const { manager } = makeManager({
      probe: probeAliveAfter(2),
      spawn: () => child as DevServerProcess,
    });

    const started = manager.start(LOCATION);
    await Promise.resolve();
    child.emitStdout('  ➜  Local:   http://evil.example.com/\n');

    await expect(started).resolves.toMatchObject({ url: GAME_PREVIEW_DEV_URL });
  });
});

describe('GamePreviewManager.stop', () => {
  it('杀掉自己拉起的进程', async () => {
    const { manager, child } = makeManager();
    await manager.start(LOCATION);

    expect(manager.stop()).toEqual({ running: false, url: null, origin: null });
    expect(child.kill).toHaveBeenCalled();
    expect(manager.status().running).toBe(false);
  });

  it('external 的服务不是我们起的 —— 只解绑,不去杀', async () => {
    const child = makeFakeChild();
    const { manager } = makeManager({
      probe: async () => true,
      spawn: () => child as DevServerProcess,
    });
    await manager.start(LOCATION);

    manager.stop();

    expect(child.kill).not.toHaveBeenCalled();
  });
});

describe('GamePreviewError', () => {
  it('带稳定的 previewCode 供 IPC 层映射', () => {
    const err = new GamePreviewError('DEPS_MISSING', 'nope');
    expect(err).toBeInstanceOf(Error);
    expect(err.previewCode).toBe('DEPS_MISSING');
  });
});
