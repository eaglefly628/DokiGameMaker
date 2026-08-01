// 3D 模型资产（kind:'model'）—— 资产层只管「key → 字节(ArrayBuffer)」，零 three 依赖。
// ModelAssetLoader.load 走浏览器 fetch（这里不测 I/O）；此处测纯表面：句柄守卫 + stub 尺寸 + resolve 不当 2D 帧。
import { describe, it, expect } from 'vitest';
import { AssetManager, StubAssetLoader, ModelAssetLoader, isModelHandle } from './index.js';
import type { ModelDescriptor } from './index.js';

const DUCK: ModelDescriptor = { kind: 'model', key: 'duck', src: '/models/duck.glb' };

describe('Model 资产 kind', () => {
  it('isModelHandle：ArrayBuffer 是模型句柄、其它不是', () => {
    expect(isModelHandle(new ArrayBuffer(8))).toBe(true);
    expect(isModelHandle({ image: {} })).toBe(false);
    expect(isModelHandle(null)).toBe(false);
    expect(isModelHandle('x')).toBe(false);
  });

  it('StubAssetLoader：model 句柄占位 + 尺寸 0（node/测试无 I/O）', async () => {
    const am = new AssetManager(new StubAssetLoader());
    am.register(DUCK);
    const loaded = await am.load('duck');
    expect(loaded.width).toBe(0);
    expect(loaded.height).toBe(0);
    // resolve：模型不解析成 2D 帧。
    expect(am.resolve('duck')).toBeUndefined();
  });

  it('ModelAssetLoader：非 model 描述符明确报错（专职模型加载器）', async () => {
    const loader = new ModelAssetLoader();
    await expect(
      loader.load({ kind: 'texture', key: 't', src: 'x.png' }),
    ).rejects.toThrow(/只加载 kind:'model'/);
  });
});
