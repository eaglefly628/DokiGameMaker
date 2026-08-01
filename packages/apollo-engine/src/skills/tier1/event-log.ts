// ═══════════════════════════════════════════════════════════════
//  event-log —— 流水事件日志的**通用泛型数据结构核**
//  （REQ-EVENTLOG·非 capability，先例见 dice.ts 纯核；旁路观测·不进 sim hash）。
//
//  真缺口（Lead 裁决 2026-07-23·rule-of-two 属实）：game-b（core/game-log.ts 的 GameLog 类）
//  + game-c（game-log.ts 的 GameEvent 流）各手写一份「带 seq 的类型化事件流·供 HUD 显示 + 回放/测试」，
//  core 骨架逐字近同（自增 seq / recent / all / size / clear / dump）；第三款卡牌必再造。
//  引擎 tier3/timeline 是**演出时序调度**·非流水日志——现无「日志/journal」原子。故下沉本核。
//
//  分工（能力只管容器 + seq 骨架，绝不碰文案/kind 语义）：
//    · kind 闭集（'deal'|'action'|… 各游戏自定）= 泛型参数 K；正文 text + 额外字段（如 game-b tile?、
//      round/actor）= 泛型 Extra，各消费游戏填。本核只保证「seq 单调自增 + 追加 + 近 k 条 + 转储」。
//  纪律：纯数据·零随机·零 IO·**不进 sim hash**（同两款现状——旁路观测·局逻辑每步 push、宿主/测试读）。
// ═══════════════════════════════════════════════════════════════

/** 日志一条的核心字段（seq 由本核维护·kind/text 由消费方填）。额外字段经泛型 Extra 合入。 */
export interface LogEntry<K extends string> {
  seq: number; // 全局递增序号（本核维护·从 0 起）
  kind: K; // 消费游戏自定的类型闭集
  text: string; // 人读描述（机读口径由消费方定，本核不碰）
}

/** 通用事件日志：泛型 K=kind 闭集、Extra=额外字段（round/actor/tile… 由消费游戏定）。
 *  push 自增 seq；recent(k) 取近 k 条；all() 全量只读；size()/clear()/dump() 同两款现状。 */
export class EventLog<K extends string, Extra extends object = Record<never, never>> {
  private evs: Array<LogEntry<K> & Extra> = [];
  private n = 0;

  /** 追加一条（自动补 seq）。返回落盘后的完整条目（含 seq·供调用方回读）。 */
  push(e: { kind: K; text: string } & Extra): LogEntry<K> & Extra {
    const rec = { ...(e as object), seq: this.n++ } as LogEntry<K> & Extra;
    this.evs.push(rec);
    return rec;
  }

  /** 最近 k 条（顺序=追加序·倒序展示由消费方定）。k≤0 → 空。 */
  recent(k = 14): ReadonlyArray<LogEntry<K> & Extra> {
    if (k <= 0) return [];
    return this.evs.slice(-k);
  }

  /** 全量只读快照（引用当前内部数组·勿改）。 */
  all(): ReadonlyArray<LogEntry<K> & Extra> {
    return this.evs;
  }

  size(): number {
    return this.evs.length;
  }

  /** 清空并重置 seq（新一局）。 */
  clear(): void {
    this.evs = [];
    this.n = 0;
  }

  /** headless 文本转储（walkthrough/测试失败时贴出查 bug）。可传自定义格式器；缺省 `#seq [kind] text`。 */
  dump(fmt?: (e: LogEntry<K> & Extra) => string): string {
    const f = fmt ?? ((e: LogEntry<K> & Extra) => `#${e.seq} [${e.kind}] ${e.text}`);
    return this.evs.map(f).join('\n');
  }
}

/** 工厂（与 new EventLog 等价·风格对齐 createXxx 惯例）。 */
export function createEventLog<K extends string, Extra extends object = Record<never, never>>(): EventLog<K, Extra> {
  return new EventLog<K, Extra>();
}
