// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPlayerProfile, normalizePlayerProfile, PLAYER_PROFILE_KEY } from './index.js';

describe('PlayerProfile 只读通道（REQ-C-104·共享角色卡 v1）', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals(); // 先还原（headless 用例把 localStorage 存根为 undefined）再清，避免清空时崩
    localStorage.clear();
  });

  it('往返：launcher 写 {name, avatarUrl} → getPlayerProfile 原样读回', () => {
    localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify({ name: '夜華', avatarUrl: '🦊' }));
    expect(getPlayerProfile()).toEqual({ name: '夜華', avatarUrl: '🦊' });
  });

  it('无档（键不存在）→ null', () => {
    expect(getPlayerProfile()).toBeNull();
  });

  it('坏档（JSON 解析失败）→ null，绝不抛', () => {
    localStorage.setItem(PLAYER_PROFILE_KEY, '{ 这不是合法 json');
    expect(() => getPlayerProfile()).not.toThrow();
    expect(getPlayerProfile()).toBeNull();
  });

  it('坏档（缺有效 name：空串/非串/非对象）→ null', () => {
    expect(normalizePlayerProfile({ avatarUrl: '🦊' })).toBeNull(); // 缺 name
    expect(normalizePlayerProfile({ name: '   ' })).toBeNull(); // 空白 name
    expect(normalizePlayerProfile({ name: 42 })).toBeNull(); // name 非串
    expect(normalizePlayerProfile('绫')).toBeNull(); // 非对象
    expect(normalizePlayerProfile(null)).toBeNull();
  });

  it('headless / 无 localStorage → null（不抛）', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => getPlayerProfile()).not.toThrow();
    expect(getPlayerProfile()).toBeNull();
  });

  it('name 首尾空白被裁剪；avatarUrl 非串时静默丢弃（不废整档）', () => {
    localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify({ name: '  主角  ', avatarUrl: 123 }));
    expect(getPlayerProfile()).toEqual({ name: '主角' });
  });

  it('兼容共享卡格式 v1 的 avatar 字段（外部按 §0 写卡）→ 归一到 avatarUrl', () => {
    expect(normalizePlayerProfile({ name: '绫', avatar: 'art:cards/aya/avatar' }))
      .toEqual({ name: '绫', avatarUrl: 'art:cards/aya/avatar' });
  });
});
