import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Transform, Hierarchy } from '@engine/protocol/components.js';

// 沿父链算深度（先根后叶排序用），带 seen 防循环引用。
function chainDepth(world: IWorld, id: string): number {
  const seen = new Set<string>();
  let depth = 0;
  let cur = id;
  for (;;) {
    const h = world.getComponent<Hierarchy>(cur, 'Hierarchy');
    if (!h || seen.has(cur)) break;
    seen.add(cur);
    cur = h.parentId;
    depth++;
  }
  return depth;
}

// Tier 1（直接结算）：子实体世界 Transform = 父 Transform 复合 Hierarchy 本地偏移。
// phase PostResolve：读父 Transform 又写子 Transform，组件图自环 → 须排到 collision-resolve(Resolve) 之后；
// 与 friction(同阶段改 Velocity) 不同组件、不冲突。最小形态：本地偏移不随父旋转旋转（避免 sin/cos，后续刚体阶段补）。
export const hierarchyResolveCapability = defineCapability({
  id: 't1-hierarchy-resolve',
  version: '1.0.0',
  describe: {
    name: 'hierarchy-resolve',
    summary: '把子实体世界 Transform 设为父 Transform 复合本地偏移（按父链深度先根后叶，多级一帧到位）。',
    semantic: ['tier1', 'hierarchy'],
    whenToUse: '父子挂接（武器挂角色、炮塔挂车体）。读 Hierarchy+Transform，写 Transform，PostResolve 阶段。',
    examples: ['角色手持武器跟随移动', '多级挂接一帧解算'],
  },
  components: { provides: {}, reads: ['Hierarchy', 'Transform'], writes: ['Transform'], consumes: [] },
  config: {},
  systems: [
    {
      id: 'hierarchy-resolve',
      phase: SystemPhase.PostResolve,
      reads: ['Hierarchy', 'Transform'],
      writes: ['Transform'],
      consumes: [],
      execute(world) {
        const kids = world.query('Hierarchy', 'Transform').map(([id]) => id);
        kids.sort((a, b) => chainDepth(world, a) - chainDepth(world, b)); // 先根后叶
        for (const id of kids) {
          const h = world.getComponent<Hierarchy>(id, 'Hierarchy')!;
          const p = world.getComponent<Transform>(h.parentId, 'Transform');
          if (!p) continue; // 父无 Transform → 跳过
          const c = world.getComponent<Transform>(id, 'Transform')!;
          c.x = p.x + h.localX;
          c.y = p.y + h.localY;
          c.rotation = p.rotation + h.localRotation;
          c.scaleX = p.scaleX * h.localScaleX;
          c.scaleY = p.scaleY * h.localScaleY;
        }
      },
    },
  ],
});
