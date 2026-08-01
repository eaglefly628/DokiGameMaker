// 单文件构建会把用到的美术 base64 注入 globalThis.__APOLLO_INLINE_ASSETS__
// （键 = 裸路径 'assets/FreeArtLib/...'）。inlineUrl 命中则返回 data: URI（单 HTML 自带美术、
// 无需外部文件）；否则返回 base + path（多文件 / dev 走外部文件，行为不变）。
// 供「直接拼 URL」的渲染路径用（CSS background-image / <img src>），与 ImageAssetLoader 同源。
export function inlineUrl(path: string, base = ''): string {
  const inline = (globalThis as unknown as { __APOLLO_INLINE_ASSETS__?: Record<string, string> })
    .__APOLLO_INLINE_ASSETS__;
  const bare = path.replace(/^(\.?\/)+/, '');
  return (inline && (inline[path] ?? inline[bare] ?? inline['/' + bare])) || base + path;
}
