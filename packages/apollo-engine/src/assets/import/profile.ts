// 归一化 Profile —— 导入器的"规则即数据"：一份 JSON 决定命名/变体/重复/冲突策略。
// 数据驱动宣言的尺子：同一批文件 + 同一份 profile → 永远产出同一份导入计划（确定、可复放、可审计）。
// 最弱的 LLM 也能产出 profile；自由逻辑只活在引擎这台固定解释器（normalize.ts）里。

export interface CategoryRule {
  /** 原始相对路径/文件名包含此子串（不区分大小写）即命中。 */
  readonly match: string;
  /** 命中后归入的分类 id（资源库分类法）。 */
  readonly category: string;
}

export interface NormalizationProfile {
  readonly version: 1;
  /** 目标类型（v1 聚焦 2D 贴图）。 */
  readonly type: 'texture';
  /** 默认分类（categoryRules 未命中时用）。 */
  readonly category: string;
  /** id 命名空间前缀（最终 id = `<idPrefix>/<slug>`；空则 `<type>/<category>/<slug>`）。 */
  readonly idPrefix?: string;
  /** 文件名转小写。 */
  readonly lowercase: boolean;
  /** 变体后缀模式（正则源串，捕获组 1 = 编号），如 "_(\\d+)$"、" \\((\\d+)\\)$"。 */
  readonly variantPatterns: readonly string[];
  /** 同内容（hash 相同）重复文件：skip 跳过 / keep 仍导入。 */
  readonly duplicatePolicy: 'skip' | 'keep';
  /** id 与现有库冲突：suffix 自动加 _2.. / skip 该文件不导入。 */
  readonly conflictPolicy: 'suffix' | 'skip';
  /** 附加到每条记录的默认 tags。 */
  readonly defaultTags: readonly string[];
  /** 路径关键词 → 分类（乱目录归一的核心；自上而下首个命中生效）。 */
  readonly categoryRules: readonly CategoryRule[];
}

export const DEFAULT_PROFILE: NormalizationProfile = {
  version: 1,
  type: 'texture',
  category: 'misc',
  lowercase: true,
  variantPatterns: ['_(\\d+)$', ' \\((\\d+)\\)$', '-(\\d+)$'],
  duplicatePolicy: 'skip',
  conflictPolicy: 'suffix',
  defaultTags: [],
  categoryRules: [],
};
