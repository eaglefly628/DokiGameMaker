// 平台角色卡桥 · 收敛实现（REQ-CHARCARD·纯确定性：零网络/零时钟/零随机）。
// 同输入 → 深等输出；绝不 throw（脏输入全部收进 issues，仍产出可检视的 card）。
// 媒体键=平台真格式的平铺键（imageUrl/imageDataUrl/imageOssKey/avatar*/animation*）。

import type {
  ZeroCraftCharacterCard,
  CardIssue,
  CharacterMedia,
  CharacterPersona,
  NormalizeOptions,
  NormalizeResult,
  SeatCard,
} from './types.js';

/** persona 段的纯文本字段（逐个 trim·空串丢弃）。 */
const PERSONA_STR_FIELDS = [
  'opening',
  'description',
  'cardDescription',
  'personality',
  'speakingStyle',
  'boundaries',
  'backstory',
  'worldView',
  'eraBackground',
  'rules',
  'coreConflicts',
  'exampleDialogues',
  'conversationStyle',
  'replySettings',
] as const;

/** 平铺媒体字符串键（全部消费；imageMode 不在此列 → 进 passthrough）。 */
const MEDIA_STR_KEYS = [
  'imageUrl',
  'imageDataUrl',
  'imageOssKey',
  'imageName',
  'avatarUrl',
  'avatarDataUrl',
  'avatarOssKey',
  'animationUrl',
  'animationDataUrl',
  'animationOssKey',
  'animationName',
] as const;

/**
 * 已消费进规范卡的顶层键集合——其余键（imageMode/format/moreSettings/未知字段）原样进 passthrough。
 * 这样 SessionOut 能把平台自留字段完整带回（只透传不消费）。
 */
const CONSUMED_KEYS: ReadonlySet<string> = new Set<string>([
  'id',
  'name',
  'gender',
  'kind',
  ...PERSONA_STR_FIELDS,
  'catchphrases',
  'tags',
  'adultConfirmed',
  'visibility',
  'backgroundPublic',
  'updatedAt',
  ...MEDIA_STR_KEYS,
]);

/**
 * 把平台角色卡草稿收敛为引擎规范卡。**绝不 throw**——所有问题进 issues。
 * 纯确定性：零网络/零时钟/零随机；同输入深等输出。
 */
