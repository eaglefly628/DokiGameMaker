import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { cameraCapability } from './index.js';
import type { Camera } from '@engine/protocol/components.js';

describe('camera atom', () => {
  it('is a pure-data render atom with no systems', () => {
    expect(cameraCapability.systems).toHaveLength(0);
  });

  it('provides Camera categorized as render', () => {
    expect(cameraCapability.components.provides.Camera.category).toBe('render');
  });

  it('stores and reads back projection params', () => {
    const w = new World();
    w.createEntity('cam');
    const c: Camera = { type: 'Camera', zoom: 2, offsetX: 5, offsetY: -5, rotation: 0, viewportW: 1280, viewportH: 720 };
    w.addComponent('cam', c);
    const got = w.getComponent<Camera>('cam', 'Camera')!;
    expect(got.zoom).toBe(2);
    expect(got.viewportW).toBe(1280);
  });

  it('defaults to zoom 1 and 800x600 viewport', () => {
    expect(cameraCapability.config.zoom.default).toBe(1);
    expect(cameraCapability.config.viewportW.default).toBe(800);
    expect(cameraCapability.config.viewportH.default).toBe(600);
  });
});
