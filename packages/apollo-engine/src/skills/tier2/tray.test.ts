import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Tray, TraySeat, Tag, Transform, HexPos } from '@engine/protocol/components.js';
import { trayCapability } from './tray.js';

// tray（REQ-F-055）：备战席/手牌排的「自动落座/拖拽互换/离座/弹回」原语。
const BENCH = 1 << 5;
function mk(): World {
  const w = new World();
  for (const s of trayCapability.systems) w.addSystem(s);
  w.createEntity('tray');
  w.addComponent('tray', { type: 'Tray', originX: 0, originY: 100, gap: 40, capacity: 9, requiredTag: BENCH } as Tray);
  return w;
}
function unit(w: World, id: string, x = 999, y = 999): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Tag', flags: BENCH } as Tag);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
}
const seat = (w: World, id: string): number | undefined => w.getComponent<TraySeat>(id, 'TraySeat')?.index;
const at = (w: World, id: string): [number, number] => { const t = w.getComponent<Transform>(id, 'Transform')!; return [t.x, t.y]; };
const place = (w: World, id: string, x: number, y: number): void => { const t = w.getComponent<Transform>(id, 'Transform')!; t.x = x; t.y = y; };

describe('T2 tray（托盘落座，REQ-F-055）', () => {
  it('自动落座：新成员落最小空槽（id 升序，确定）；Transform 钉到槽位', () => {
    const w = mk();
    unit(w, 'a'); unit(w, 'b');
    w.tick();
    expect(seat(w, 'a')).toBe(0);
    expect(seat(w, 'b')).toBe(1);
    expect(at(w, 'a')).toEqual([0, 100]);
    expect(at(w, 'b')).toEqual([40, 100]);
  });

  it('拖到被占槽=互换；拖到空槽=挪动；落点不在托盘带=弹回原槽', () => {
    const w = mk();
    unit(w, 'a'); unit(w, 'b');
    w.tick();
    place(w, 'a', 41, 102); // 模拟 drag-place 把 a 拖到 1 号槽附近（被 b 占）
    w.tick();
    expect(seat(w, 'a')).toBe(1); // 互换
    expect(seat(w, 'b')).toBe(0);
    expect(at(w, 'a')).toEqual([40, 100]);
    expect(at(w, 'b')).toEqual([0, 100]);
    place(w, 'a', 160, 95); // 拖到 4 号空槽附近
    w.tick();
    expect(seat(w, 'a')).toBe(4);
    place(w, 'a', 300, -50); // 拖到荒地（不在托盘带、也没上板）
    w.tick();
    expect(seat(w, 'a')).toBe(4); // 弹回
    expect(at(w, 'a')).toEqual([160, 100]);
  });

  it('上板让座（获得 HexPos 即摘 TraySeat）；回席（失去 HexPos）落回最小空槽', () => {
    const w = mk();
    unit(w, 'a'); unit(w, 'b'); unit(w, 'c');
    w.tick();
    expect(seat(w, 'b')).toBe(1);
    w.addComponent('b', { type: 'HexPos', q: 3, r: 2 } as HexPos); // 模拟 drag-place 上板
    place(w, 'b', -60, -60);
    w.tick();
    expect(seat(w, 'b')).toBeUndefined(); // 让座
    expect(at(w, 'b')).toEqual([-60, -60]); // 板上位置不被托盘碰
    unit(w, 'd');
    w.tick();
    expect(seat(w, 'd')).toBe(1); // 空出的 1 号被新成员补上
    w.removeComponent('b', 'HexPos'); // 模拟拖回席
    w.tick();
    expect(seat(w, 'b')).toBe(3); // 回席落最小空槽
    expect(at(w, 'b')).toEqual([120, 100]);
  });

  it('确定性：同拍多成员入座按 id 升序分配', () => {
    const w = mk();
    unit(w, 'z'); unit(w, 'a'); unit(w, 'm');
    w.tick();
    expect(seat(w, 'a')).toBe(0);
    expect(seat(w, 'm')).toBe(1);
    expect(seat(w, 'z')).toBe(2);
  });
});
