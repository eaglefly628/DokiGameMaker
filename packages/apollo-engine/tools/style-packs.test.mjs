// 风格包库自检（REQ-STYLE-SWAP·owner 2026-07-22）：提示词按 kind 分层 + 本地命名风格预设库（校验/存/删）。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateStylePack, saveLocalStyle, deleteLocalStyle, readLocalStyles, listStylePacks, BUILTIN_PACKS } from './style-packs.mjs';
import { dialectPrompt } from './art-replace.mjs';

const GOOD = {
  packId: 'my-noir', name: '我的暗夜',
  promptZh: '暗夜霓虹配色，冷蓝紫，赛博', promptEn: 'noir neon palette, cold blue-violet, cyber',
  palette: [0x101018, 0x7d5570, 0xd8b878], params: { provider: 'seedream', model: 'doubao-seedream-5-0-pro-260628', seed: 42 },
  post: { paletteSnap: false }, negative: { zh: '写实', en: 'photoreal' },
};

describe('风格包 · 提示词按 kind 分层（修换皮把 UI 画成场景）', () => {
  const pack = {
    params: { provider: 'seedream', model: 'm' },
    promptZh: '场景：水晶吊灯，巴洛克画框，戏剧光', promptEn: 'scene: chandelier, baroque frames, dramatic light',
    uiPromptZh: '配色：鎏金，丝绒，孤立主体无场景', uiPromptEn: 'palette: gold, velvet, isolated no scene',
  };
  it('bg/splash → 含场景的 promptZh；sprite/texture/UI → uiPromptZh（无场景）', () => {
    expect(dialectPrompt({ kind: 'bg', query: 'x' }, pack)).toContain('水晶吊灯');
    expect(dialectPrompt({ kind: 'splash', query: 'x' }, pack)).toContain('巴洛克画框');
    expect(dialectPrompt({ kind: 'sprite', query: 'x' }, pack)).toContain('孤立主体无场景');
    expect(dialectPrompt({ kind: 'sprite', query: 'x' }, pack)).not.toContain('水晶吊灯');
    expect(dialectPrompt({ kind: 'texture', query: 'x' }, pack)).toContain('鎏金');
  });
  it('无 uiPrompt 变体 → 非场景 kind 回退 promptZh（零回归）', () => {
    const noUi = { params: { provider: 'seedream', model: 'm' }, promptZh: '基础风格', promptEn: 'base' };
    expect(dialectPrompt({ kind: 'sprite', query: 'x' }, noUi)).toContain('基础风格');
    expect(dialectPrompt({ kind: 'bg', query: 'x' }, noUi)).toContain('基础风格');
  });
});

describe('风格包 · 本地命名风格预设库', () => {
  it('validateStylePack：合法通过·缺字段逐条报错·provider 闭集', () => {
    expect(validateStylePack(GOOD).ok).toBe(true);
    expect(validateStylePack({ ...GOOD, packId: 'Bad ID' }).errors[0]).toContain('slug');
    expect(validateStylePack({ ...GOOD, params: { provider: 'midjourney', model: 'm' } }).ok).toBe(false);
    expect(validateStylePack({ ...GOOD, palette: [] }).ok).toBe(false);
    expect(validateStylePack({ ...GOOD, palette: [0x1000000] }).ok).toBe(false); // 越界色
  });

  it('saveLocalStyle → readLocalStyles 往返·打 local:true·归一化剥未知项', () => {
    const dir = mkdtempSync(join(tmpdir(), 'styles-'));
    const file = join(dir, '.apollo-styles.json');
    try {
      const r = saveLocalStyle({ ...GOOD, junk: 'DROP-ME' }, { file });
      expect(r.ok).toBe(true);
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      expect(raw['my-noir'].name).toBe('我的暗夜');
      expect('junk' in raw['my-noir']).toBe(false);       // 未知项剥掉
      expect(raw['my-noir'].local).toBe(true);
      expect(raw['my-noir'].params.provider).toBe('seedream');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('saveLocalStyle 拒绝非法风格（不写文件）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'styles-'));
    const file = join(dir, '.apollo-styles.json');
    try {
      const r = saveLocalStyle({ ...GOOD, promptEn: '' }, { file });
      expect(r.ok).toBe(false);
      expect(r.errors.some((e) => e.includes('promptEn'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('deleteLocalStyle：删本地成功·内置不可删·缺项报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'styles-'));
    const file = join(dir, '.apollo-styles.json');
    try {
      saveLocalStyle(GOOD, { file });
      expect(deleteLocalStyle('my-noir', { file }).ok).toBe(true);
      expect(deleteLocalStyle('my-noir', { file }).ok).toBe(false); // 已删
      const builtinId = Object.keys(BUILTIN_PACKS)[0];
      expect(deleteLocalStyle(builtinId, { file }).errors[0]).toContain('内置');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('listStylePacks：每条带 local 标位（内置=false）', () => {
    const list = listStylePacks();
    expect(list.length).toBeGreaterThanOrEqual(9);
    expect(list.every((p) => typeof p.local === 'boolean')).toBe(true);
    expect(list.find((p) => p.packId === 'vegas-victoriana').local).toBe(false);
  });
});
