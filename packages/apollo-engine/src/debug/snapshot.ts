import type { WorldSnapshot, Component } from '@engine/core/types.js';

export interface ComponentChange {
  entityId: string;
  type: string;
  op: 'add' | 'update' | 'remove';
  before?: Component;
  after?: Component;
}

// 比较两份世界快照，列出组件级变化（增 / 改 / 删）。
export function diffSnapshots(before: WorldSnapshot, after: WorldSnapshot): ComponentChange[] {
  const changes: ComponentChange[] = [];
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    const b = before[id] ?? {};
    const a = after[id] ?? {};
    const types = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const type of types) {
      const bc = b[type];
      const ac = a[type];
      if (bc && !ac) {
        changes.push({ entityId: id, type, op: 'remove', before: bc });
      } else if (!bc && ac) {
        changes.push({ entityId: id, type, op: 'add', after: ac });
      } else if (bc && ac && JSON.stringify(bc) !== JSON.stringify(ac)) {
        changes.push({ entityId: id, type, op: 'update', before: bc, after: ac });
      }
    }
  }
  return changes;
}

export function formatChange(c: ComponentChange): string {
  const sym = c.op === 'add' ? '+' : c.op === 'remove' ? '-' : '~';
  return `${sym}${c.entityId}.${c.type}`;
}
