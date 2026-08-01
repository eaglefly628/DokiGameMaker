import { describe, it, expect } from 'vitest';
import { AssetManager, StubAssetLoader } from './asset-manager.js';
import type { AssetManifest, AssetDescriptor, AssetLoader, AssetHandle } from './asset-types.js';

const manifest: AssetManifest = [
  { kind: 'texture', key: 'player', src: 'player.png', width: 32, height: 48 },
  {
    kind: 'atlas',
    key: 'heroine-face',
    src: 'heroine.png',
    frames: {
      neutral: { x: 0, y: 0, w: 100, h: 120 },
      smile: { x: 100, y: 0, w: 100, h: 120 },
      blush: { x: 200, y: 0, w: 100, h: 120 },
    },
  },
  { kind: 'sprite-sheet', key: 'walk', src: 'walk.png', frameWidth: 16, frameHeight: 16, columns: 4, count: 6 },
  {
    kind: 'prerendered-sequence',
    key: 'crate-3d',
    src: 'crate_angles.png',
    frameWidth: 64,
    frameHeight: 64,
    columns: 8,
    count: 8,
    source3d: { model: 'crate.glb', axis: 'angles', angles: 8 },
  },
];

function makeManager() {
  const m = new AssetManager(new StubAssetLoader());
  m.registerManifest(manifest);
  return m;
}

describe('AssetManager — 注册与加载', () => {
  it('注册后 has 为真、未加载时 isLoaded 为假', () => {
    const m = makeManager();
    expect(m.has('player')).toBe(true);
    expect(m.has('missing')).toBe(false);
    expect(m.isLoaded('player')).toBe(false);
  });

  it('load 后缓存命中、isLoaded 为真', async () => {
    const m = makeManager();
    const a = await m.load('player');
    expect(m.isLoaded('player')).toBe(true);
    expect(a.width).toBe(32);
    expect(a.height).toBe(48);
    expect(m.get('player')).toBe(a); // 同一引用，已缓存
  });

  it('未注册的 key load 抛错', async () => {
    const m = makeManager();
    await expect(m.load('nope')).rejects.toThrow(/未注册/);
  });

  it('并发 load 去重为同一承诺结果', async () => {
    const m = makeManager();
    const [a, b] = await Promise.all([m.load('player'), m.load('player')]);
    expect(a).toBe(b);
  });

  it('loadAll 加载全部', async () => {
    const m = makeManager();
    await m.loadAll();
    for (const d of manifest) expect(m.isLoaded(d.key)).toBe(true);
  });
});

describe('AssetManager — 帧解析(四种 kind 归约为源矩形)', () => {
  it('texture：整图为一帧', async () => {
    const m = makeManager();
    await m.load('player');
    expect(m.resolve('player')).toEqual({
      asset: m.get('player'),
      sx: 0,
      sy: 0,
      sw: 32,
      sh: 48,
    });
  });

  it('atlas：按帧名取子矩形', async () => {
    const m = makeManager();
    await m.load('heroine-face');
    expect(m.resolve('heroine-face', 'smile')).toMatchObject({ sx: 100, sy: 0, sw: 100, sh: 120 });
    expect(m.resolve('heroine-face', 'blush')).toMatchObject({ sx: 200, sy: 0, sw: 100, sh: 120 });
  });

  it('atlas：未知帧名 / 传索引 → undefined', async () => {
    const m = makeManager();
    await m.load('heroine-face');
    expect(m.resolve('heroine-face', 'angry')).toBeUndefined();
    expect(m.resolve('heroine-face', 0)).toBeUndefined();
  });

  it('sprite-sheet：按索引折行计算源矩形', async () => {
    const m = makeManager();
    await m.load('walk');
    expect(m.resolve('walk', 0)).toMatchObject({ sx: 0, sy: 0, sw: 16, sh: 16 });
    expect(m.resolve('walk', 3)).toMatchObject({ sx: 48, sy: 0, sw: 16, sh: 16 }); // col 3 行 0
    expect(m.resolve('walk', 4)).toMatchObject({ sx: 0, sy: 16, sw: 16, sh: 16 }); // 折到行 1
    expect(m.resolve('walk')).toMatchObject({ sx: 0, sy: 0 }); // 默认索引 0
  });

  it('sprite-sheet：越界索引 → undefined', async () => {
    const m = makeManager();
    await m.load('walk');
    expect(m.resolve('walk', 6)).toBeUndefined();
    expect(m.resolve('walk', -1)).toBeUndefined();
  });

  it('prerendered-sequence(3D→2D 离线)：当作网格序列解析，与 sprite-sheet 同构', async () => {
    const m = makeManager();
    await m.load('crate-3d');
    expect(m.resolve('crate-3d', 0)).toMatchObject({ sx: 0, sy: 0, sw: 64, sh: 64 });
    expect(m.resolve('crate-3d', 7)).toMatchObject({ sx: 7 * 64, sy: 0, sw: 64, sh: 64 });
  });

  it('未加载时 resolve 返回 undefined(渲染层据此退化占位)', () => {
    const m = makeManager();
    expect(m.resolve('player')).toBeUndefined();
  });
});

