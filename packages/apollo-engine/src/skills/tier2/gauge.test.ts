import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Gauge, Resource, Hierarchy, Shape, Transform, ResourceModify } from '@engine/protocol/components.js';
import { gaugeCapability } from './gauge.js';
import { hierarchyResolveCapability } from '../tier1/hierarchy-resolve.js';
import { resourceCapability } from '@atom-skills/resource/index.js';
import { overlapDetectCapability } from '@atom-skills/overlap-detect/index.js';
import { triggerZoneCapability } from './trigger-zone.js';
import { hitboxCapability } from './hitbox.js';

type Cap = { systems: ReadonlyArray<Parameters<World['addSystem']>[0]> };
function mk(...caps: Cap[]): World {
  const w = new World();
  for (const cap of caps) for (const s of cap.systems) w.addSystem(s);
  return w;
}
// 宿主：自带共享 id 'hp' 的 Resource（hitbox 局部路由同款）+ Transform。
function host(w: World, id: string, hp: number, x = 100): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Resource', id: 'hp', current: hp, min: 0, max: 100 } as Resource);
  w.addComponent(id, { type: 'Transform', x, y: 50, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
}
// 条：宿主的纯数据子实体（Hierarchy+Shape+Transform+Gauge）。
function bar(w: World, id: string, parent: string, gauge: Omit<Gauge, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Hierarchy', parentId: parent, localX: 0, localY: -26, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);
  w.addComponent(id, { type: 'Shape', kind: 'box', width: gauge.width, height: 4 } as Shape);
  w.addComponent(id, { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Gauge', ...gauge } as Gauge);
}
const shapeW = (w: World, id: string) => w.getComponent<Shape>(id, 'Shape')!.width!;
const localX = (w: World, id: string) => w.getComponent<Hierarchy>(id, 'Hierarchy')!.localX;
const leftEdge = (w: World, id: string) => localX(w, id) - shapeW(w, id) / 2;

describe('T2 gauge（Resource 比例条，REQ-F-029）', () => {
  it('契约：读 Gauge+Resource+Hierarchy / 写 Shape+Hierarchy / 不碰 Transform / PostResolve 终态投影', () => {
    expect(gaugeCapability.components.reads).toEqual(['Gauge', 'Resource', 'Hierarchy']);
    expect(gaugeCapability.components.writes).toEqual(['Shape', 'Hierarchy']);
    expect(gaugeCapability.components.writes).not.toContain('Transform'); // 载体裁决：不与 hierarchy-resolve 抢 Transform
    expect(gaugeCapability.systems[0].phase).toBe(SystemPhase.PostResolve); // REQ-F-031：跨相位消 Update 战斗图环
    expect(gaugeCapability.systems[0].runsBefore).toEqual(['hierarchy-resolve']); // 同相：先条宽后投影
  });

  it('fromParent 血条：读宿主共享 id "hp"，条宽=比例×满宽', () => {
    const w = mk(gaugeCapability);
    host(w, 'piece', 30); // 30/100
    bar(w, 'hpbar', 'piece', { resourceId: 'hp', fromParent: true, width: 40 });
    w.tick();
    expect(shapeW(w, 'hpbar')).toBe(12); // 0.3 * 40
  });

  it('左锚：左端钉死在 leftX（缺省 -width/2），掉血只从右端缩', () => {
    const w = mk(gaugeCapability);
    host(w, 'piece', 100);
    bar(w, 'hpbar', 'piece', { resourceId: 'hp', fromParent: true, width: 40 });
    w.tick();
    expect(shapeW(w, 'hpbar')).toBe(40);
    expect(localX(w, 'hpbar')).toBe(0); // 满条居中于宿主
    expect(leftEdge(w, 'hpbar')).toBe(-20);
    w.getComponent<Resource>('piece', 'Resource')!.current = 25; // 掉血
    w.tick();
    expect(shapeW(w, 'hpbar')).toBe(10);
    expect(leftEdge(w, 'hpbar')).toBe(-20); // 左端不动
    expect(localX(w, 'hpbar')).toBe(-15); // 中心左移补偿
  });

  it('显式 leftX：自定义锚位同样左端恒定', () => {
    const w = mk(gaugeCapability);
    host(w, 'piece', 50);
    bar(w, 'hpbar', 'piece', { resourceId: 'hp', fromParent: true, width: 40, leftX: -10 });
    w.tick();
    expect(leftEdge(w, 'hpbar')).toBe(-10);
    w.getComponent<Resource>('piece', 'Resource')!.current = 100;
    w.tick();
    expect(leftEdge(w, 'hpbar')).toBe(-10);
  });

  it('全局 id 路由（蓝条）：资源住独立实体，缺省寻址按 id 全局取到', () => {
    const w = mk(gaugeCapability);
    host(w, 'piece', 100);
    w.createEntity('mp_pool');
    w.addComponent('mp_pool', { type: 'Resource', id: 'mp_zhugeliang', current: 5, min: 0, max: 20 } as Resource);
    bar(w, 'mpbar', 'piece', { resourceId: 'mp_zhugeliang', width: 40 }); // 无 fromParent
    w.tick();
    expect(shapeW(w, 'mpbar')).toBe(10); // 0.25 * 40
  });

  it('缺省寻址自身优先：条实体自带同 id 资源时不被全局同名抢走（R11 auto 同款）', () => {
    const w = mk(gaugeCapability);
    host(w, 'piece', 100);
    w.createEntity('global_cast');
    w.addComponent('global_cast', { type: 'Resource', id: 'cast', current: 0, min: 0, max: 10 } as Resource);
    bar(w, 'castbar', 'piece', { resourceId: 'cast', width: 20 });
    w.addComponent('castbar', { type: 'Resource', id: 'cast', current: 5, min: 0, max: 10 } as Resource); // 自身
    w.tick();
    expect(shapeW(w, 'castbar')).toBe(10); // 用自身 0.5，而非全局 0
  });

  it('clamp01 + min≠0 归一：越界饱和、下限做零点', () => {
    const w = mk(gaugeCapability);
    host(w, 'piece', 100);
    w.createEntity('r1');
    w.addComponent('r1', { type: 'Resource', id: 'over', current: 150, min: 0, max: 100 } as Resource);
    w.createEntity('r2');
    w.addComponent('r2', { type: 'Resource', id: 'shifted', current: 100, min: 50, max: 150 } as Resource);
    bar(w, 'b1', 'piece', { resourceId: 'over', width: 40 });
    bar(w, 'b2', 'piece', { resourceId: 'shifted', width: 40 });
    w.tick();
    expect(shapeW(w, 'b1')).toBe(40); // 150/100 → 钳 1
    expect(shapeW(w, 'b2')).toBe(20); // (100-50)/(150-50)=0.5
  });

  it('健壮：缺 Shape / 缺 Hierarchy / 资源缺失或 id 不符 → 不动、不抛', () => {
    const w = mk(gaugeCapability);
    host(w, 'piece', 100);
    // 缺 Shape
    w.createEntity('noShape');
    w.addComponent('noShape', { type: 'Hierarchy', parentId: 'piece', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);
    w.addComponent('noShape', { type: 'Gauge', resourceId: 'hp', fromParent: true, width: 40 } as Gauge);
    // 缺 Hierarchy
    w.createEntity('noHier');
    w.addComponent('noHier', { type: 'Shape', kind: 'box', width: 40, height: 4 } as Shape);
    w.addComponent('noHier', { type: 'Gauge', resourceId: 'hp', width: 40 } as Gauge);
    // 资源对不上（宿主资源 id 是 'hp'，gauge 要 'stamina'）
    bar(w, 'wrongId', 'piece', { resourceId: 'stamina', fromParent: true, width: 40 });
    expect(() => w.tick()).not.toThrow();
    expect(shapeW(w, 'noHier')).toBe(40); // 原样
    expect(shapeW(w, 'wrongId')).toBe(40); // 原样（装配期满宽）
    expect(localX(w, 'wrongId')).toBe(0);
  });

  it('整链：hitbox 同款 ResourceModify 扣血 → resource-apply → gauge 同帧缩条 + hierarchy-resolve 同帧带条随宿主（拓扑不抛）', () => {
    const w = mk(resourceCapability as Cap, gaugeCapability, hierarchyResolveCapability as Cap);
    host(w, 'piece', 100, 100);
    bar(w, 'hpbar', 'piece', { resourceId: 'hp', fromParent: true, width: 40 });
    w.tick(); // 满血基线
    expect(shapeW(w, 'hpbar')).toBe(40);
    // 伤害事件挂宿主（auto 路由同实体优先 → 扣宿主 hp）
    w.addComponent('piece', { type: 'ResourceModify', resourceId: 'hp', amount: -70 } as ResourceModify);
    w.tick();
    expect(w.getComponent<Resource>('piece', 'Resource')!.current).toBe(30);
    expect(shapeW(w, 'hpbar')).toBe(12); // 同帧见终值（resource-apply 拓扑先行）
    const t = w.getComponent<Transform>('hpbar', 'Transform')!;
    expect(t.y).toBe(50 - 26); // 悬宿主头顶
    expect(t.x).toBe(100 + localX(w, 'hpbar')); // PostResolve 同帧把左锚补偿落到世界坐标
  });

  it('REQ-F-031 守护：gauge + overlap/trigger/hitbox/resource-apply 战斗图同场拓扑不抛（修复前 Update 内 5 元环）', () => {
    const w = mk(
      overlapDetectCapability as Cap,
      triggerZoneCapability as Cap,
      hitboxCapability as Cap,
      resourceCapability as Cap,
      gaugeCapability,
      hierarchyResolveCapability as Cap,
    );
    host(w, 'piece', 100);
    bar(w, 'hpbar', 'piece', { resourceId: 'hp', fromParent: true, width: 40 });
    expect(() => { for (let i = 0; i < 3; i++) w.tick(); }).not.toThrow(); // 修复前：Circular dependency
    // PostResolve 终态投影：同帧伤害 → 同帧缩条
    w.addComponent('piece', { type: 'ResourceModify', resourceId: 'hp', amount: -50 } as ResourceModify);
    w.tick();
    expect(shapeW(w, 'hpbar')).toBe(20); // 50/100 → 半条，读到本帧最终 Resource
  });

  it('确定性：同数据同输入两次跑 → 同宽同锚', () => {
    const run = () => {
      const w = mk(gaugeCapability);
      host(w, 'p', 37);
      bar(w, 'b', 'p', { resourceId: 'hp', fromParent: true, width: 40 });
      for (let i = 0; i < 3; i++) w.tick();
      return `${shapeW(w, 'b')},${localX(w, 'b')}`;
    };
    expect(run()).toBe(run());
  });
});
