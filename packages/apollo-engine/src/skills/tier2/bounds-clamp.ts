import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Transform, Shape, Bounds } from '@engine/protocol/components.js';

function halfExtents(s: Shape | undefined): { hw: number; hh: number } {
  if (!s) return { hw: 0, hh: 0 };
  if (s.kind === 'box') return { hw: (s.width ?? 0) / 2, hh: (s.height ?? 0) / 2 };
  const r = s.radius ?? 0;
  return { hw: r, hh: r };
}

// Tier 2 涌现（约束）：把实体的 AABB 钳在 Bounds 矩形内 —— 角色不跑出世界。
// 与 collision-resolve 同类：都是"读完位置后再修正位置"的约束。所以同样必须排到 Commit 阶段，
// 否则它写 Transform 而 motion/overlap 读写 Transform，纯组件拓扑会判成环。
// 与同在 Commit 的 jump 不冲突：jump 只写 Velocity、本系统只写 Transform，无共享读改写组件。
// 最小形态：只钳位置（不清速度）。横向走到墙边即停（位置被钳死）；纵向极少触顶。
export const boundsClampCapability = defineCapability({
  id: 't2-bounds-clamp',
  version: '1.0.0',

  describe: {
    name: 'bounds-clamp',
    summary: '把实体的 AABB 钳在 Bounds 世界矩形内，防止跑出屏幕。',
    semantic: ['tier2', 'constraint', 'bounds'],
    whenToUse: '需要实体不越界（角色不跑出屏幕）。读 Transform+Bounds+Shape，写 Transform，跑在 Commit 阶段。',
    examples: ['玩家不掉出/走出屏幕', '（弹射物离屏请改用 destroy-on-exit，而非钳住）'],
  },

  components: {
    provides: {
      Bounds: {
        category: 'config',
        describe: '实体允许活动的世界矩形（含边界）。bounds-clamp 据此把 AABB 钳进去。',
        fields: {
          minX: { type: 'number', describe: '左界' },
          minY: { type: 'number', describe: '上界' },
          maxX: { type: 'number', describe: '右界' },
          maxY: { type: 'number', describe: '下界' },
        },
      },
    },
    reads: ['Transform', 'Bounds', 'Shape'],
    writes: ['Transform'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'bounds-clamp',
      phase: SystemPhase.Commit,
      reads: ['Transform', 'Bounds', 'Shape'],
      writes: ['Transform'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('Transform', 'Bounds')) {
          const t = world.getComponent<Transform>(id, 'Transform')!;
          const b = world.getComponent<Bounds>(id, 'Bounds')!;
          const { hw, hh } = halfExtents(world.getComponent<Shape>(id, 'Shape'));
          t.x = Math.min(Math.max(t.x, b.minX + hw), b.maxX - hw);
          t.y = Math.min(Math.max(t.y, b.minY + hh), b.maxY - hh);
        }
      },
    },
  ],
});
