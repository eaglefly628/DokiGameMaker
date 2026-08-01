// FreeArtLib（DCSS CC0 32×32 tiles）资产目录：类型 + 检索助手，供所有游戏 ref/copy。
// 索引 assets/FreeArtLib/index.json 由 scripts/build-artlib-index.mjs 生成（从名字派生分类）；
// slot/transparent 语义来自人工看样图（从图像）。标准见 docs/design/art-library-tags.md。
// 助手是纯函数，index 由调用方传入（按需 fetch/import，避免把 ~700KB 强行打进包）。
import { CAT_TAGS, SUBJECT_TAGS } from './artlib-tags.js';

export type ArtSlot =
  | 'tile' // 不透明可平铺地形 → Tilemap
  | 'sprite.character' // 透明生物/角色精灵 → Sprite.textureKey
  | 'sprite.paperdoll' // 纸娃娃分层（base+body+head+hands 叠合）
  | 'icon.item' // 透明物品图标
  | 'icon.ui' // UI/法术/技能图标
  | 'fx' // 特效/投射物
  | 'decal' // 血迹/铭牌/旗帜等叠加
  | 'card'; // 卡牌面（Balatro 小丑牌美术，webp）

// 风格轴（正交于 slot/cat）：slot/cat 说"是什么"，style 说"怎么画的"。
// 当前只收 pixel + cartoon.*（写实/photoreal 暂不收，用户 2026-06 拍板）。
// 顶层两组 pixel / cartoon（按 '.' 前缀分组），cartoon.* 再细分画风。
export type ArtStyle =
  | 'pixel' // 像素风：限色+硬边+小尺寸(16/32/64)。现有 DCSS 全库属此。
  | 'cartoon.ink' // 国风·水墨：水墨/工笔/卷轴/留白。
  | 'cartoon.western' // 欧美动画：迪士尼式/卡通渲染/厚涂。
  | 'cartoon.anime' // 日韩二次元：立绘/Q版。
  | 'cartoon.flat'; // 扁平/矢量：UI 图标/扁平插画。

export interface ArtStyleDef {
  readonly id: ArtStyle;
  readonly group: 'pixel' | 'cartoon';
  readonly label: string;
  readonly hint: string;
}

/** 风格分类法（浏览器过滤面 + 导入打标的数据源；可增删，改这一处即可）。 */
export const STYLE_TAXONOMY: readonly ArtStyleDef[] = [
  { id: 'pixel', group: 'pixel', label: '像素风', hint: '限色+硬边+小尺寸(16/32/64)' },
  { id: 'cartoon.ink', group: 'cartoon', label: '国风·水墨', hint: '水墨/工笔/卷轴/留白' },
  { id: 'cartoon.western', group: 'cartoon', label: '欧美动画', hint: '迪士尼式/卡通渲染/厚涂' },
  { id: 'cartoon.anime', group: 'cartoon', label: '日韩二次元', hint: '立绘/Q版' },
  { id: 'cartoon.flat', group: 'cartoon', label: '扁平/矢量', hint: 'UI图标/扁平插画' },
];

export interface ArtAsset {
  id: string; // 稳定 key = cat/sub/subject（变体合一），如 "item/weapon/axe"
  cat: string; // 顶层分类
  sub: string; // 子目录路径（'' = 直属 cat）
  subject: string; // 主题名（去掉 _数字 变体）
  slot: ArtSlot; // 怎么用（看样图定）
  transparent: boolean;
  variants: number; // 变体张数（如 floor 4 张随机平铺）
  sample?: string; // 代表帧文件名（真实存在的首张，变体编号非 0 基连续故须存）
  tags?: string[]; // 额外语义标签（像素扫描补录；覆盖 CAT_TAGS/SUBJECT_TAGS 无法表达的个例）
  style?: ArtStyle; // 画风（缺省→pixel：DCSS 货架全是像素风）。新风格资产由导入器写入。
  w?: number;
  h?: number; // 仅 ≠ basePixel(32) 时存
}

