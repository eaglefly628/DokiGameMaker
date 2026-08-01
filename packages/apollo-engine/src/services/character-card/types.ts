// 平台角色卡桥 · 类型契约（REQ-CHARCARD·三游戏共用·外部数据桥·纯确定性）。
//
// 网页平台的角色卡草稿 `PlatformCharacterDraft`（**平台真格式=唯一真相·媒体键全部平铺·无嵌套**）
// 经 normalizeCharacterCard 收敛为引擎规范卡 `ZeroCraftCharacterCard`。此层**不进 skills tier**——
// 外部平台数据 ≠ sim capability；与 profile/voice 同为 services 基础设施端口。
//
// 红线：DataUrl/媒体不进美术台账、不进 sim hash；卡文本=外部不可信输入（展示层自行长度截断）。

/**
 * 平台角色卡草稿（网页平台发放的原始格式·宽容读·所有字段可缺/可为任意类型）。
 * **媒体键平铺**（平台真格式：`imageUrl/imageDataUrl/imageOssKey/avatarUrl/...`·无嵌套对象）。
 * normalizeCharacterCard 逐字段安全收敛，绝不 throw；类型不符的已消费键 → 原值转存 passthrough + warn。
 */
export interface PlatformCharacterDraft {
  id?: string;
  name?: string;
  gender?: string;
  kind?: string;
  // —— persona 文本群 ——
  opening?: string;
  cardDescription?: string;
  description?: string;
  personality?: string;
  speakingStyle?: string;
  boundaries?: string;
  catchphrases?: string[];
  backstory?: string;
  worldView?: string;
  eraBackground?: string;
  rules?: string;
  coreConflicts?: string;
  exampleDialogues?: string;
  conversationStyle?: string;
  replySettings?: string;
  // —— 分类/开关 ——
  tags?: string[];
  adultConfirmed?: boolean;
  visibility?: string;
  backgroundPublic?: boolean;
  moreSettings?: unknown;
  updatedAt?: string;
  format?: string;
  // —— 媒体键·全部平铺（平台真格式）——
  imageMode?: string;
  imageUrl?: string;
  imageDataUrl?: string;
  imageOssKey?: string;
  imageName?: string;
  avatarUrl?: string;
  avatarDataUrl?: string;
  avatarOssKey?: string;
  animationUrl?: string; // 平台无此键·宽容读容忍其出现（若在则取优最高）
  animationDataUrl?: string;
  animationOssKey?: string;
  animationName?: string;
  // 平台可能追加的自留字段（原样进 passthrough）。
  [key: string]: unknown;
}

/** 规范卡·媒体段（已按取优规则解出的可用地址 + 展示名）。 */
export interface CharacterMedia {
  avatarUrl?: string;
  imageUrl?: string;
  animationUrl?: string;
  imageName?: string;
  animationName?: string;
}

/** 规范卡·人设段（全部为展示层文本·外部不可信输入）。 */
export interface CharacterPersona {
  opening?: string;
  description?: string;
  cardDescription?: string;
  personality?: string;
  speakingStyle?: string;
  boundaries?: string;
  catchphrases: string[];
  backstory?: string;
  worldView?: string;
  eraBackground?: string;
  rules?: string;
  coreConflicts?: string;
  exampleDialogues?: string;
  conversationStyle?: string;
  replySettings?: string;
}

/** 引擎规范角色卡（三游戏共用·normalizeCharacterCard 的产物）。 */
export interface ZeroCraftCharacterCard {
  /** 稳定 id（对账键·opts.id ?? draft.id ?? name 回退）。 */
  id: string;
  /** 显示名（空=坏卡·isCardUsable 为 false）。 */
  name: string;
  gender?: string;
  kind?: string;
  media: CharacterMedia;
  persona: CharacterPersona;
  tags: string[];
  adultConfirmed: boolean;
  visibility?: string;
  backgroundPublic?: boolean;
  updatedAt?: string;
  /** 未消费字段 + 类型不符的已消费键原样保留（随 SessionOut 回传对账·只透传不消费）。 */
  passthrough: Record<string, unknown>;
}

/** 收敛过程中记录的问题（error=不可用硬伤·warn=可用但降级）。 */
export interface CardIssue {
  level: 'error' | 'warn';
  /** 出问题的字段名（用真实平台键名·空串=整卡级）。 */
  field: string;
  msg: string;
}

/** normalizeCharacterCard 选项。 */
export interface NormalizeOptions {
  /** 显式指定卡 id（优先级最高）。 */
  id?: string;
  /** 成年硬闸：为真时 adultConfirmed≠true 记 error（a/b/c 姨太题材必开）。 */
  requireAdult?: boolean;
  /** OssKey 解析器（无则仅 OssKey 的媒体源被弃并记 warn）。纯函数·不得有副作用。 */
  resolveOssKey?: (key: string) => string;
}

/** normalizeCharacterCard 的返回（绝不 throw·永远给出 card + issues）。 */
export interface NormalizeResult {
  card: ZeroCraftCharacterCard;
  issues: CardIssue[];
}

/** v1 席位卡投影（game-b 既有席位 adapter 零改动）。 */
export interface SeatCard {
  id: string;
  name: string;
  avatar?: string;
}
