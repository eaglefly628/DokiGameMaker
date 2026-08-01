import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Bounce, Hitbox, Launch, Tag, Transform, Trigger, Velocity } from '@engine/protocol/components.js';
import { bounceRelayCapability } from './bounce-relay.js';
import { launchCapability } from './launch.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import { steeringCapability } from './steering.js';
import { aggroCapability } from '@skills/tier3/index.js';

// bounce-relay — 跳弹命中重定向（REQ-SURVIVOR武器缺口 W7）。确定性·无随机/墙钟。
const ENEMY = 1 << 1;
const WALL = 1 << 3;
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const vel = (w: World, e: string): Velocity => w.getComponent<Velocity>(e, 'Velocity')!;
const bounce = (w: World, e: string): Bounce | undefined => w.getComponent<Bounce>(e, 'Bounce');

function world(): World {
  const w = new World();
  for (const s of bounceRelayCapability.systems) w.addSystem(s);
  return w;
}
function foe(w: World, id: string, x: number, y: number, flags = ENEMY): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'Tag', flags } as Tag);
}
function projectile(
  w: World,
  id: string,
  x: number,
  y: number,
  bc: Omit<Bounce, 'type'>,
  hb: Omit<Hitbox, 'type'> = { resource: 'hp', amount: 5, targetMask: ENEMY },
): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'Velocity', vx: 1, vy: 0, angular: 0 } as Velocity);
  w.addComponent(id, { type: 'Hitbox', ...hb } as Hitbox);
  w.addComponent(id, { type: 'Bounce', ...bc } as Bounce);
}
function trig(w: World, zoneId: string, other: string): void {
  const tid = `trigger:${zoneId}:${other}`;
  w.createEntity(tid);
  w.addComponent(tid, { type: 'Trigger', zone: zoneId, other } as Trigger);
}

describe('bounce-relay — 元数据 / 定序', () => {
  it('id 正确 + runsAfter trigger-zone/motion-apply/steering（反应系统，同 hitbox 不 runsBefore motion-apply）', () => {
    expect(bounceRelayCapability.id).toBe('t2-bounce-relay');
    const sys = bounceRelayCapability.systems[0];
    expect(sys.runsAfter).toContain('trigger-zone');
    expect(sys.runsAfter).toContain('motion-apply');
    expect(sys.runsAfter).toContain('steering');
  });
});

describe('launch → bounce 落地（Launch.bounce 声明·launch 自删前一次性建 Bounce）', () => {
  function launchWorld(): World {
    const w = new World();
    for (const s of launchCapability.systems) w.addSystem(s);
    return w;
  }

  it('声明 bounce → 自删 Launch 前落地持久 Bounce{remaining,targetTag,speed}', () => {
    const w = launchWorld();
    w.createEntity('p');
    w.addComponent('p', xf(0, 0));
    w.addComponent('p', { type: 'Launch', speed: 6, toward: 'dir', dirX: 1, dirY: 0, bounce: { times: 3, targetTag: ENEMY } } as Launch);
    w.tick();
    expect(w.getComponent<Launch>('p', 'Launch')).toBeUndefined(); // 一次性自删（现行为不变）
    expect(bounce(w, 'p')).toMatchObject({ remaining: 3, targetTag: ENEMY, speed: 6 });
  });

  it('零回归：未声明 bounce → 不建 Bounce（现行为不变）', () => {
    const w = launchWorld();
    w.createEntity('p');
    w.addComponent('p', xf(0, 0));
    w.addComponent('p', { type: 'Launch', speed: 6, toward: 'dir', dirX: 1, dirY: 0 } as Launch);
    w.tick();
    expect(bounce(w, 'p')).toBeUndefined();
  });
});