describe('AssetManager — 边界与不透明句柄', () => {
  it('句柄不透明：管理器不解释其形态，只透传(stub 句柄按原样可取)', async () => {
    const m = makeManager();
    const a = await m.load('player');
    expect(a.handle).toMatchObject({ stub: true, key: 'player', kind: 'texture' });
  });

  it('clear 清空注册与缓存', async () => {
    const m = makeManager();
    await m.load('player');
    m.clear();
    expect(m.has('player')).toBe(false);
    expect(m.isLoaded('player')).toBe(false);
  });
});

describe('AssetManager — 失败重试（inflight 不卡死）', () => {
  it('加载失败后清理 inflight → 允许重试成功（不被死 Promise 永久占位）', async () => {
    let attempts = 0;
    const flaky: AssetLoader = {
      async load(d: AssetDescriptor): Promise<{ handle: AssetHandle; width: number; height: number }> {
        attempts += 1;
        if (attempts === 1) throw new Error('network blip');
        return { handle: { stub: true, key: d.key, kind: d.kind }, width: 1, height: 1 };
      },
    };
    const m = new AssetManager(flaky);
    m.register({ kind: 'texture', key: 'player', src: 'player.png', width: 1, height: 1 });
    await expect(m.load('player')).rejects.toThrow('network blip'); // 首次失败
    const a = await m.load('player'); // 重试：inflight 已清，不再返回死 Promise
    expect(a.handle).toMatchObject({ key: 'player' });
    expect(attempts).toBe(2);
  });
});

describe('AssetManager — 命名动画剪辑（R9 增益 B：index→帧名→委托 atlas）', () => {
  it('resolve(animKey, index) 按有序帧名委托底层 atlas 取矩形', async () => {
    const m = makeManager(); // 含 heroine-face atlas（neutral@0 / smile@100 / blush@200，各 100x120）
    await m.load('heroine-face');
    m.registerAnimation({ key: 'face_anim', atlas: 'heroine-face', frames: ['neutral', 'smile', 'blush'] });
    expect(m.has('face_anim')).toBe(true);
    expect(m.resolve('face_anim', 0)).toMatchObject({ sx: 0, sy: 0, sw: 100, sh: 120 }); // neutral
    expect(m.resolve('face_anim', 1)).toMatchObject({ sx: 100, sy: 0, sw: 100, sh: 120 }); // smile
    expect(m.resolve('face_anim', 2)).toMatchObject({ sx: 200, sy: 0, sw: 100, sh: 120 }); // blush
    expect(m.resolve('face_anim', 3)).toBeUndefined(); // 越界帧
    expect(m.resolve('face_anim')).toMatchObject({ sx: 0, sy: 0 }); // 默认帧 0
  });

  it('非连续/乱序命名帧也能映射（hero_attack_A/B/C 任意取）', async () => {
    const m = makeManager();
    await m.load('heroine-face');
    m.registerAnimation({ key: 'wink', atlas: 'heroine-face', frames: ['blush', 'neutral'] }); // 乱序子集
    expect(m.resolve('wink', 0)).toMatchObject({ sx: 200 }); // blush
    expect(m.resolve('wink', 1)).toMatchObject({ sx: 0 }); // neutral
  });
});
