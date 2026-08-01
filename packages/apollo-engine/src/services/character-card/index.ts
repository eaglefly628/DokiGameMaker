// 平台角色卡桥服务（REQ-CHARCARD·三游戏共用·外部数据桥·纯确定性）。
// 消费：SessionIn 席位拿到平台 CharacterDraft → normalizeCharacterCard → 游戏侧投影（toSeatCard 等）。
// 手册：docs/playbooks/character-card.md。红线：媒体不进 sim hash；卡文本=外部不可信输入。
export {
  normalizeCharacterCard,
  toSeatCard,
  isCardUsable,
} from './character-card.js';
export type {
  PlatformCharacterDraft,
  CharacterMedia,
  CharacterPersona,
  ZeroCraftCharacterCard,
  CardIssue,
  NormalizeOptions,
  NormalizeResult,
  SeatCard,
} from './types.js';