describe('bounce-relay — 命中重定向', () => {
  it('命中后弹向下一个最近同阵营目标（排除刚命中的）·保持 speed 模长·remaining-1', () => {
    const w = world();
    projectile(w, 'p', 0, 0, { remaining: 2, targetTag: ENEMY, speed: 5 });
    foe(w, 'hit', 10, 0); // 刚命中的（被排除）
    foe(w, 'far', 100, 0);
    foe(w, 'near', 0, 20); // 排除 hit 后最近的下一个目标
    trig(w, 'p', 'hit');
    w.tick();
    const v = vel(w, 'p');
    expect(v.vx).toBeCloseTo(0, 9);
    expect(v.vy).toBeCloseTo(5, 9); // 朝 (0,20) 方向、模长=speed=5
    expect(bounce(w, 'p')!.remaining).toBe(1);
  });

  it('无新目标 → 不再弹：Velocity/remaining 不变（照常按 lifetime 回收）', () => {
    const w = world();
    projectile(w, 'p', 0, 0, { remaining: 2, targetTag: ENEMY, speed: 5 });
    foe(w, 'hit', 10, 0); // 唯一敌人，排除后无候选
    trig(w, 'p', 'hit');
    w.tick();
    expect(vel(w, 'p').vx).toBe(1); // 原速度未被改写（projectile() 里手设的初值）
    expect(vel(w, 'p').vy).toBe(0);
    expect(bounce(w, 'p')!.remaining).toBe(2); // 未消耗
  });

  it('remaining<=0 → 不再弹（次数耗尽）', () => {
    const w = world();
    projectile(w, 'p', 0, 0, { remaining: 0, targetTag: ENEMY, speed: 5 });
    foe(w, 'hit', 10, 0);
    foe(w, 'near', 0, 20);
    trig(w, 'p', 'hit');
    w.tick();
    expect(vel(w, 'p').vx).toBe(1);
    expect(bounce(w, 'p')!.remaining).toBe(0);
  });

  it('阵营过滤：命中的 other 不匹配 Hitbox.targetMask → 不算命中，不弹', () => {
    const w = world();
    projectile(w, 'p', 0, 0, { remaining: 2, targetTag: ENEMY, speed: 5 }, { resource: 'hp', amount: 5, targetMask: ENEMY });
    w.createEntity('wall');
    w.addComponent('wall', xf(10, 0));
    w.addComponent('wall', { type: 'Tag', flags: WALL } as Tag); // 非 ENEMY，不算命中
    foe(w, 'near', 0, 20);
    trig(w, 'p', 'wall');
    w.tick();
    expect(vel(w, 'p').vx).toBe(1); // 未重定向
    expect(bounce(w, 'p')!.remaining).toBe(2); // 未消耗
  });

  it('同 tick 命中多个目标 → 只消耗一次弹射（id 最小的 Trigger·确定性 tie-break）', () => {
    const w = world();
    projectile(w, 'p', 0, 0, { remaining: 3, targetTag: ENEMY, speed: 5 });
    foe(w, 'a', 10, 0);
    foe(w, 'b', -10, 0);
    foe(w, 'far', 0, 50);
    trig(w, 'p', 'a');
    trig(w, 'p', 'b');
    w.tick();
    expect(bounce(w, 'p')!.remaining).toBe(2); // 只消耗一次，不是两次
  });

  it('确定性：同布局跑两遍 → snapshot 相等', () => {
    const run = (): string => {
      const w = world();
      projectile(w, 'p', 0, 0, { remaining: 2, targetTag: ENEMY, speed: 5 });
      foe(w, 'hit', 10, 0);
      foe(w, 'near', 0, 20);
      foe(w, 'far', 100, 100);
      trig(w, 'p', 'hit');
      w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('bounce-relay — 撞环回归（同 game-103 实装能力集同装）', () => {
  it('与 motion-apply/steering/aggro/launch 同装不成环·可 tick', () => {
    const w = new World();
    for (const cap of [motionApplyCapability, steeringCapability, aggroCapability, launchCapability, bounceRelayCapability]) {
      for (const s of cap.systems) w.addSystem(s);
    }
    w.createEntity('p');
    w.addComponent('p', xf(0, 0));
    w.addComponent('p', { type: 'Launch', speed: 6, toward: 'dir', dirX: 1, dirY: 0, bounce: { times: 2, targetTag: ENEMY } } as Launch);
    foe(w, 'e1', 20, 0);
    expect(() => {
      for (let i = 0; i < 5; i++) w.tick();
    }).not.toThrow();
  });
});
