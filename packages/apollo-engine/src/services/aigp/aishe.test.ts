import { describe, it, expect } from 'vitest';
import { NullAishePort, HttpAishePort } from './index.js';

describe('AIGP NullAishePort（REQ-C-004，表现层旁路）', () => {
  it('即时返回 ready 占位句柄，回显提示词，记录日志', async () => {
    const port = new NullAishePort();
    const h = await port.generate('a knight in silver armor, 9:16', { aspect: '9:16' });
    expect(h.status).toBe('ready');
    expect(h.prompt).toContain('silver armor');
    expect(h.url).toBeTruthy();
    expect(port.log).toHaveLength(1);
  });

  it('句柄 id 自增（确定性，可复现）', async () => {
    const port = new NullAishePort();
    const a = await port.generate('p1');
    const b = await port.generate('p2');
    expect(a.id).not.toBe(b.id);
  });
});

describe('AIGP HttpAishePort — 注入 fetch（provider 无关骨架）', () => {
  it('POST 提示词与选项，解析回视频句柄', async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const fakeFetch: typeof fetch = async (input, init) => {
      captured = { url: String(input), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ id: 'vid_1', url: 'https://cdn/v.mp4', status: 'ready' }), { status: 200 });
    };
    const port = new HttpAishePort({ endpoint: 'https://api/gen', apiKey: 'k', fetchImpl: fakeFetch });
    const h = await port.generate('prompt here', { aspect: '9:16', seed: 7 });
    expect(h.status).toBe('ready');
    expect(h.url).toBe('https://cdn/v.mp4');
    expect(captured?.body.prompt).toBe('prompt here');
    expect(captured?.body.seed).toBe(7);
  });

  it('HTTP 非 2xx → error 句柄（不抛，sim 不受后端故障影响）', async () => {
    const fakeFetch: typeof fetch = async () => new Response(null, { status: 500 });
    const port = new HttpAishePort({ endpoint: 'x', fetchImpl: fakeFetch });
    const h = await port.generate('p');
    expect(h.status).toBe('error');
  });
});
