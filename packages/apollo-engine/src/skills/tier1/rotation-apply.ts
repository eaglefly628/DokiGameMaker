import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';

// Tier 1（直接结算）：角速度 → 角度，motion-apply 的旋转镜像。
// phase Rotate：与 motion-apply 同为 Transform 读改写，须各占一阶段避免拓扑成环。
export const rotationApplyCapability = defineCapability({
  id: 't1-rotation-apply',
  version: '1.0.0',
  describe: {
    name: 'rotation-apply',
    summary: '每帧把 velocity.angular 累加到 transform.rotation。',
    semantic: ['tier1', 'kinematic'],
    whenToUse: '让有角速度的实体旋转。读 Transform+Velocity，写 Transform，Rotate 阶段。',
    examples: ['旋转的子弹', '自转的拾取物'],
  },
  components: { provides: {}, reads: ['Transform', 'Velocity'], writes: ['Transform'], consumes: [] },
  config: {},
  systems: [
    {
      id: 'rotation-apply',
      phase: SystemPhase.Rotate,
      reads: ['Transform', 'Velocity'],
      writes: ['Transform'],
      consumes: [],
      execute(world) {
        for (const [id] of world.query('Transform', 'Velocity')) {
          const t = world.getComponent<Transform>(id, 'Transform')!;
          const v = world.getComponent<Velocity>(id, 'Velocity')!;
          t.rotation += v.angular; // 定步长 tick，无 dt
        }
      },
    },
  ],
});
