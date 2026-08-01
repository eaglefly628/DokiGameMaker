import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { TextBinding, Resource, Hierarchy, Text } from '@engine/protocol/components.js';
import { textBindingCapability } from './text-binding.js';
import { resourceCapability } from '@atom-skills/resource/index.js';

type Cap = { systems: ReadonlyArray<Parameters<World['addSystem']>[0]> };
function mk(...extra: Cap[]): World {
  const w = new World();
  for (const cap of [textBindingCapability as unknown as Cap, ...extra]) for (const s of cap.systems) w.addSystem(s);
  return w;
}
const label = (w: World, id: string) => w.getComponent<Text>(id, 'Text')!.content;
function hud(w: World, id: string, b: Omit<TextBinding, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Text', content: '—', size: 12 } as unknown as Text);
  w.addComponent(id, { type: 'TextBinding', ...b } as TextBinding);
}

describe('T2 text-binding（Resource→Text 数字投影，REQ-F-043）', () => {
  it('契约：PostResolve 终态投影 / 读 TextBinding+Resource+Hierarchy / 只写 Text', () => {
    expect(textBindingCapability.components.reads).toEqual(['TextBinding', 'Resource', 'Hierarchy']);
    expect(textBindingCapability.components.writes).toEqual(['Text']);
    expect(textBindingCapability.systems[0].phase).toBe(SystemPhase.PostResolve);
  });

  it('全局路由 + prefix/suffix：金币数字实时跟随', () => {
    const w = mk();
    w.createEntity('r'); w.addComponent('r', { type: 'Resource', id: 'gold', current: 12, min: 0, max: 999 } as Resource);
    hud(w, 'hud_gold', { resourceId: 'gold', prefix: '金币 ' });
    w.tick();
    expect(label(w, 'hud_gold')).toBe('金币 12');
    w.getComponent<Resource>('r', 'Resource')!.current = 7;
    w.tick();
    expect(label(w, 'hud_gold')).toBe('金币 7'); // 实时
  });

  it('fromParent：头顶等级读宿主资源（同 gauge 寻址）', () => {
    const w = mk();
    w.createEntity('unit');
    w.addComponent('unit', { type: 'Resource', id: 'level', current: 3, min: 0, max: 9 } as Resource);
    hud(w, 'lv', { resourceId: 'level', fromParent: true, prefix: 'Lv.' });
    w.addComponent('lv', { type: 'Hierarchy', parentId: 'unit', localX: 0, localY: -40, localRotation: 0, localScaleX: 1, localScaleY: 1 } as Hierarchy);
    w.tick();
    expect(label(w, 'lv')).toBe('Lv.3');
  });

  it('健壮：资源缺失/对不上 → 保留原文案；缺 Text → 不抛', () => {
    const w = mk();
    hud(w, 'orphan', { resourceId: 'nope' });
    w.createEntity('noText');
    w.addComponent('noText', { type: 'TextBinding', resourceId: 'gold' } as TextBinding);
    expect(() => w.tick()).not.toThrow();
    expect(label(w, 'orphan')).toBe('—'); // 原样
  });

  it('PostResolve 终态：同帧伤害结算后再投影（与 resource-apply 同场同帧见终值）', () => {
    const w = mk(resourceCapability as Cap);
    w.createEntity('r'); w.addComponent('r', { type: 'Resource', id: 'gold', current: 10, min: 0, max: 999 } as Resource);
    hud(w, 'hud', { resourceId: 'gold' });
    w.tick();
    expect(label(w, 'hud')).toBe('10');
    w.addComponent('r', { type: 'ResourceModify', resourceId: 'gold', amount: -4 } as never);
    w.tick();
    expect(label(w, 'hud')).toBe('6'); // Update 落账 → PostResolve 投影，同帧
  });

  it('确定性：同数据两次跑同文案', () => {
    const run = () => {
      const w = mk();
      w.createEntity('r'); w.addComponent('r', { type: 'Resource', id: 'g', current: 42, min: 0, max: 99 } as Resource);
      hud(w, 'h', { resourceId: 'g', suffix: ' 金' });
      w.tick(); w.tick();
      return label(w, 'h');
    };
    expect(run()).toBe(run());
  });
});
