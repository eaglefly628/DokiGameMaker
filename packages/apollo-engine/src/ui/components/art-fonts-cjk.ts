// 内嵌 CJK 艺术字体（SIL OFL 1.1·中/日·子集化到 src 用到的字 + 全假名）——**url() 引用·非 base64**：
// 浏览器按需惰性下载（只在真渲染该字族时拉那一个 woff2·主 bundle 零增）。woff2 在 public/ui-fonts/cjk/。
// 由 scripts/cjk-art-font-vendor.py 生成·勿手改（改字体清单/子集重跑脚本）。slug→family 映射见 art-fonts.ts。
/* eslint-disable */
export const ART_FONT_CJK_CSS = "@font-face{font-family:'Ma Shan Zheng';font-style:normal;font-weight:400;font-display:swap;src:url(/ui-fonts/cjk/cnbrush.woff2) format('woff2')}@font-face{font-family:'ZCOOL XiaoWei';font-style:normal;font-weight:400;font-display:swap;src:url(/ui-fonts/cjk/cnwen.woff2) format('woff2')}@font-face{font-family:'Yuji Syuku';font-style:normal;font-weight:400;font-display:swap;src:url(/ui-fonts/cjk/jpbrush.woff2) format('woff2')}@font-face{font-family:'Klee One';font-style:normal;font-weight:400;font-display:swap;src:url(/ui-fonts/cjk/jppen.woff2) format('woff2')}";
