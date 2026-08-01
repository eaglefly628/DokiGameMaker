import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { KeyBinding, InputQueue, Signal, RawInputData } from '@engine/protocol/components.js';
import { keybindCapability } from './keybind.js';

const sig = (w: World, e: string): Signal | undefined => w.getComponent<Signal>(e, 'Signal');

function world(): World {
  const w = new World();
  for (const s of keybindCapability.systems) w.addSystem(s);
  return w;
}
function input(w: World, actions: RawInputData[]): void {
  w.createEntity('global-input');
  w.addComponent('global-input', { type: 'InputQueue', actions } as InputQueue);
}
function bind(w: World, id: string, kb: Omit<KeyBinding, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'KeyBinding', ...kb } as KeyBinding);
}

describe('keybind — 元数据 / 定序', () => {
  it('id 正确 + runsAfter event-when（信号不被全局清扫误删）', () => {
    expect(keybindCapability.id).toBe('t2-keybind');
    expect(keybindCapability.systems[0].runsAfter).toContain('event-when');
  });
});

describe('keybind — 具名动作 → Signal', () => {
  it('key 命中 → 产出 Signal{name:signal}', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast_nova' });
    input(w, [{ source: 'p1', key: '1', phase: 'down' }]);
    w.tick();
    expect(sig(w, 'b1')).toMatchObject({ name: 'cast_nova', source: 'b1' });
  });

  it('key 不命中 → 不产出', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast_nova' });
    input(w, [{ source: 'p1', key: '2', phase: 'down' }]);
    w.tick();
    expect(sig(w, 'b1')).toBeUndefined();
  });

  it('phase 过滤：相位不符不触发', () => {
    const w = world();
    bind(w, 'b1', { key: 'q', signal: 'dash', phase: 'down' });
    input(w, [{ source: 'p1', key: 'q', phase: 'up' }]);
    w.tick();
    expect(sig(w, 'b1')).toBeUndefined();
    // 相位匹配则触发。
    w.getComponent<InputQueue>('global-input', 'InputQueue')!.actions = [{ source: 'p1', key: 'q', phase: 'down' }];
    w.tick();
    expect(sig(w, 'b1')).toMatchObject({ name: 'dash' });
  });

  it('多绑定各自匹配；上一帧 Signal 每帧先清后标', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast_nova' });
    bind(w, 'b2', { key: '2', signal: 'cast_smash' });
    input(w, [{ source: 'p1', key: '2', phase: 'action' }]);
    w.tick();
    expect(sig(w, 'b1')).toBeUndefined();
    expect(sig(w, 'b2')).toMatchObject({ name: 'cast_smash' });
    // 下一帧无输入 → 旧 Signal 清掉。
    w.getComponent<InputQueue>('global-input', 'InputQueue')!.actions = [];
    w.tick();
    expect(sig(w, 'b2')).toBeUndefined();
  });

  it('arg 透传：动作带 arg → Signal{name,arg}（带参 UI 动作通道·UI 发「买哪件」）', () => {
    const w = world();
    bind(w, 'b1', { key: 'buy', signal: 'buy' });
    input(w, [{ source: 'p1', key: 'buy', phase: 'action', arg: 'card_42' }]);
    w.tick();
    expect(sig(w, 'b1')).toMatchObject({ name: 'buy', source: 'b1', arg: 'card_42' });
  });

  it('无 arg 的动作 → Signal 不挂 arg 字段（旧内容形状/hash 不变）', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast' });
    input(w, [{ source: 'p1', key: '1', phase: 'down' }]);
    w.tick();
    expect('arg' in sig(w, 'b1')!).toBe(false); // 不写 arg:undefined
  });
});
