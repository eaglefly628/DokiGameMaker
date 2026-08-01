import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Camera, Bounds, CameraTarget } from '@engine/protocol/components.js';
import { cameraFollowCapability } from './camera-follow.js';

function worldWithCamera(): World {
  const w = new World();
  for (const s of cameraFollowCapability.systems) w.addSystem(s);
  return w;
}
function target(w: World, id: string, x: number, y: number): void {
  if (!w.hasComponent(id, 'Transform')) w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'CameraTarget' } as CameraTarget);
}
function camera(w: World, vw = 640, vh = 400): void {
  w.createEntity('cam');
  w.addComponent('cam', { type: 'Camera', zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, viewportW: vw, viewportH: vh } as Camera);
}
function cam(w: World): Camera {
  return w.getComponent<Camera>('cam', 'Camera')!;
}

describe('T2 camera-follow — metadata', () => {
  it('id / 读 CameraTarget+Transform+Bounds / 写 Camera', () => {
    expect(cameraFollowCapability.id).toBe('t2-camera-follow');
    expect(cameraFollowCapability.components.reads).toEqual(['CameraTarget', 'Transform', 'Bounds']);
    expect(cameraFollowCapability.components.writes).toEqual(['Camera']);
  });
});

describe('T2 camera-follow — 跟随与缩放', () => {
  it('单目标 → 相机中心对准它', () => {
    const w = worldWithCamera();
    camera(w);
    target(w, 'hero', 100, 50);
    w.tick();
    expect(cam(w).offsetX).toBe(100);
    expect(cam(w).offsetY).toBe(50);
  });

  it('双目标 → 相机取中点', () => {
    const w = worldWithCamera();
    camera(w);
    target(w, 'a', 0, 0);
    target(w, 'b', 200, 100);
    w.tick();
    expect(cam(w).offsetX).toBe(100);
    expect(cam(w).offsetY).toBe(50);
  });

  it('目标拉远 → zoom 变小以装进视口；最大不超过 1', () => {
    const w = worldWithCamera();
    camera(w, 640, 400);
    target(w, 'a', 0, 0);
    target(w, 'b', 50, 50); // 跨度小 → fit>1 → 钳到 1
    w.tick();
    expect(cam(w).zoom).toBe(1);

    target(w, 'b', 2000, 0); // 跨度大 → zoom<1
    w.tick();
    expect(cam(w).zoom).toBeLessThan(1);
    expect(cam(w).zoom).toBeGreaterThanOrEqual(0.25);
  });

  it('无目标 → 相机不动', () => {
    const w = worldWithCamera();
    camera(w);
    cam(w).offsetX = 7;
    w.tick();
    expect(cam(w).offsetX).toBe(7);
  });
});

describe('T2 camera-follow — Bounds 钳关卡内', () => {
  it('目标在关卡左边缘 → 相机被钳住不露界外', () => {
    const w = worldWithCamera();
    camera(w, 640, 400);
    // 关卡 [0,2000]x[0,400]，视口宽 640、zoom=1 → halfW=320，相机 X 最小 320。
    w.addComponent('cam', { type: 'Bounds', minX: 0, minY: 0, maxX: 2000, maxY: 400 } as Bounds);
    target(w, 'hero', 10, 200); // 想把相机拉到 10，但会被钳到 320
    w.tick();
    expect(cam(w).offsetX).toBe(320);
  });
});
