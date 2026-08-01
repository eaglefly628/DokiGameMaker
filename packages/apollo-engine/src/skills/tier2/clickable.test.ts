import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Shape, Sprite, Signal, InputQueue, Clickable, RawInputData } from '@engine/protocol/components.js';
import { clickableCapability } from './clickable.js';

function worldWithClickable(): World {
  const w = new World();
  for (const s of clickableCapability.systems) w.addSystem(s);
  return w;
}

function setInput(w: World, actions: RawInputData[]): void {
  const e = 'input';
  if (!w.hasComponent(e, 'InputQueue')) w.createEntity(e);
  w.addComponent(e, { type: 'InputQueue', actions } as InputQueue);
}

function box(w: World, eid: string, x: number, y: number, width: number, height: number, action: string, opts: { phase?: string; z?: number; scaleX?: number } = {}): void {
  if (!w.hasComponent(eid, 'Transform')) w.createEntity(eid);
  w.addComponent(eid, { type: 'Transform', x, y, rotation: 0, scaleX: opts.scaleX ?? 1, scaleY: 1 } as Transform);
  w.addComponent(eid, { type: 'Shape', kind: 'box', width, height } as Shape);
  w.addComponent(eid, { type: 'Clickable', action, phase: opts.phase } as Clickable);
  if (opts.z !== undefined) w.addComponent(eid, { type: 'Sprite', textureKey: '', anchorX: 0.5, anchorY: 0.5, zOrder: opts.z } as Sprite);
}

function down(x: number, y: number): RawInputData {
  return { source: 'p1', x, y, phase: 'down' };
}

function sig(w: World, eid: string): string | undefined {
  return w.getComponent<Signal>(eid, 'Signal')?.name;
}

describe('T2 clickable — metadata', () => {
  it('id / 读 Clickable+几何+输入 / 写 Signal / 排在 event-when 后', () => {
    expect(clickableCapability.id).toBe('t2-clickable');
    expect(clickableCapability.components.writes).toEqual(['Signal']);
    expect(clickableCapability.components.reads).toContain('InputQueue');
    expect(clickableCapability.systems[0].runsAfter).toContain('event-when');
  });
});

describe('T2 clickable — 无相机：屏幕即世界', () => {
  it('命中 → 在命中实体上产出 Signal{name:action,source:自身}', () => {
    const w = worldWithClickable();
    box(w, 'btn', 100, 100, 80, 40, 'craft_sword');
    setInput(w, [down(100, 100)]);
    w.tick();
    expect(sig(w, 'btn')).toBe('craft_sword');
    expect(w.getComponent<Signal>('btn', 'Signal')?.source).toBe('btn');
  });

  it('未命中（点在框外）→ 无 Signal', () => {
    const w = worldWithClickable();
    box(w, 'btn', 100, 100, 80, 40, 'craft_sword');
    setInput(w, [down(500, 500)]);
    w.tick();
    expect(w.hasComponent('btn', 'Signal')).toBe(false);
  });
});

describe('T2 clickable — 世界坐标盲信（逆投影上移采集层，sim 不读相机 → lockstep 安全）', () => {
  it('输入 x/y 直接当世界坐标命中（不在 sim 内逆投影）', () => {
    const w = worldWithClickable();
    box(w, 'cell', 50, 0, 20, 20, 'cell');
    setInput(w, [down(50, 0)]); // 世界坐标（PointerInputSource 已在采集期换算好）
    w.tick();
    expect(sig(w, 'cell')).toBe('cell');
  });

  it('sim 不读 Camera（避免本地相机/视口进 hash → 防多端同令异坐标 desync，Gemini 致命级修正）', () => {
    expect(clickableCapability.components.reads).not.toContain('Camera');
  });
});

describe('T2 clickable — 相位 / 最上层 / 信号清扫', () => {
  it('phase 不匹配不触发；匹配才触发', () => {
    const w = worldWithClickable();
    box(w, 'btn', 0, 0, 100, 100, 'release', { phase: 'up' });
    setInput(w, [down(0, 0)]); // down ≠ up
    w.tick();
    expect(w.hasComponent('btn', 'Signal')).toBe(false);
    setInput(w, [{ source: 'p1', x: 0, y: 0, phase: 'up' }]);
    w.tick();
    expect(sig(w, 'btn')).toBe('release');
  });

  it('重叠命中只触发最上层（zOrder 最大）', () => {
    const w = worldWithClickable();
    box(w, 'low', 0, 0, 100, 100, 'low', { z: 0 });
    box(w, 'high', 0, 0, 100, 100, 'high', { z: 10 });
    setInput(w, [down(0, 0)]);
    w.tick();
    expect(sig(w, 'high')).toBe('high');
    expect(w.hasComponent('low', 'Signal')).toBe(false);
  });

  it('下一帧无输入 → 上帧 Signal 被清', () => {
    const w = worldWithClickable();
    box(w, 'btn', 0, 0, 100, 100, 'go');
    setInput(w, [down(0, 0)]);
    w.tick();
    expect(sig(w, 'btn')).toBe('go');
    setInput(w, []);
    w.tick();
    expect(w.hasComponent('btn', 'Signal')).toBe(false);
  });
});
