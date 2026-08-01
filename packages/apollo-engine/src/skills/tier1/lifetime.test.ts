import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { DestroyRequest, TimerDone } from '@engine/protocol/components.js';
import { lifetimeCapability } from './lifetime.js';

function worldWithLifetime(): World {
  const w = new World();
  for (const sys of lifetimeCapability.systems) w.addSystem(sys);
  return w;
}

describe('T1 lifetime — capability metadata（契约钉死）', () => {
  it('id / version 正确', () => {
    expect(lifetimeCapability.id).toBe('t1-lifetime');
    expect(lifetimeCapability.version).toBe('1.0.0');
  });

  it('一个系统：写 DestroyRequest，read TimerDone（BUG-003：不再 consume，timer-advance 自清）', () => {
    expect(lifetimeCapability.systems).toHaveLength(1);
    expect(lifetimeCapability.components.provides).toEqual({});
    expect(lifetimeCapability.components.reads).toEqual(['TimerDone']);
    expect(lifetimeCapability.components.writes).toEqual(['DestroyRequest']);
    expect(lifetimeCapability.components.consumes).toEqual([]);
  });
});

describe('T1 lifetime — behavior', () => {
  it('名为 "life" 的计时结束 → 对该实体发 DestroyRequest（TimerDone 留存，由 timer-advance 自清）', () => {
    const w = worldWithLifetime();
    w.createEntity('bullet');
    const done: TimerDone = { type: 'TimerDone', timerId: 'life' };
    w.addComponent('bullet', done);

    w.tick();

    const req = w.getComponent<DestroyRequest>('bullet', 'DestroyRequest');
    expect(req).toBeDefined();
    expect(req!.entityId).toBe('bullet'); // 销毁请求指向自己
    // BUG-003：lifetime 不再 consume TimerDone（生产者 timer-advance 每拍自清）→ 此处仍留存。
    expect(w.getComponent<TimerDone>('bullet', 'TimerDone')).toBeDefined();
  });

  it('非 "life" 的计时不触发销毁', () => {
    const w = worldWithLifetime();
    w.createEntity('e');
    const done: TimerDone = { type: 'TimerDone', timerId: 'cooldown' };
    w.addComponent('e', done);

    w.tick();
    expect(w.getComponent('e', 'DestroyRequest')).toBeUndefined();
  });

  it('没有 TimerDone 的实体什么都不发生', () => {
    const w = worldWithLifetime();
    w.createEntity('idle');
    w.tick();
    expect(w.getComponent('idle', 'DestroyRequest')).toBeUndefined();
  });
});
