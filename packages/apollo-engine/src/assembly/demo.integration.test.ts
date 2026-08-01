import { describe, it, expect } from 'vitest';
import { Engine } from '../runtime/engine.js';
import { demoBlueprint } from './demo.assembly.js';
import { playgroundBlueprint } from './playground.assembly.js';
import { applyCommands } from '@net/index.js';
import type { Transform, Overlap } from '@engine/protocol/components.js';

// 端到端：通过真实 Engine + World.tick() 跑演示蓝图，验证多个原子系统
// 经拓扑排序在一个循环里正确协作。
describe('demo integration — bullet motion + collision + lifetime', () => {
  it('moves the bullet, detects the wall collision, then despawns on the life timer', () => {
    const engine = new Engine();
    engine.load(demoBlueprint);

    expect(engine.world.getComponent<Transform>('bullet', 'Transform')!.x).toBe(0);

    let sawWallOverlap = false;
    for (let tick = 1; tick <= 11; tick++) {
      engine.world.tick();

      // motion-apply: 每 tick 位移 vx=8
      expect(engine.world.getComponent<Transform>('bullet', 'Transform')!.x).toBe(8 * tick);

      // overlap-detect: 子弹进入墙体范围时产生 Overlap
      const overlaps = engine.world
        .query('Overlap')
        .map(([oid]) => engine.world.getComponent<Overlap>(oid, 'Overlap')!);
      if (overlaps.some((o) => o.entityA === 'bullet' || o.entityB === 'bullet')) {
        sawWallOverlap = true;
      }
    }

    expect(sawWallOverlap).toBe(true); // overlap-detect 触发
    expect(engine.world.getAllEntities()).toContain('bullet'); // 寿命未到

    // tick 12：life 计时到 → lifetime 写 DestroyRequest → destroy-apply 移除（同一 tick 链）
    engine.world.tick();
    expect(engine.world.getAllEntities()).not.toContain('bullet');
  });

  it('registers systems from all blueprint capabilities', () => {
    const engine = new Engine();
    engine.load(demoBlueprint);
    const ids = engine.world.getSortedSystems().map((s) => s.id);
    expect(ids).toContain('motion-apply');
    expect(ids).toContain('overlap-detect');
    expect(ids).toContain('timer-advance');
    expect(ids).toContain('lifetime');
    expect(ids).toContain('destroy-apply');
    // 拓扑保证：生产者先于消费者
    expect(ids.indexOf('timer-advance')).toBeLessThan(ids.indexOf('lifetime'));
    expect(ids.indexOf('lifetime')).toBeLessThan(ids.indexOf('destroy-apply'));
    expect(ids.indexOf('motion-apply')).toBeLessThan(ids.indexOf('overlap-detect'));
  });
});

describe('playground (browser scene)', () => {
  it('loads and drifts entities with no topo cycle and no despawns', () => {
    const engine = new Engine();
    engine.load(playgroundBlueprint);

    const before = engine.world.getComponent<Transform>('redBox', 'Transform')!.x;
    engine.world.tick(); // throws if the drift system formed a topo cycle
    const after = engine.world.getComponent<Transform>('redBox', 'Transform')!.x;

    expect(after).not.toBe(before); // moved
    expect(engine.world.getAllEntities()).toHaveLength(4); // 3 drifters + 1 player
  });

  it('moves the controllable player on input command, and stops with none', () => {
    const engine = new Engine();
    engine.load(playgroundBlueprint);

    const x0 = engine.world.getComponent<Transform>('player', 'Transform')!.x;
    // 注入 p1 "右移" 命令 → tick → player 右移（input → command → tick → state）
    applyCommands(engine.world, [{ playerId: 'p1', tick: 1, move: { dx: 1, dy: 0 } }]);
    engine.world.tick();
    const x1 = engine.world.getComponent<Transform>('player', 'Transform')!.x;
    expect(x1).toBeGreaterThan(x0);

    // 无命令 → applyCommands 把可控实体速度归零 → 不再移动
    applyCommands(engine.world, []);
    engine.world.tick();
    const x2 = engine.world.getComponent<Transform>('player', 'Transform')!.x;
    expect(x2).toBe(x1);
  });
});