/** 资产画风（缺省→pixel：现有 DCSS 货架全是像素风；新源由导入器显式标）。 */
export function assetStyle(a: ArtAsset): ArtStyle {
  return a.style ?? 'pixel';
}

/** 风格 id → 顶层组（pixel/cartoon）。 */
export function styleGroup(style: ArtStyle): 'pixel' | 'cartoon' {
  return style.startsWith('cartoon') ? 'cartoon' : 'pixel';
}

export interface ArtLibIndex {
  version: number;
  source: string;
  license: string;
  root: string;
  basePixel: number;
  fileCount: number;
  assetCount: number;
  cats: Record<string, number>;
  slots: Record<string, number>;
  assets: ArtAsset[];
}

/** 一个资产的搜索标签 = cat + sub 各段 + subject 各词 + slot 词根 + 语义标签（现算）。 */
export function artlibTokens(a: ArtAsset): string[] {
  const subCatKey = a.sub ? `${a.cat}/${a.sub}` : a.cat;
  const catTags = CAT_TAGS[subCatKey] ?? CAT_TAGS[a.cat] ?? [];
  const subjectTags = SUBJECT_TAGS[a.subject] ?? [];
  const extraTags = a.tags ?? [];
  return [
    ...new Set([
      a.cat, ...a.sub.split('/'), ...a.subject.split('_'), ...a.slot.split('.'),
      ...assetStyle(a).split('.'), // 风格词（pixel / cartoon / ink…）→ 可搜可选材
      ...catTags, ...subjectTags, ...extraTags,
    ].filter(Boolean)),
  ].map((t) => t.toLowerCase());
}

/**
 * 仅语义标签子集（像素扫描所得：元素/威胁/风格/特殊旗标），与 artlibTokens 的合并
 * 逻辑严格同构（cat/sub 命中则用子目录级，否则回退 cat 级）—— 浏览器把它们显示在
 * 图片上、AI 选材排序给它们更高权重；显示的 = 搜索/解析用的，所见即所选。
 */
export function artlibSemanticTags(a: ArtAsset): string[] {
  const subCatKey = a.sub ? `${a.cat}/${a.sub}` : a.cat;
  const catTags = CAT_TAGS[subCatKey] ?? CAT_TAGS[a.cat] ?? [];
  const subjectTags = SUBJECT_TAGS[a.subject] ?? [];
  const extraTags = a.tags ?? [];
  return [...new Set([...catTags, ...subjectTags, ...extraTags].filter(Boolean))].map((t) => t.toLowerCase());
}

/** 资产所在目录（相对仓库根）：root/cat[/sub]。 */
export function artlibDir(index: ArtLibIndex, a: ArtAsset): string {
  return [index.root, a.cat, a.sub].filter(Boolean).join('/');
}

/**
 * 变体文件 glob 模式：`<dir>/<subject>*.png`。
 * 注意：变体编号非 0 基连续（如 bars_red_1..8 / black_cobalt_1,10）→ 用 glob 找真实文件，
 * 不要假设 0..n-1。variants 字段只给"有几张"。
 */
export function artlibGlob(index: ArtLibIndex, a: ArtAsset): string {
  return `${artlibDir(index, a)}/${a.subject}${a.variants > 1 ? '*' : ''}.png`;
}

/** 代表帧文件路径（相对仓库根）：dir/sample。dev 下加前导 '/' 即可 `<img src>`。 */
export function artlibThumb(index: ArtLibIndex, a: ArtAsset): string {
  return `${artlibDir(index, a)}/${a.sample ?? `${a.subject}.png`}`;
}

/** 按 tag/文本检索（空格分词，全部命中）。可选 slot/cat 过滤。 */
export function searchArtlib(
  index: ArtLibIndex,
  query: string,
  opts: { slot?: ArtSlot; cat?: string } = {},
): ArtAsset[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return index.assets.filter((a) => {
    if (opts.slot && a.slot !== opts.slot) return false;
    if (opts.cat && a.cat !== opts.cat) return false;
    if (!terms.length) return true;
    const hay = artlibTokens(a).join(' ') + ' ' + a.id;
    return terms.every((t) => hay.includes(t));
  });
}
