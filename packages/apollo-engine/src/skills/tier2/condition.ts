import type { IWorld, Component } from '@engine/core/types.js';
import type { ConditionExpr, CmpOp, Resource, Flag, State, Timer, StringVar } from '@engine/protocol/components.js';

// Condition —— 布尔条件树的确定性求值（纯函数，无副作用）。
//
// 叶子按「语义 id」全局查找（Resource.id / Flag.id / State.fsmId / Timer.id / StringVar.id）。
// 只做确定性比较（数 / bool / 字符串相等），不碰浮点超越函数 → lockstep / 录放安全。
// 这是 B 轴逻辑底座：threshold/状态判定/定时门控/机关门控都是它的特例。
//
// 性能（Reviewer #3）：叶子查找若每次全表扫描是 O(N)；改为**每帧构建一次按 id 的索引**
// （ConditionLookup，按类型懒加载 + memo），把 N 次全扫降为 O(1) 哈希查。
// event-when 每 execute 只 buildConditionLookup 一次，传给所有 evaluateCondition 复用。

export interface ConditionLookup {
  resource(id: string): Resource | undefined;
  flag(id: string): Flag | undefined;
  state(fsmId: string): State | undefined;
  timer(id: string): Timer | undefined;
  string(id: string): StringVar | undefined;
}

/** 按 id 建索引（懒加载、按类型 memo）。同 id 多份时取第一份（假定全局唯一）。 */
export function buildConditionLookup(world: IWorld): ConditionLookup {
  const tables = new Map<string, Map<string, Component>>();
  function table(type: string, idField: string): Map<string, Component> {
    let m = tables.get(type);
    if (!m) {
      m = new Map();
      for (const [e] of world.query(type)) {
        const c = world.getComponent(e, type) as (Component & Record<string, unknown>) | undefined;
        const key = c?.[idField];
        if (c && typeof key === 'string' && !m.has(key)) m.set(key, c);
      }
      tables.set(type, m);
    }
    return m;
  }
  return {
    resource: (id) => table('Resource', 'id').get(id) as Resource | undefined,
    flag: (id) => table('Flag', 'id').get(id) as Flag | undefined,
    state: (fsmId) => table('State', 'fsmId').get(fsmId) as State | undefined,
    timer: (id) => table('Timer', 'id').get(id) as Timer | undefined,
    string: (id) => table('StringVar', 'id').get(id) as StringVar | undefined,
  };
}

function compare(a: number, op: CmpOp, b: number): boolean {
  switch (op) {
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'eq':
      return a === b;
    case 'ne':
      return a !== b;
    case 'gte':
      return a >= b;
    case 'gt':
      return a > b;
  }
}

/**
 * 求值一棵条件树。缺失叶子（找不到对应 id）按「不成立」处理。
 * 可传入 lookup 复用（同一 tick 多次求值只建一次索引）；不传则内部建一次。
 */
export function evaluateCondition(
  world: IWorld,
  expr: ConditionExpr,
  lookup: ConditionLookup = buildConditionLookup(world),
): boolean {
  switch (expr.kind) {
    case 'always':
      return true;
    case 'and':
      return expr.of.every((e) => evaluateCondition(world, e, lookup));
    case 'or':
      return expr.of.some((e) => evaluateCondition(world, e, lookup));
    case 'not':
      return !evaluateCondition(world, expr.of, lookup);
    case 'resource': {
      const r = lookup.resource(expr.id);
      if (!r) return false;
      // REQ-017：vsResource 在场 → 与另一资源当前值比（动态阈值 round_score≥blind）；否则与静态 value 比。
      const threshold = expr.vsResource ? (lookup.resource(expr.vsResource)?.current ?? expr.value) : expr.value;
      return compare(r.current, expr.cmp, threshold);
    }
    case 'flag': {
      const f = lookup.flag(expr.id);
      const want = expr.equals ?? true;
      return (f?.active ?? false) === want;
    }
    case 'state': {
      const s = lookup.state(expr.fsmId);
      return s ? s.current === expr.equals : false;
    }
    case 'timer': {
      const t = lookup.timer(expr.id);
      return t ? compare(t.elapsed, expr.cmp, expr.value) : false;
    }
    case 'string': {
      const s = lookup.string(expr.id);
      return s ? s.value === expr.equals : false;
    }
  }
}
