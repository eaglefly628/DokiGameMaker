import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { inputCaptureCapability } from './index.js';
import type { RawInput } from '@engine/protocol/components.js';

describe('input-capture atom', () => {
  it('defines RawInput contract with no pure system (capture is runtime)', () => {
    expect(inputCaptureCapability.systems).toHaveLength(0);
  });

  it('provides RawInput categorized as event', () => {
    expect(inputCaptureCapability.components.provides.RawInput.category).toBe('event');
  });

  it('stores a keyboard signal', () => {
    const w = new World();
    w.createEntity('input');
    const r: RawInput = { type: 'RawInput', source: 'keyboard', key: 'ArrowLeft', phase: 'down' };
    w.addComponent('input', r);
    const got = w.getComponent<RawInput>('input', 'RawInput')!;
    expect(got.source).toBe('keyboard');
    expect(got.key).toBe('ArrowLeft');
  });

  it('stores a pointer signal with coordinates', () => {
    const w = new World();
    w.createEntity('input');
    const r: RawInput = { type: 'RawInput', source: 'pointer', x: 120, y: 80, phase: 'move' };
    w.addComponent('input', r);
    const got = w.getComponent<RawInput>('input', 'RawInput')!;
    expect(got.x).toBe(120);
    expect(got.y).toBe(80);
  });
});
