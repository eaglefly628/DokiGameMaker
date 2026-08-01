import { describe, it, expect } from 'vitest';
import {
  metaToGameEntry, libSlug, providerStatus,
  LIB_DEFAULT_COLOR, LIB_DEFAULT_ACCENT,
  type LibraryEntry, type ProviderInfo,
} from './library-model.js';

// 创作台 v1 · 库数据模型纯函数单测（meta→GameEntry 映射 / provider 状态灯 / lib id 分流）。

describe('metaToGameEntry · meta.json → 卡带 GameEntry', () => {
  it('完整 meta：字段逐项映射，id 加 lib: 命名空间', () => {
    const entry: LibraryEntry = {
      slug: 'my-game',
      meta: {
        name: '我的游戏', subtitle: '副标', description: '一句话', color: '#123456',
        accentColor: '#abcdef', icon: '🎲', provider: 'anthropic',
      },
      valid: true,
      hasDesign: true,
    };
    expect(metaToGameEntry(entry)).toEqual({
      id: 'lib:my-game',
      title: '我的游戏',
      subtitle: '副标',
      description: '一句话',
      color: '#123456',
      accentColor: '#abcdef',
      icon: '🎲',
      status: 'playable',
      hasDesign: true,
      hasLogic: false,
    });
  });

  it('hasDesign 缺省 → false（无设计稿的老卡带）', () => {
    const entry: LibraryEntry = { slug: 'x', meta: {}, valid: true };
    expect(metaToGameEntry(entry).hasDesign).toBe(false);
  });

  it('hasLogic 透传（TS 例外卡带旗·owner 07-11）', () => {
    expect(metaToGameEntry({ slug: 'x', meta: {}, valid: true, hasLogic: true }).hasLogic).toBe(true);
    expect(metaToGameEntry({ slug: 'x', meta: {}, valid: true }).hasLogic).toBe(false);
  });

  it('缺省 meta：色/图标兜底为暗蓝 + 默认卡带图标，title 回退 slug', () => {
    const entry: LibraryEntry = { slug: 'untitled', meta: {}, valid: true };
    const g = metaToGameEntry(entry);
    expect(g.title).toBe('untitled');
    expect(g.subtitle).toBe('');
    expect(g.description).toBe('');
    expect(g.color).toBe(LIB_DEFAULT_COLOR);
    expect(g.accentColor).toBe(LIB_DEFAULT_ACCENT);
    expect(g.icon).toBe('🎴');
    expect(g.status).toBe('playable');
  });

  it('manifest 不可解析（valid=false）→ coming-soon（不可运行）', () => {
    const entry: LibraryEntry = { slug: 'broken', meta: { name: '坏了' }, valid: false };
    expect(metaToGameEntry(entry).status).toBe('coming-soon');
  });

  it('空白 name 视同缺省 → 回退 slug', () => {
    const entry: LibraryEntry = { slug: 'blank', meta: { name: '   ' }, valid: true };
    expect(metaToGameEntry(entry).title).toBe('blank');
  });
});

describe('libSlug · lib id 分流', () => {
  it('lib: 前缀 → slug', () => {
    expect(libSlug('lib:foo')).toBe('foo');
  });
  it('内置 game-* → null', () => {
    expect(libSlug('game-g')).toBeNull();
    expect(libSlug('game-e')).toBeNull();
  });
});

describe('providerStatus · 顶栏状态灯判定', () => {
  const P = (id: string, name: string, available: boolean): ProviderInfo => ({ id, name, available });

  it('任一云 provider 有 key → 绿·已连接·名字取第一个可用的', () => {
    const s = providerStatus([P('anthropic', 'Claude (Anthropic)', false), P('openai', 'OpenAI', true)]);
    expect(s.connected).toBe(true);
    expect(s.tone).toBe('ok');
    expect(s.label).toContain('已连接');
    expect(s.label).toContain('OpenAI');
  });

  it('全无 key → 琥珀·未配置', () => {
    const s = providerStatus([P('anthropic', 'Claude (Anthropic)', false)]);
    expect(s.connected).toBe(false);
    expect(s.tone).toBe('warn');
    expect(s.label).toBe('未配置 API Key');
  });

  it('仅 local(Ollama) available → 仍琥珀（本地不需要 key ≠ 真在跑·Lead 验收缺陷 #3）', () => {
    const s = providerStatus([
      P('local', 'Local (Ollama)', true),
      P('anthropic', 'Claude (Anthropic)', false),
    ]);
    expect(s.connected).toBe(false);
    expect(s.tone).toBe('warn');
    expect(s.label).toBe('未配置 API Key');
  });

  it('local available + 云 provider 有 key → 绿·名字取云的（跳过 local）', () => {
    const s = providerStatus([
      P('local', 'Local (Ollama)', true),
      P('deepseek', 'DeepSeek', true),
    ]);
    expect(s.connected).toBe(true);
    expect(s.label).toContain('DeepSeek');
  });

  it('空列表 → 琥珀·未配置', () => {
    expect(providerStatus([]).tone).toBe('warn');
  });
});
