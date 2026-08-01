import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Velocity, Overlap } from '@engine/protocol/components.js';

// 切向衰减系数：每帧将切向速度乘以 (1 - COEF)。
// 0.2 表示每帧切向速度衰减 20%，在碰撞解算后消除残余滑动。
const COEF = 0.2;

// PostResolve 阶段：collision-resolve(Resolve) 已清零法向速度；
// 此处仅阻尼切向残余，与 hierarchy(PostResolve 改 T)同阶段但操作 Velocity，不冲突；
// 早于 jump(Commit 改 V)，避免摩擦衰减跳跃冲量。
export const frictionCapability = defineCapability({
  id: 't2-friction',
  version: '1.0.0',

  describe: {
    name: 'friction',
    summary: '接触面切向速度阻尼：在 collision-resolve 之后衰减残余切向分量，让物体在斜坡/地面能减速停住。',
    semantic: ['tier2', 'friction', 'damping', 'physics'],
    whenToUse: '需要物体在地面或斜坡上因摩擦减速时。依赖 Overlap 提供法线方向，对有 Velocity 的实体施加切向衰减。',
    examples: ['玩家落地后水平滑行逐渐减速', '方块在斜坡上因摩擦停住而非无限滑落'],
  },

  components: {
    provides: {},
    reads: ['Overlap', 'Velocity'],
    writes: ['Velocity'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'friction',
      phase: SystemPhase.PostResolve,
      reads: ['Overlap', 'Velocity'],
      writes: ['Velocity'],
      consumes: [],
      execute(world: IWorld) {
        for (const [oid] of world.query('Overlap')) {
          const o = world.getComponent<Overlap>(oid, 'Overlap')!;
          const nx = o.normalX; // 单位法线 A→B（来自 overlap-detect）
          const ny = o.normalY;

          // 对 A 方施加摩擦（A 有 Velocity 则为动态方）
          const vA = world.getComponent<Velocity>(o.entityA, 'Velocity');
          if (vA) {
            // 法向投影：vn = v · n
            const vn = vA.vx * nx + vA.vy * ny;
            // 切向：vt = v - vn * n
            const vtx = vA.vx - vn * nx;
            const vty = vA.vy - vn * ny;
            // 仅衰减切向分量，法向不动
            vA.vx -= COEF * vtx;
            vA.vy -= COEF * vty;
          }

          // 对 B 方施加摩擦（B 有 Velocity 则为动态方）
          const vB = world.getComponent<Velocity>(o.entityB, 'Velocity');
          if (vB) {
            // 法线从 A→B，对 B 方切向计算相同（法线方向不影响切向分解）
            const vn = vB.vx * nx + vB.vy * ny;
            const vtx = vB.vx - vn * nx;
            const vty = vB.vy - vn * ny;
            vB.vx -= COEF * vtx;
            vB.vy -= COEF * vty;
          }
        }
      },
    },
  ],
});
