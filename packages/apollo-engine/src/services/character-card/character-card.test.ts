import { describe, it, expect } from 'vitest';
import {
  normalizeCharacterCard,
  toSeatCard,
  isCardUsable,
  type PlatformCharacterDraft,
} from './index.js';

// 满卡 fixture（平台真格式·媒体键全部平铺）。
const fullDraft: PlatformCharacterDraft = {
  id: 'card-001',
  name: '  夜華  ',
  gender: '女',
  kind: '姨太',
  opening: '你来了。',
  cardDescription: '牌桌上的旧相识。',
  description: '一位深藏心事的女子。',
  personality: '冷静·记仇',
  speakingStyle: '古雅',
  boundaries: '不谈政治',
  catchphrases: ['哼', '有意思', '哼'], // 含重复
  backstory: '曾是名门之后。',
  worldView: '民国旧都。',
  eraBackground: '1930s',
  rules: '愿赌服输。',
  coreConflicts: '爱恨情仇。',
  exampleDialogues: 'A：你输了。B：未必。',
  conversationStyle: '含蓄',
  replySettings: '慢热',
  tags: ['麻将', '民国', '麻将'], // 含重复
  adultConfirmed: true,
  visibility: 'public',
  backgroundPublic: true,
  moreSettings: { theme: 'noir' },
  updatedAt: '2026-07-18T00:00:00Z',
  format: 'v2',
  // 平铺媒体键
  imageMode: 'upload',
  imageUrl: 'https://cdn/img.png',
  avatarUrl: 'https://cdn/ava.png',
  animationDataUrl: 'data:anim', // 无 animationUrl → 退到 DataUrl
  imageName: '立绘A',
  animationName: '待机',
};

// 空卡 fixture（owner 截图 emptyCharacterDraft 逐键同构·全 36 键平铺·顺序与值照原图）。
const emptyCharacterDraft: PlatformCharacterDraft = {
  name: '',
  gender: '',
  kind: '角色',
  format: '文本',
  opening: '',
  cardDescription: '',
  description: '',
  backgroundPublic: true,
  visibility: 'public',
  imageMode: 'upload',
  imageDataUrl: '',
  avatarDataUrl: '',
  imageName: '',
  personality: '',
  speakingStyle: '',
  boundaries: '',
  catchphrases: [],
  backstory: '',
  worldView: '',
  eraBackground: '',
  rules: '',
  coreConflicts: '',
  imageUrl: '',
  avatarUrl: '',
  imageOssKey: '',
  avatarOssKey: '',
  animationDataUrl: '',
  animationName: '',
  animationOssKey: '',
  tags: [],
  moreSettings: false,
  conversationStyle: 'default',
  exampleDialogues: '',
  replySettings: '',
  adultConfirmed: false,
  updatedAt: '',
};

describe('normalizeCharacterCard · 满卡（平铺媒体）', () => {
  it('全字段落位·文本 trim·数组滤重保序·媒体平铺取优', () => {
    const { card, issues } = normalizeCharacterCard(fullDraft, { requireAdult: true });
    expect(isCardUsable({ card, issues })).toBe(true);
    expect(issues).toEqual([]); // 满卡零 issue（含头像、id、成年皆齐）
    expect(card.id).toBe('card-001');
    expect(card.name).toBe('夜華');
    expect(card.gender).toBe('女');
    expect(card.kind).toBe('姨太');
    expect(card.persona.opening).toBe('你来了。');
    expect(card.persona.catchphrases).toEqual(['哼', '有意思']); // 去重保序
    expect(card.persona.replySettings).toBe('慢热');
    expect(card.tags).toEqual(['麻将', '民国']); // 去重保序
    expect(card.adultConfirmed).toBe(true);
    expect(card.visibility).toBe('public');
    expect(card.backgroundPublic).toBe(true);
    expect(card.updatedAt).toBe('2026-07-18T00:00:00Z');
    expect(card.media).toEqual({
      avatarUrl: 'https://cdn/ava.png',
      imageUrl: 'https://cdn/img.png',
      animationUrl: 'data:anim', // 无 animationUrl → 退 DataUrl
      imageName: '立绘A',
      animationName: '待机',
    });
    // imageMode/moreSettings/format=未消费 → passthrough
    expect(card.passthrough).toEqual({ imageMode: 'upload', moreSettings: { theme: 'noir' }, format: 'v2' });
  });
});

