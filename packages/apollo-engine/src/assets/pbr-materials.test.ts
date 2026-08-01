// PBR 材质库（美术库·TA Phase 5）：闭集预设 + resolve 覆盖 + Material3D render-only。
import { describe, it, expect } from 'vitest';
import { PBR_MATERIALS, resolvePbr } from './pbr-materials.js';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import type { Material3D } from '@engine/protocol/components.js';

describe('PBR 材质预设库', () => {
  it('闭集含常见材质（金属/玻璃/土/钢/岩石…）', () => {
    for (const k of ['matte', 'steel', 'gold', 'copper', 'glass', 'rock', 'dirt', 'wood'] as const) {
      expect(PBR_MATERIALS[k]).toBeTruthy();
    }
    expect(PBR_MATERIALS.gold.metalness).toBe(1); // 金属 metalness=1
    expect(PBR_MATERIALS.glass.transmission).toBeGreaterThan(0); // 玻璃透射
    expect(PBR_MATERIALS.rock.metalness).toBe(0); // 介电 metalness=0
  });

  it('resolve：覆盖参数生效·未知预设回退 matte', () => {
    const g = resolvePbr('gold', { roughness: 0.5, color: 0xff0000 });
    expect(g.metalness).toBe(1); // 预设基底保留
    expect(g.roughness).toBe(0.5); // 覆盖
    expect(g.color).toBe(0xff0000);
    expect(resolvePbr('不存在的材质')).toEqual(PBR_MATERIALS.matte); // 健壮回退
    expect(resolvePbr('steel')).toEqual(PBR_MATERIALS.steel); // 无覆盖=原样
  });
});

describe('Material3D = render-only（不进 hash）', () => {
  it('加 Material3D 不改变 world hash', () => {
    const w = new World();
    w.createEntity('e');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('e', { type: 'Material3D', preset: 'gold' } as Material3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0);
  });
});
