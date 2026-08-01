// ═══════════════════════════════════════════════════════════════
//  固定步长时钟 — 把"模拟频率"与"渲染帧率"解耦
// ═══════════════════════════════════════════════════════════════
//
//  喂入每帧真实流逝的毫秒，返回这一帧应跑几个固定模拟步。
//  同样的总墙钟时间 → 同样的总步数，与帧怎么切分无关 ——
//  于是 60Hz / 144Hz / 卡顿 都跑出**完全一致**的模拟，这是联机的前提。
//  纯逻辑、不碰 requestAnimationFrame，可在 headless 下单测。
// ═══════════════════════════════════════════════════════════════

export interface FixedStepOptions {
  maxSteps?: number; // 单帧最多追赶几步（防"死亡螺旋"）
  maxFrameMs?: number; // 单帧时长上限（标签页切后台等超长间隔钳制）
}

export class FixedStepClock {
  readonly stepMs: number;
  private acc = 0;
  private readonly maxSteps: number;
  private readonly maxFrameMs: number;

  constructor(tickRate = 60, opts: FixedStepOptions = {}) {
    this.stepMs = 1000 / tickRate;
    this.maxSteps = opts.maxSteps ?? 5;
    this.maxFrameMs = opts.maxFrameMs ?? 250;
  }

  // 一帧流逝 frameMs，应跑几个模拟步。
  advance(frameMs: number): number {
    this.acc += Math.min(Math.max(frameMs, 0), this.maxFrameMs);
    let steps = 0;
    while (this.acc >= this.stepMs && steps < this.maxSteps) {
      this.acc -= this.stepMs;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = 0; // 丢弃积压，避免追赶螺旋
    return steps;
  }

  // 距下一步的插值比例 [0,1)，供将来渲染插值用。
  get alpha(): number {
    return this.acc / this.stepMs;
  }
}
