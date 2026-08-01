// 状态机样例：clock 驱动 idle→alert→flee→idle 循环；event-when→effect-apply 改 State.current + 切指示块可见。
import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { fsmBlueprint } from './fsm-lab.js';
import type { State, Visibility } from '@engine/protocol/components.js';

const stateOf = (e: Engine): string => e.world.getComponent<State>('mob', 'State')!.current;
const visOf = (e: Engine, id: string): boolean => e.world.getComponent<Visibility>(id, 'Visibility')!.visible;
const run = (e: Engine, n: number): void => { for (let i = 0; i < n; i++) e.world.tick(); };

describe('Game I · 状态机样例', () => {
  it('蓝图纯数据：mob + 三指示块 + 三转移 + 效果（无专属 system）', () => {
    const bp = fsmBlueprint();
    expect(bp.capabilities.length).toBeGreaterThan(0);
    expect(Object.keys(bp.entities)).toContain('mob');
    expect(Object.keys(bp.entities)).toContain('ew-alert');
  });

  it('转移：idle → alert → flee 随 clock 推进（State.current 数据驱动）', () => {
    const e = new Engine();
    e.load(fsmBlueprint());
    run(e, 5);
    expect(stateOf(e)).toBe('idle');
    run(e, 80);   // 过 70
    expect(stateOf(e)).toBe('alert');
    run(e, 80);   // 过 150
    expect(stateOf(e)).toBe('flee');
  });

  it('可见性随状态切：alert 态只有 mk-alert 可见', () => {
    const e = new Engine();
    e.load(fsmBlueprint());
    run(e, 80); // alert
    expect(stateOf(e)).toBe('alert');
    expect(visOf(e, 'mk-alert')).toBe(true);
    expect(visOf(e, 'mk-idle')).toBe(false);
    expect(visOf(e, 'mk-flee')).toBe(false);
  });

  it('循环：过 230 复位回 idle（clock reset → 重新开始）', () => {
    const e = new Engine();
    e.load(fsmBlueprint());
    run(e, 240); // 过 230 → idle + reset
    expect(stateOf(e)).toBe('idle');
    expect(visOf(e, 'mk-idle')).toBe(true);
    run(e, 80); // 复位后再过 70 → 又 alert（证明循环）
    expect(stateOf(e)).toBe('alert');
  });
});
