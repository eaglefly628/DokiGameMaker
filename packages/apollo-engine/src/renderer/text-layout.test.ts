import { describe, it, expect } from 'vitest';
import { wrapLines } from './text-layout.js';

// 假 measure：每字符宽 10px（拉丁与 CJK 统一），便于精确断言。
const measure = (s: string) => s.length * 10;

describe('text-layout · wrapLines', () => {
  it('maxWidth<=0 → 只按 \\n 硬换行', () => {
    expect(wrapLines('a\nbb\nccc', 0, measure)).toEqual(['a', 'bb', 'ccc']);
  });

  it('硬换行 + 自动换行叠加', () => {
    // 每行最多 3 字符（30px）
    expect(wrapLines('abcdef\nxy', 30, measure)).toEqual(['abc', 'def', 'xy']);
  });

  it('拉丁文优先在空格断词', () => {
    // 'hello world' maxWidth=60(6字符) → 'hello'(5) 放下,'world' 换行
    expect(wrapLines('hello world', 60, measure)).toEqual(['hello', 'world']);
  });

  it('超宽单词按字符断', () => {
    expect(wrapLines('abcdefgh', 30, measure)).toEqual(['abc', 'def', 'gh']);
  });

  it('CJK 无空格按字符换行', () => {
    expect(wrapLines('你就是新来的制作人', 30, measure)).toEqual(['你就是', '新来的', '制作人']);
  });

  it('空串 → 单空行', () => {
    expect(wrapLines('', 30, measure)).toEqual(['']);
  });
});
