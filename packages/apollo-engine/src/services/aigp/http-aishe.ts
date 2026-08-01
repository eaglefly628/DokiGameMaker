import type { AishePort, AisheGenerateOptions, AisheStatus, AisheVideoHandle } from './aishe-port.js';

export interface HttpAisheConfig {
  endpoint: string; // 视频生成 API 端点
  apiKey?: string; // 鉴权（可选，Bearer）
  fetchImpl?: typeof fetch; // 注入 fetch（测试/Node）；缺省用全局 fetch
}

// 真后端骨架 —— 把提示词 POST 给外部视频生成 API，解析回视频句柄。provider 无关（端点 + 鉴权可配）。
// 表现层旁路：异步、绝不碰 world / snapshot / hash。接入具体 provider 时按其文档把请求/响应字段适配此骨架。
// 失败不抛异常，返回 error 句柄（展示层据 status 处理）——与确定性 sim 解耦，后端故障不影响游戏推进。
export class HttpAishePort implements AishePort {
  constructor(private readonly cfg: HttpAisheConfig) {}

  async generate(prompt: string, opts?: AisheGenerateOptions): Promise<AisheVideoHandle> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    try {
      const res = await doFetch(this.cfg.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          aspect: opts?.aspect ?? '9:16',
          negativePrompt: opts?.negativePrompt,
          seconds: opts?.seconds,
          seed: opts?.seed,
        }),
      });
      if (!res.ok) return { id: '', status: 'error', prompt, error: `HTTP ${res.status}` };
      const data = (await res.json()) as { id?: string; url?: string; status?: string };
      const status: AisheStatus = (data.status as AisheStatus) ?? (data.url ? 'ready' : 'pending');
      return { id: data.id ?? '', status, prompt, url: data.url };
    } catch (e) {
      return { id: '', status: 'error', prompt, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
