import type { AssetDescriptor, AssetLoader } from './asset-types.js';

// 浏览器图片加载器 —— 把描述符的 src 加载成 HTMLImageElement。
// 仅在浏览器环境可用(用到 Image)；Node/测试请用 StubAssetLoader。
// 句柄形态约定：{ image }，渲染后端用 handle.image 做 drawImage(源图统一)。

export interface ImageAssetHandle {
  readonly image: CanvasImageSource;
}

export class ImageAssetLoader implements AssetLoader {
  /** 可选基址前缀(如 '/assets/')。 */
  constructor(private readonly baseUrl = '') {}

  load(descriptor: AssetDescriptor): Promise<{ handle: ImageAssetHandle; width: number; height: number }> {
    // 单文件构建会把用到的美术 base64 注入 globalThis.__APOLLO_INLINE_ASSETS__（键=descriptor.src）。
    // 命中则用 data: URI（无需外部文件）；否则走 baseUrl + src。
    const inline = (globalThis as unknown as { __APOLLO_INLINE_ASSETS__?: Record<string, string> })
      .__APOLLO_INLINE_ASSETS__;
    // 内联表键是裸路径（assets/FreeArtLib/...）；descriptor.src 可能带 BASE_URL 前缀（'./' 或 '/'）
    // 或 baseUrl，统一剥掉前导 ./、/ 再匹配。
    const bare = descriptor.src.replace(/^(\.?\/)+/, '');
    const url =
      (inline && (inline[descriptor.src] ?? inline[bare] ?? inline['/' + bare])) ||
      this.baseUrl + descriptor.src;
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ handle: { image }, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error(`ImageAssetLoader: 加载失败 "${url}"`));
      image.src = url;
    });
  }
}

/** 类型守卫：句柄是否为可绘制图像句柄(渲染层用来决定画真图还是占位)。 */
export function isImageHandle(handle: unknown): handle is ImageAssetHandle {
  return typeof handle === 'object' && handle !== null && 'image' in handle;
}
