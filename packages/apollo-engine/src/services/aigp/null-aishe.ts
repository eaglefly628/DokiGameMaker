import type { AishePort, AisheGenerateOptions, AisheVideoHandle } from './aishe-port.js';

// 空爱诗后端 —— 不调任何外部服务，即时返回一个确定性占位句柄。供 headless / 测试 / 无后端（MVP）时使用。
// 记录调用日志便于断言；句柄 id 用自增计数（确定性）。占位 url 是标记性的 about: 链接，绝不发网络。
// 类比 NullAudioPort / 占位资产：缺真后端时一切照常跑，UI 拿到 ready 句柄展示占位即可。
export class NullAishePort implements AishePort {
  readonly log: Array<{ prompt: string; opts?: AisheGenerateOptions }> = [];
  private counter = 0;

  async generate(prompt: string, opts?: AisheGenerateOptions): Promise<AisheVideoHandle> {
    this.counter += 1;
    this.log.push({ prompt, opts });
    return { id: `aishe-null-${this.counter}`, status: 'ready', prompt, url: `about:aishe#${this.counter}` };
  }
}
