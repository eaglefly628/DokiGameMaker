// REQ-UI-emoji图渲：文本里的 emoji 字形 → 库里美术图（render-only·纯函数）。
// 验：① 码点解析与 PA emoji-resolve 一致（cpName/alias）② emojifyHtml 只在配 base 时替换、否则零回归
//    ③ renderNode 集成（Button/Label/spans/Tag/Badge 显示文本自动图渲）④ raw 逃生保字形 ⑤ 非 emoji 零变。
import { describe, it, expect } from 'vitest';
import { renderNode } from './index.js';
import { cpName, SYMBOL_ALIAS, emojifyHtml, hasEmoji } from './emoji.js';
import type { UITheme, LayoutNode } from './types.js';
import { SHELL } from '../shell-theme.js';

const T = (extra: Partial<UITheme> = {}): UITheme => ({ ...SHELL, ...extra });
const EMOJI = T({ emoji: { base: '/games/game-i/art/emoji' } });

describe('emoji · 码点解析（与 PA emoji-resolve cpName 严丝合缝）', () => {
  it('单码点 emoji → 16 进制文件名', () => {
    expect(cpName('⚔')).toBe('2694');
    expect(cpName('🎮')).toBe('1f3ae');
    expect(cpName('💎')).toBe('1f48e');
  });
  it('滤 U+FE0F 变体选择符（库文件名不含 fe0f）', () => {
    expect(cpName('⚔️')).toBe('2694'); // ⚔ + VS16 → 只 2694
    expect(cpName('❤️')).toBe('2764');
  });
  it('多码点 ZWJ 连字：保 200d、码点 - 连（同 Twemoji 文件名·同 PA cpName）', () => {
    expect(cpName('👨‍👩‍👧')).toBe('1f468-200d-1f469-200d-1f467'); // 只滤 fe0f、200d 保留
  });
  it('SYMBOL_ALIAS 与渲染端镜像一致（★→⭐ 等）', () => {
    expect(SYMBOL_ALIAS['2605']).toBe('2b50');
    expect(SYMBOL_ALIAS['266a']).toBe('1f3b5');
  });
});

describe('emoji · emojifyHtml（纯替换）', () => {
  it('未配 base → 原样返回（零回归）', () => {
    expect(emojifyHtml('开始 🎮 战斗', undefined)).toBe('开始 🎮 战斗');
    expect(emojifyHtml('开始 🎮 战斗', { base: '' })).toBe('开始 🎮 战斗');
  });
  it('配 base → emoji 字形替成 <img src=`base/<cp>.png`>、非 emoji 文本保留', () => {
    const out = emojifyHtml('开始 🎮 战斗', { base: '/e' });
    expect(out).toContain('开始 ');
    expect(out).toContain(' 战斗');
    expect(out).toContain('<img src="/e/1f3ae.png"');
    expect(out).toContain('alt="🎮"');
    expect(out).toContain('class="apollo-emoji"');
  });
  it('alias 符号（★）走静态映射到 ⭐ 的码点', () => {
    expect(emojifyHtml('★', { base: '/e' })).toContain('src="/e/2b50.png"');
  });
  it('VS16 emoji 用滤 fe0f 后的文件名', () => {
    expect(emojifyHtml('⚔️', { base: '/e' })).toContain('src="/e/2694.png"');
  });
  it('多个 emoji 全替、纯文本零 img', () => {
    const out = emojifyHtml('🎮💎🏆', { base: '/e' });
    expect(out.match(/<img /g)?.length).toBe(3);
    expect(emojifyHtml('纯中文与 ASCII abc 123', { base: '/e' })).toBe('纯中文与 ASCII abc 123');
  });
  it('尾部斜杠归一 + size 令牌生效', () => {
    const out = emojifyHtml('🎮', { base: '/e/', size: '24px' });
    expect(out).toContain('src="/e/1f3ae.png"');
    expect(out).toContain('height:24px;width:24px');
  });
  it('裸 ASCII 数字/井号不误转（只匹配图形符+alias）', () => {
    expect(hasEmoji('12345 #tag *star')).toBe(false);
    expect(emojifyHtml('12345 #tag', { base: '/e' })).toBe('12345 #tag');
  });
  it('base 防属性越狱（剥引号/尖括号）', () => {
    expect(emojifyHtml('🎮', { base: '/e"><script>' })).not.toContain('"><script>');
  });
});

describe('emoji · renderNode 集成（显示文本自动图渲）', () => {
  it('Button.label 里的 emoji → img（配 theme.emoji）', () => {
    const n: LayoutNode = { id: 'b', type: 'Button', props: { label: '🎮 开始', kind: 'primary' } };
    expect(renderNode(n, EMOJI)).toContain('src="/games/game-i/art/emoji/1f3ae.png"');
  });
  it('Label.text 里的 emoji → img', () => {
    const n: LayoutNode = { id: 'l', type: 'Label', props: { text: '💎 商店' } };
    expect(renderNode(n, EMOJI)).toContain('src="/games/game-i/art/emoji/1f48e.png"');
  });
  it('Label.spans 段文本里的 emoji → img', () => {
    const n: LayoutNode = { id: 'l', type: 'Label', props: { spans: [{ text: '🏆 排行', color: 'gold' }] } };
    expect(renderNode(n, EMOJI)).toContain('src="/games/game-i/art/emoji/1f3c6.png"');
  });
  it('Tag / Badge label 里的 emoji → img', () => {
    const tag: LayoutNode = { id: 't', type: 'Tag', props: { label: '⚔️ 对战' } };
    const badge: LayoutNode = { id: 'g', type: 'Badge', props: { text: '🔥 热' } };
    expect(renderNode(tag, EMOJI)).toContain('src="/games/game-i/art/emoji/2694.png"');
    expect(renderNode(badge, EMOJI)).toContain('src="/games/game-i/art/emoji/1f525.png"');
  });
  it('Label.raw=true → 保留 emoji 字形不图渲（逃生）', () => {
    const n: LayoutNode = { id: 'l', type: 'Label', props: { text: '🎮 代码块', raw: true } };
    const out = renderNode(n, EMOJI);
    expect(out).not.toContain('<img');
    expect(out).toContain('🎮 代码块');
  });
  it('未配 theme.emoji → 字节与从前一致（零回归·emoji 保字形）', () => {
    const n: LayoutNode = { id: 'b', type: 'Button', props: { label: '🎮 开始', kind: 'primary' } };
    const out = renderNode(n, T()); // SHELL 无 emoji 配置
    expect(out).not.toContain('<img');
    expect(out).toContain('🎮 开始');
  });
  it('HTML 属性（action）里的类 emoji 参数不受影响（只转显示文本）', () => {
    const n: LayoutNode = { id: 'b', type: 'Button', props: { label: 'go', action: 'buy', actionArg: '🎮' } };
    const out = renderNode(n, EMOJI);
    expect(out).toContain('data-arg="🎮"'); // 属性保原样、不塞 <img>
  });
});
