import type { AssetDescriptor, AssetLoader } from './asset-types.js';

// 浏览器 3D 模型加载器 —— 把 `model` 描述符的 src（文件地址或 data: URI）取成**原始字节**(ArrayBuffer)。
// 句柄形态约定：`ArrayBuffer`（裸字节）。真正的 glTF 解析（→ three 场景图）在渲染线（ThreeRenderer）做，
// **本加载器零 three 依赖**——three 不泄进资产层。仅在能 fetch 的环境可用（浏览器 / 无头 Chromium）；
// Node/测试请用 StubAssetLoader（产占位句柄·渲染线据「非 ArrayBuffer」自动跳过）。
//
// 非 model 描述符（texture/atlas/...）本加载器不处理（明确报错）——模型游戏只注册 model 资产；
// 同时要图又要模型的混合游戏可另组合一个分发型 loader（YAGNI：现无此需求）。

export class ModelAssetLoader implements AssetLoader {
  /** 可选基址前缀（如 import.meta.env.BASE_URL '/'）。data: URI 与绝对 URL 不受影响。 */
  constructor(private readonly baseUrl = '') {}

  async load(descriptor: AssetDescriptor): Promise<{ handle: ArrayBuffer; width: number; height: number }> {
    if (descriptor.kind !== 'model') {
      throw new Error(`ModelAssetLoader: 只加载 kind:'model'，收到 "${descriptor.kind}"（key=${descriptor.key}）`);
    }
    const src = descriptor.src;
    // data: / 绝对 URL 直接用；相对路径加 baseUrl 前缀。
    const url = /^(data:|https?:|blob:|\/)/.test(src) ? src : this.baseUrl + src;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ModelAssetLoader: 加载失败 "${url}"（HTTP ${res.status}）`);
    const handle = await res.arrayBuffer();
    return { handle, width: 0, height: 0 };
  }
}

/** 类型守卫：句柄是否为模型字节句柄（渲染线据此决定是否解析 glTF）。 */
export function isModelHandle(handle: unknown): handle is ArrayBuffer {
  return handle instanceof ArrayBuffer;
}
