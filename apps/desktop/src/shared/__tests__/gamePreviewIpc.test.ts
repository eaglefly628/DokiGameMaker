import { describe, expect, it } from 'vitest';

import {
  GAME_PREVIEW_DEV_PORT,
  GAME_PREVIEW_DEV_URL,
  isLoopbackHttpUrl,
} from '../gamePreviewIpc';

describe('GAME_PREVIEW_DEV_URL', () => {
  it('与引擎 vite.config.ts 的 strictPort 端口同形', () => {
    expect(GAME_PREVIEW_DEV_PORT).toBe(5180);
    expect(GAME_PREVIEW_DEV_URL).toBe('http://localhost:5180/');
    expect(isLoopbackHttpUrl(GAME_PREVIEW_DEV_URL)).toBe(true);
  });
});

describe('isLoopbackHttpUrl', () => {
  it('放行本机 loopback 的 http/https', () => {
    expect(isLoopbackHttpUrl('http://localhost:5180/')).toBe(true);
    expect(isLoopbackHttpUrl('http://127.0.0.1:5180/game')).toBe(true);
    expect(isLoopbackHttpUrl('http://[::1]:5180/')).toBe(true);
    expect(isLoopbackHttpUrl('https://localhost:5180/')).toBe(true);
  });

  it('拒绝非 loopback 主机 —— 预览必然在本机', () => {
    expect(isLoopbackHttpUrl('http://example.com/')).toBe(false);
    expect(isLoopbackHttpUrl('http://192.168.1.10:5180/')).toBe(false);
    // 同形前缀不算 loopback(localhost.evil.com 是别人的域名)。
    expect(isLoopbackHttpUrl('http://localhost.evil.com/')).toBe(false);
  });

  it('拒绝非 http(s) 协议与内嵌凭证', () => {
    expect(isLoopbackHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isLoopbackHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isLoopbackHttpUrl('http://user:pass@localhost:5180/')).toBe(false);
  });

  it('拒绝无法解析的字符串', () => {
    expect(isLoopbackHttpUrl('')).toBe(false);
    expect(isLoopbackHttpUrl('localhost:5180')).toBe(false);
  });
});
