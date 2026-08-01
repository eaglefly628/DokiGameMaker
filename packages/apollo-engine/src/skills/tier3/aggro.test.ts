import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Perception, Relation, Transform, Tag } from '@engine/protocol/components.js';
import { aggroCapability } from './aggro.js';

const PLAYER = 1 << 1;
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const rel = (w: World, e: string): Relation | undefined => w.getComponent<Relation>(e, 'Relation');

function world(): World {
  const w = new World();
  for (const s of aggroCapability.systems) w.addSystem(s);
  return w;
}
function target(w: World, id: string, x: number, y: number, flags = PLAYER): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'Tag', flags } as Tag);
}
function perceiver(w: World, id: string, x: number, y: number, p: Omit<Perception, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'Perception', ...p } as Perception);
}

describe('aggro — 元数据 / 定序', () => {
  it('id 正确 + runsBefore motion-apply', () => {
    expect(aggroCapability.id).toBe('t3-aggro');
    expect(aggroCapability.systems[0].runsBefore).toContain('motion-apply');
  });
});

describe('aggro — 索敌 → Relation(target)', () => {
  it('锁定视野内最近的 targetTag 阵营', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 0 });
    target(w, 'p_far', 100, 0);
    target(w, 'p_near', 20, 0);
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ kind: 'target', targetId: 'p_near' });
  });

  it('视野外 → 不锁定', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 50 });
    target(w, 'p', 100, 0); // dist 100 > 50
    w.tick();
    expect(rel(w, 'm')).toBeUndefined();
  });

  it('目标离开视野 → 清掉 Relation(target)', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 50 });
    target(w, 'p', 20, 0);
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ targetId: 'p' });
    // 目标跑远。
    w.getComponent<Transform>('p', 'Transform')!.x = 200;
    w.tick();
    expect(rel(w, 'm')).toBeUndefined(); // 丢失目标
  });

  it('只锁 targetTag 阵营（不锁同阵营/无标签）', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 0 });
    target(w, 'ally', 5, 0, 1 << 2); // 非 PLAYER 阵营，更近
    target(w, 'p', 30, 0, PLAYER);
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ targetId: 'p' }); // 跳过非目标阵营的更近者
  });
});

describe('aggro — lureTag（薄加性·REQ-SURVIVOR武器缺口 W8·诱饵盖过默认目标）', () => {
  const LURE = 1 << 3;

  it('声明 lureTag 且范围内有诱饵 → 盖过默认 targetTag 选择', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 0, lureTag: LURE });
    target(w, 'p', 20, 0, PLAYER); // 默认会锁的最近玩家
    target(w, 'decoy', 100, 0, LURE); // 更远，但带诱饵标记
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ kind: 'target', targetId: 'decoy' }); // 诱饵盖过更近的玩家
  });

  it('声明 lureTag 但范围内无诱饵 → 回落 targetTag 默认索敌', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 0, lureTag: LURE });
    target(w, 'p', 20, 0, PLAYER);
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ targetId: 'p' });
  });

  it('多个诱饵 → 选最近的（nearestByTag id tie-break，同 targetTag 口径）', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 0, lureTag: LURE });
    target(w, 'far_decoy', 100, 0, LURE);
    target(w, 'near_decoy', 10, 0, LURE);
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ targetId: 'near_decoy' });
  });

  it('诱饵在 sightRadius 外 → 不生效，仍回落 targetTag（lureTag 复用同一半径门）', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 30, lureTag: LURE });
    target(w, 'p', 20, 0, PLAYER);
    target(w, 'decoy', 100, 0, LURE); // 超出 sightRadius
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ targetId: 'p' });
  });

  it('零回归：未声明 lureTag → 现行为不变（即使场上有 LURE 标记实体也不受影响）', () => {
    const w = world();
    perceiver(w, 'm', 0, 0, { targetTag: PLAYER, sightRadius: 0 }); // 无 lureTag
    target(w, 'p', 20, 0, PLAYER);
    target(w, 'decoy', 5, 0, LURE); // 更近，但本 Perception 没声明 lureTag → 不查它
    w.tick();
    expect(rel(w, 'm')).toMatchObject({ targetId: 'p' });
  });
});