describe('normalizeCharacterCard · 空卡（emptyCharacterDraft·36 键平铺）', () => {
  it('夹具恰 36 键平铺（结构守卫）', () => {
    expect(Object.keys(emptyCharacterDraft)).toHaveLength(36);
  });

  it('name 空 → error·id 回退 warn·零头像 warn·非空默认值落规范卡（不 throw）', () => {
    const { card, issues } = normalizeCharacterCard(emptyCharacterDraft);
    expect(isCardUsable({ card, issues })).toBe(false); // name 空 = 不可用
    expect(issues.some((i) => i.level === 'error' && i.field === 'name')).toBe(true);
    expect(issues.some((i) => i.level === 'warn' && i.field === 'id')).toBe(true);
    expect(issues.some((i) => i.level === 'warn' && i.field === 'media')).toBe(true);
    expect(card.name).toBe('');
    expect(card.id).toBe(''); // 无 name 可回退 → 空串
    expect(card.media).toEqual({});
    expect(card.persona.catchphrases).toEqual([]);
    expect(card.tags).toEqual([]);
    // 非空默认值照样落进规范卡（截图默认非空的键）
    expect(card.kind).toBe('角色');
    expect(card.visibility).toBe('public');
    expect(card.backgroundPublic).toBe(true);
    expect(card.persona.conversationStyle).toBe('default');
    // passthrough 恰含 imageMode/format/moreSettings 三键（空媒体字符串键不污染·此不变量不动）
    expect(card.passthrough).toEqual({ imageMode: 'upload', format: '文本', moreSettings: false });
    expect(Object.keys(card.passthrough).sort()).toEqual(['format', 'imageMode', 'moreSettings']);
  });

  it('非对象/数组/null 输入 → error 非对象·不 throw', () => {
    for (const bad of ['夜華', 42, null, undefined, ['a']]) {
      const res = normalizeCharacterCard(bad as unknown);
      expect(res.issues.some((i) => i.level === 'error' && i.field === '')).toBe(true);
      expect(isCardUsable(res)).toBe(false);
      expect(res.card.name).toBe('');
    }
  });
});

describe('normalizeCharacterCard · 媒体取优矩阵（平铺键）', () => {
  it('avatarUrl > avatarDataUrl > avatarOssKey：三者齐时取 Url', () => {
    const { card } = normalizeCharacterCard({
      name: 'x',
      avatarUrl: 'u',
      avatarDataUrl: 'd',
      avatarOssKey: 'k',
    });
    expect(card.media.avatarUrl).toBe('u');
  });

  it('无 avatarUrl 时取 avatarDataUrl', () => {
    const { card } = normalizeCharacterCard({ name: 'x', avatarDataUrl: 'd', avatarOssKey: 'k' });
    expect(card.media.avatarUrl).toBe('d');
  });

  it('animation 槽容忍 animationUrl 优先（平台无此键·宽容读）', () => {
    const { card } = normalizeCharacterCard({ name: 'x', animationUrl: 'au', animationDataUrl: 'ad' });
    expect(card.media.animationUrl).toBe('au');
  });

  it('仅 avatarOssKey + 有解析器 → 解析地址', () => {
    const { card, issues } = normalizeCharacterCard(
      { name: 'x', avatarOssKey: 'oss://a' },
      { resolveOssKey: (k) => `https://cdn/${k}` },
    );
    expect(card.media.avatarUrl).toBe('https://cdn/oss://a');
    expect(issues.some((i) => i.field === 'avatarOssKey')).toBe(false);
  });

  it('仅 avatarOssKey + 无解析器 → 弃 + warn（field=真实键名）', () => {
    const { card, issues } = normalizeCharacterCard({ name: 'x', avatarOssKey: 'oss://a' });
    expect(card.media.avatarUrl).toBeUndefined();
    expect(issues.some((i) => i.level === 'warn' && i.field === 'avatarOssKey')).toBe(true);
  });

  it('解析器抛异常 → 不炸 normalize·媒体弃 + warn', () => {
    const { card, issues } = normalizeCharacterCard(
      { name: 'x', imageOssKey: 'k' },
      {
        resolveOssKey: () => {
          throw new Error('boom');
        },
      },
    );
    expect(card.media.imageUrl).toBeUndefined();
    expect(issues.some((i) => i.field === 'imageOssKey')).toBe(true);
  });
});

