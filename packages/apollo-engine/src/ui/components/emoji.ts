// emoji —— 文本里的 emoji 字形 → 库里 Twemoji 美术图（render-only·纯函数·浏览器安全）。
// REQ-UI-emoji图渲（PUI）：把 Label/Button.label/spans/Tag 等**显示文本**里的 emoji 码点，
// 渲染时内联替换成 `<img src=`${base}/<cp>.png``>`（1em·随字号·baseline 对齐）。非 emoji 零变。
//
// 分工：**码点解析算法**（cpName + SYMBOL_ALIAS）与 PA 的 `scripts/emoji-resolve.mjs` **严丝合缝一致**
//   （故解析出的文件名与共享货架 `assets/emoji/<cp>.png` 对得上）。差别：那边是 Node 端（读 index.json 判
//   exact/alias/none + 覆盖表·喂 build/审计）；这里是**浏览器端渲染**——无 fs、不判库存在性，只做确定性
//   「码点→文件名」+ 静态 alias，乐观发 <img>（alt=原字形兜底）。真正的「库覆盖 100%」由 PA 的
//   `emoji-vendor`（按游戏扫用到的 emoji→vendor 进本地）+ 覆盖审计在**发版前**保证（见 requests REQ-UI-emoji图渲）。

/** emoji 图渲配置（挂在 UITheme.emoji·游戏按需开）。不设=文本 emoji 保字形（零回归）。 */
export interface EmojiConfig {
  /** 已解析的美术图目录（served·如 `/games/game-i/art/emoji` 或共享 `/assets/emoji`）。文件名=`<cp>.png`。 */
  base: string;
  /** 图标尺寸（CSS 长度·缺省 `1em` 随字号）。 */
  size?: string;
}

// 码点文件名（同 emoji-resolve.mjs / import-emoji.mjs cpName）：逐码点转 16 进制、滤 U+FE0F 变体选择符、多码点(ZWJ)以 - 连。
export const cpName = (e: string): string =>
  [...e].map((c) => c.codePointAt(0)!.toString(16)).filter((h) => h !== 'fe0f').join('-');

// 库里没有的 Unicode 符号 → 就近映射到「确有 Twemoji 图」的 emoji（同 emoji-resolve.mjs·PA 维护·此处为渲染端镜像）。
export const SYMBOL_ALIAS: Record<string, string> = {
  '2605': '2b50', // ★ 实心星 → ⭐
  '2606': '2b50', // ☆ 空心星 → ⭐
  '2654': '1f451', // ♔ 白棋王 → 👑
  '266a': '1f3b5', // ♪ 音符   → 🎵
  '2691': '1f6a9', // ⚑ 旗     → 🚩
  '267a': '267b', // ♺ 回收   → ♻
};

// 「可图标化 emoji」字符类——**与 PA `scripts/emoji-audit.mjs` 的 ICON 范围严丝合缝**（渲染端镜像·必须同步）：
//   象形符号 1F300–1FAFF + 杂符 2600–26FF + 兵器 2694–2699 + 麻将 1F004 + 棋子 2654–265F + 花色 2660–2667。
//   **故意排除 Dingbats 2700–27BF（箭头 →←↔ / 勾叉 ✓✅✗ / ✨ 等文本装饰记号）与 keycap（1️⃣）/裸 ASCII 数字·#·***。
//   与 audit 一致 → **渲染端只转「vendor 会 copy 进来的那批」**，绝不乐观发出无资产的 <img>（否则破图）。
//   alias 源字符（★☆♔♪⚑♺）均落在 2600–26FF/2654–265F 内、已被覆盖；alias 的**码点改写**在 cpName 后做。
const ICON = '[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{26FF}\\u{2694}-\\u{2699}\\u{1F004}\\u{2654}-\\u{265F}\\u{2660}-\\u{2667}]';
// 完整簇：ICON 起头，后接任意个 ZWJ+ICON（连字家族）/ U+FE0F 变体选择符 / 肤色修饰（1F3FB–1F3FF）。
// 注：audit 逐码点检测、不聚簇；game-i 现零多码点 emoji（vendor 全单码点）——ZWJ/肤色家族的**组合图 vendor** 属 PA 侧后续。
const EMOJI_RUN = new RegExp(
  `(?:${ICON})(?:\\u200D(?:${ICON})|[\\uFE0F\\u{1F3FB}-\\u{1F3FF}])*`,
  'gu',
);

// 属性内插防越狱（base 为游戏配置·仍防御性剥离引号/尖括号；cp 是 16 进制+连字符本就安全）。
const attrSafe = (s: string): string => s.replace(/["<>]/g, '');

/**
 * 把**已 HTML 转义**的显示文本里的 emoji 簇替换成 `<img>`（render-only）。
 * @param escaped 已经过 esc() 的文本（emoji 字符本身不含 &<>"，转义不影响它们）。
 * @param cfg     EmojiConfig；未配置 base → 原样返回（零回归）。
 */
export function emojifyHtml(escaped: string, cfg?: EmojiConfig): string {
  if (!cfg?.base) return escaped;
  const base = attrSafe(cfg.base).replace(/\/$/, '');
  const sz = cfg.size ? attrSafe(cfg.size) : '1em';
  return escaped.replace(EMOJI_RUN, (m) => {
    const raw = cpName(m);
    const cp = SYMBOL_ALIAS[raw] ?? raw;
    if (!cp) return m; // 兜底：算不出码点（理论不达）→ 保原字形。
    return `<img src="${base}/${cp}.png" alt="${attrSafe(m)}" class="apollo-emoji" ` +
      `style="height:${sz};width:${sz};object-fit:contain;vertical-align:-0.15em;display:inline-block">`;
  });
}

/** 文本里是否含可图渲的 emoji（供调用方跳过无谓处理·可选）。 */
export function hasEmoji(s: string): boolean {
  EMOJI_RUN.lastIndex = 0;
  return EMOJI_RUN.test(s);
}
