// 骨骼动画（render-only）：AnimState3D 不进 hash + ModelPool 无模型时安全 no-op（不崩）。
import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { hashSnapshot } from '@net/index.js';
import { ModelPool } from './models.js';
import type { AnimState3D } from '@engine/protocol/components.js';

describe('骨骼动画 AnimState3D（render-only）', () => {
  it('AnimState3D 不进 hash（纯表现·入 NON_DETERMINISTIC）', () => {
    const w = new World();
    w.createEntity('fox');
    const h0 = hashSnapshot(w.snapshot());
    w.addComponent('fox', { type: 'AnimState3D', clip: 'Run', speed: 1.5 } as AnimState3D);
    expect(hashSnapshot(w.snapshot())).toBe(h0);
  });

  it('ModelPool：无资产/模型时 update 返回 0、applyAnim 安全 no-op（不崩）', () => {
    const pool = new ModelPool(); // 无 AssetManager
    expect(pool.update(16)).toBe(0); // 无混合器
    expect(() => pool.applyAnim('fox', { type: 'AnimState3D', clip: 'Run' } as AnimState3D)).not.toThrow();
    expect(pool.count).toBe(0);
  });
});