describe('normalizeCharacterCard · 成年硬闸', () => {
  it('requireAdult 开 + adultConfirmed 非 true → error', () => {
    const res = normalizeCharacterCard({ name: 'x', adultConfirmed: false }, { requireAdult: true });
    expect(res.issues.some((i) => i.level === 'error' && i.field === 'adultConfirmed')).toBe(true);
    expect(isCardUsable(res)).toBe(false);
  });

  it('requireAdult 开 + adultConfirmed=true → 通过', () => {
    const res = normalizeCharacterCard({ name: 'x', adultConfirmed: true }, { requireAdult: true });
    expect(res.issues.some((i) => i.field === 'adultConfirmed')).toBe(false);
  });

  it('requireAdult 关 → 不校验成年（默认放行）', () => {
    const res = normalizeCharacterCard({ name: 'x', adultConfirmed: false });
    expect(res.issues.some((i) => i.field === 'adultConfirmed')).toBe(false);
  });
});

describe('normalizeCharacterCard · 宽容读 & passthrough', () => {
  it('未识别字段原样进 passthrough', () => {
    const { card } = normalizeCharacterCard({ name: 'x', tattoo: 'dragon', extra: { a: 1 } });
    expect(card.passthrough).toEqual({ tattoo: 'dragon', extra: { a: 1 } });
  });

  it('opts.id 优先于 draft.id·draft.id 优先于 name', () => {
    expect(normalizeCharacterCard({ name: 'n', id: 'd' }, { id: 'o' }).card.id).toBe('o');
    expect(normalizeCharacterCard({ name: 'n', id: 'd' }).card.id).toBe('d');
    const nameFallback = normalizeCharacterCard({ name: 'n' });
    expect(nameFallback.card.id).toBe('n');
    expect(nameFallback.issues.some((i) => i.field === 'id')).toBe(true); // 回退记 warn
  });
});

describe('normalizeCharacterCard · 类型不符 → passthrough + warn（Lead 裁决·不静默丢弃）', () => {
  it('replySettings 为对象 → 原值进 passthrough + warn·不入 persona', () => {
    const { card, issues } = normalizeCharacterCard({ name: 'x', replySettings: { a: 1 } });
    expect(card.persona.replySettings).toBeUndefined();
    expect(card.passthrough.replySettings).toEqual({ a: 1 });
    expect(issues.some((i) => i.level === 'warn' && i.field === 'replySettings')).toBe(true);
  });

  it('catchphrases 非数组 → 原值进 passthrough + warn·persona 退空数组', () => {
    const { card, issues } = normalizeCharacterCard({ name: 'x', catchphrases: '哼' });
    expect(card.persona.catchphrases).toEqual([]);
    expect(card.passthrough.catchphrases).toBe('哼');
    expect(issues.some((i) => i.level === 'warn' && i.field === 'catchphrases')).toBe(true);
  });

  it('name 为数字 → 原值进 passthrough + warn·并触发 name 空 error', () => {
    const { card, issues } = normalizeCharacterCard({ name: 42 });
    expect(card.name).toBe('');
    expect(card.passthrough.name).toBe(42);
    expect(issues.some((i) => i.level === 'warn' && i.field === 'name')).toBe(true);
    expect(issues.some((i) => i.level === 'error' && i.field === 'name')).toBe(true);
  });

  it('adultConfirmed 非布尔 → 原值进 passthrough + warn·当未确认（requireAdult 下 error）', () => {
    const res = normalizeCharacterCard({ name: 'x', adultConfirmed: 'true' }, { requireAdult: true });
    expect(res.card.adultConfirmed).toBe(false);
    expect(res.card.passthrough.adultConfirmed).toBe('true');
    expect(res.issues.some((i) => i.level === 'warn' && i.field === 'adultConfirmed')).toBe(true);
    expect(res.issues.some((i) => i.level === 'error' && i.field === 'adultConfirmed')).toBe(true);
  });
});

describe('normalizeCharacterCard · 确定性', () => {
  it('同输入两次深等输出', () => {
    const a = normalizeCharacterCard(fullDraft, { requireAdult: true });
    const b = normalizeCharacterCard(fullDraft, { requireAdult: true });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // 键序也稳定
  });
});

describe('toSeatCard · v1 投影兼容', () => {
  it('{id,name,avatar}·avatar 取头像', () => {
    const { card } = normalizeCharacterCard(fullDraft, { requireAdult: true });
    expect(toSeatCard(card)).toEqual({ id: 'card-001', name: '夜華', avatar: 'https://cdn/ava.png' });
  });

  it('无头像退回主图', () => {
    const { card } = normalizeCharacterCard({ name: 'x', imageUrl: 'img' });
    expect(toSeatCard(card)).toEqual({ id: 'x', name: 'x', avatar: 'img' });
  });

  it('零媒体 → 无 avatar 字段', () => {
    const { card } = normalizeCharacterCard({ name: 'x' });
    expect(toSeatCard(card)).toEqual({ id: 'x', name: 'x' });
  });
});