export function normalizeCharacterCard(
  input: unknown,
  opts: NormalizeOptions = {},
): NormalizeResult {
  const issues: CardIssue[] = [];
  const passthrough: Record<string, unknown> = {};
  const isObj = !!input && typeof input === 'object' && !Array.isArray(input);
  if (!isObj) {
    issues.push({ level: 'error', field: '', msg: '角色卡输入非对象' });
  }
  const draft = (isObj ? input : {}) as Record<string, unknown>;

  // —— 类型安全读取器（已消费键类型不符 → 原值转存 passthrough + warn·不静默丢弃）——
  const readString = (key: string): string | undefined => {
    const v = draft[key];
    if (v === undefined) return undefined;
    if (typeof v === 'string') {
      const t = v.trim();
      return t ? t : undefined;
    }
    passthrough[key] = v;
    issues.push({ level: 'warn', field: key, msg: `期望字符串，实际 ${typeof v}，原值转存 passthrough` });
    return undefined;
  };
  const readStringArray = (key: string): string[] => {
    const v = draft[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      passthrough[key] = v;
      issues.push({ level: 'warn', field: key, msg: `期望数组，实际 ${typeof v}，原值转存 passthrough` });
      return [];
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of v) {
      const s = typeof item === 'string' ? item.trim() : '';
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  };
  const readBool = (key: string): boolean | undefined => {
    const v = draft[key];
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    passthrough[key] = v;
    issues.push({ level: 'warn', field: key, msg: `期望布尔，实际 ${typeof v}，原值转存 passthrough` });
    return undefined;
  };

  // —— name（error：空）——
  const name = readString('name');
  if (!name) issues.push({ level: 'error', field: 'name', msg: 'name 为空' });

  // —— 成年硬闸 ——
  const adultConfirmed = readBool('adultConfirmed') === true;
  if (opts.requireAdult && !adultConfirmed) {
    issues.push({
      level: 'error',
      field: 'adultConfirmed',
      msg: '成年确认硬闸未通过（requireAdult）',
    });
  }

  // —— id（opts.id > draft.id > name·回退记 warn）——
  const draftId = readString('id');
  let id: string;
  if (opts.id) {
    id = opts.id;
  } else if (draftId) {
    id = draftId;
  } else {
    id = name ?? '';
    issues.push({ level: 'warn', field: 'id', msg: 'id 缺失，回退用 name' });
  }

  // —— 媒体三槽·平铺键取优（Url > DataUrl > OssKey；仅 OssKey 无解析器/解析空/抛错 → 弃 + warn）——
  const resolveSlot = (urlKey: string, dataKey: string, ossKeyName: string): string | undefined => {
    const url = readString(urlKey);
    if (url) return url;
    const dataUrl = readString(dataKey);
    if (dataUrl) return dataUrl;
    const oss = readString(ossKeyName);
    if (!oss) return undefined;
    if (!opts.resolveOssKey) {
      issues.push({ level: 'warn', field: ossKeyName, msg: '仅 OssKey 无解析器，媒体源丢弃' });
      return undefined;
    }
    let resolved: string | undefined;
    try {
      const r = opts.resolveOssKey(oss); // 只调一次（解析器可能有观测副作用）
      resolved = typeof r === 'string' && r.trim() ? r.trim() : undefined;
    } catch {
      resolved = undefined; // 解析器异常也不炸 normalize
    }
    if (resolved) return resolved;
    issues.push({ level: 'warn', field: ossKeyName, msg: 'OssKey 解析为空，媒体源丢弃' });
    return undefined;
  };

  const avatarUrl = resolveSlot('avatarUrl', 'avatarDataUrl', 'avatarOssKey');
  const imageUrl = resolveSlot('imageUrl', 'imageDataUrl', 'imageOssKey');
  const animationUrl = resolveSlot('animationUrl', 'animationDataUrl', 'animationOssKey');
  if (!avatarUrl && !imageUrl && !animationUrl) {
    issues.push({ level: 'warn', field: 'media', msg: '零头像媒体' });
  }

  const media: CharacterMedia = {};
  if (avatarUrl) media.avatarUrl = avatarUrl;
  if (imageUrl) media.imageUrl = imageUrl;
  if (animationUrl) media.animationUrl = animationUrl;
  const imageName = readString('imageName');
  const animationName = readString('animationName');
  if (imageName) media.imageName = imageName;
  if (animationName) media.animationName = animationName;

  // —— persona ——
  const persona: CharacterPersona = { catchphrases: readStringArray('catchphrases') };
  for (const f of PERSONA_STR_FIELDS) {
    const s = readString(f);
    if (s) persona[f] = s;
  }

  // —— passthrough：未消费键原样保留（类型不符的已消费键上面已转存）——
  for (const k of Object.keys(draft)) {
    if (!CONSUMED_KEYS.has(k) && !(k in passthrough)) passthrough[k] = draft[k];
  }

  // —— 组卡 ——
  const card: ZeroCraftCharacterCard = {
    id,
    name: name ?? '',
    media,
    persona,
    tags: readStringArray('tags'),
    adultConfirmed,
    passthrough,
  };
  const gender = readString('gender');
  const kind = readString('kind');
  const visibility = readString('visibility');
  const updatedAt = readString('updatedAt');
  const backgroundPublic = readBool('backgroundPublic');
  if (gender) card.gender = gender;
  if (kind) card.kind = kind;
  if (visibility) card.visibility = visibility;
  if (backgroundPublic !== undefined) card.backgroundPublic = backgroundPublic;
  if (updatedAt) card.updatedAt = updatedAt;

  return { card, issues };
}

/** v1 席位卡投影：{id,name,avatar}（avatar 取头像·退回主图）。game-b 席位 adapter 零改动。 */
export function toSeatCard(card: ZeroCraftCharacterCard): SeatCard {
  const seat: SeatCard = { id: card.id, name: card.name };
  const avatar = card.media.avatarUrl ?? card.media.imageUrl;
  if (avatar) seat.avatar = avatar;
  return seat;
}

/** 卡是否可用 = 零 error（warn 不影响可用）。 */
export function isCardUsable(result: NormalizeResult): boolean {
  return !result.issues.some((i) => i.level === 'error');
}
