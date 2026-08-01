import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Tilemap, Transform, Shape, Velocity } from '@engine/protocol/components.js';
import { tilemapCapability, isSolidTile, findTilemap } from './tilemap.js';
import { motionApplyCapability } from '@skills/tier1/index.js';

const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const px = (w: World, e: string): number => w.getComponent<Transform>(e, 'Transform')!.x;
const vx = (w: World, e: string): number => w.getComponent<Velocity>(e, 'Velocity')!.vx;

// 四面围墙的房间（border 实心，内部空）。
function room(cols: number, rows: number, ts: number): Tilemap {
  const walls = new Array(cols * rows).fill(0);
  const floor = new Array(cols * rows).fill(1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c === 0 || c === cols - 1 || r === 0 || r === rows - 1) walls[r * cols + c] = 1;
    }
  }
  return {
    type: 'Tilemap',
    cols,
    rows,
    tileSize: ts,
    originX: 0,
    originY: 0,
    layers: [
      { name: 'floor', data: floor, collides: false, tileset: 't' },
      { name: 'walls', data: walls, collides: true, tileset: 't' },
    ],
  };
}

function world(): World {
  const w = new World();
  for (const s of motionApplyCapability.systems) w.addSystem(s);
  for (const s of tilemapCapability.systems) w.addSystem(s);
  return w;
}
function mob(w: World, id: string, x: number, y: number, vxv: number): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'Shape', kind: 'box', width: 16, height: 16 } as Shape);
  w.addComponent(id, { type: 'Velocity', vx: vxv, vy: 0, angular: 0 } as Velocity);
}
function addMap(w: World, tm: Tilemap): void {
  w.createEntity('map');
  w.addComponent('map', tm);
}

describe('tilemap — 元数据 / 定序', () => {
  it('id + Resolve 相位 + runsAfter collision-resolve', () => {
    expect(tilemapCapability.id).toBe('t2-tilemap');
    const sys = tilemapCapability.systems[0];
    expect(sys.phase).toBe(SystemPhase.Resolve);
    expect(sys.runsAfter).toContain('collision-resolve');
  });
});

describe('tilemap — isSolidTile', () => {
  it('border 实心、内部不实心、越界不实心', () => {
    const tm = room(5, 5, 32);
    expect(isSolidTile(tm, 0, 2)).toBe(true); // 左墙
    expect(isSolidTile(tm, 4, 2)).toBe(true); // 右墙
    expect(isSolidTile(tm, 2, 2)).toBe(false); // 内部
    expect(isSolidTile(tm, -1, 2)).toBe(false); // 越界
    expect(isSolidTile(tm, 99, 2)).toBe(false);
  });
});

describe('tilemap — 实体被墙挡住', () => {
  it('朝右墙冲 → 被挡在墙内、撞墙速度归零', () => {
    const w = world();
    addMap(w, room(5, 5, 32)); // 内部 x 可行区约 [40,120]，右墙 c=4 在 x∈[128,160]
    mob(w, 'm', 110, 80, 20); // 在右墙附近，向右冲
    w.tick();
    expect(px(w, 'm')).toBeLessThanOrEqual(120); // 没穿过右墙（右边缘≤128）
    expect(vx(w, 'm')).toBe(0); // 撞墙方向速度清零
  });

  it('多帧持续顶墙 → 始终不穿墙', () => {
    const w = world();
    addMap(w, room(5, 5, 32));
    mob(w, 'm', 80, 80, 30);
    for (let i = 0; i < 20; i++) w.tick();
    expect(px(w, 'm')).toBeLessThanOrEqual(120);
  });
});

describe('tilemap — 开阔处自由移动（无误碰）', () => {
  it('内部空地按速度正常移动', () => {
    const w = world();
    addMap(w, room(9, 9, 32)); // 大房间，内部 x 可行 [40,248]
    mob(w, 'm', 80, 130, 5);
    w.tick();
    expect(px(w, 'm')).toBe(85); // 自由移动 +5，无误碰
  });
});

describe('tilemap — findTilemap / 确定性', () => {
  it('findTilemap 取到单例；同初值重跑一致', () => {
    const build = (): World => {
      const w = world();
      addMap(w, room(7, 7, 32));
      mob(w, 'm1', 80, 80, 25);
      mob(w, 'm2', 150, 150, -25);
      return w;
    };
    expect(findTilemap(build())).toBeDefined();
    const run = (): string => {
      const w = build();
      for (let i = 0; i < 15; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});
