import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { MergeEvent, Blocker, Transform, MergeProximity, DestroyRequest, SpawnRequest, Resource } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  merge-proximity-clear —— 二消清邻格阻碍（REQ-101-08/MERGEDIG·挖掘式区域解锁·Gossip Harbor 核心乐趣）。
//
//  「合并→减 3×3 邻格」空间邻格效应（merge-on-place 无此挂钩·下沉通用能力·禁游戏层/宿主手写扫格 solver）：
//    每条 MergeEvent{x,y}（merge-on-place 合成时发）→ 对**世界内所有 Blocker**做 Chebyshev 邻近判定
//    （|dx|、|dy| 皆 ≤ radius×cellSize）→ 命中的 Blocker.layers 各 −dec；归零 → 清层（DestroyRequest 自身）
//    + 按 reveal 露出内容（spawn=SpawnRequest 该模板 / resource=给某资源 +amount·钳限）。
//  空间参数读单例 MergeProximity{cellSize,radius,dec}（游戏摆一份·纯数据）。缺单例=不动（零回归）。
//  确定性：只读/写确定状态·按 query 序结算·几何比较（Chebyshev 整数格·不喂 Condition）；消费 MergeEvent。
// ═══════════════════════════════════════════════════════════════

export const mergeProximityClearCapability = defineCapability({
  id: 't2-merge-proximity-clear',
  version: '1.0.0',

  describe: {
    name: 'merge-proximity-clear',
    summary: '二消清邻格阻碍：每次合并(MergeEvent)对 3×3(radius) 邻格 Blocker.layers 各 −dec·归零则清层+露出 reveal(spawn/resource)。挖掘式区域解锁的「合并→减邻格」空间效应（游戏层只摆 Blocker 数据）。',
    semantic: ['tier2', 'merge', 'spatial', 'interpreter'],
    whenToUse:
      '合并/消除游戏的「挖掘式区域解锁」（Gossip Harbor：整板被阻碍层盖住·邻近二消逐层挖开·归零露出物）。游戏摆 Blocker{layers,reveal} 覆盖格 + 单例 MergeProximity{cellSize,radius,dec}；merge-on-place 发 MergeEvent 驱动。',
    examples: [
      '合并挖板：MergeEvent{x,y} → 半径内每个 Blocker.layers −dec；归零 → 清层 + reveal',
      'reveal 露物：Blocker{layers:0 后, reveal:{kind:"spawn",templateId:"coffee_1"}} → 在该格 SpawnRequest',
      'reveal 露能量：reveal:{kind:"resource",resourceId:"energy",amount:20} → energy +20（钳限）',
    ],
  },

  components: {
    provides: {
      Blocker: {
        category: 'config',
        describe: '挖掘阻碍层：layers>0 盖住该格（游戏侧渲成不可拖）；邻近二消减层·归零清层+露出 reveal。',
        fields: {
          layers: { type: 'number', describe: '剩余阻碍层数（>0=盖住）' },
          reveal: { type: 'string', describe: '归零露出物 {kind:"spawn"|"resource", templateId?, resourceId?, amount?}' },
        },
      },
      MergeProximity: {
        category: 'config',
        describe: '邻格清阻碍空间参数（单例）：cellSize=格边长(世界像素)·radius=影响半径(格·1→3×3)·dec=每次二消减层数。',
        fields: {
          cellSize: { type: 'number', describe: '格边长（世界像素·radius 格数换世界距离）' },
          radius: { type: 'number', describe: '影响半径（单位=格·Chebyshev·1→3×3）' },
          dec: { type: 'number', describe: '每次合并给邻格 Blocker.layers 减多少' },
        },
      },
    },
    reads: ['MergeEvent', 'Blocker', 'Transform', 'MergeProximity'],
    writes: ['Blocker', 'DestroyRequest', 'SpawnRequest', 'Resource'],
    consumes: ['MergeEvent'],
  },

  config: {},

  systems: [
    {
      id: 'merge-proximity-clear',
      phase: SystemPhase.Update,
      reads: ['MergeEvent', 'Blocker', 'Transform', 'MergeProximity'],
      writes: ['Blocker', 'DestroyRequest', 'SpawnRequest', 'Resource'],
      consumes: ['MergeEvent'],
      execute(world: IWorld) {
        const events = world.query('MergeEvent').map(([id, comps]) => ({ id, size: comps.size }));
        if (events.length === 0) return;
        // 空间参数单例（缺=不动·零回归）。
        let cfg: MergeProximity | undefined;
        for (const [id] of world.query('MergeProximity')) { cfg = world.getComponent<MergeProximity>(id, 'MergeProximity') ?? undefined; break; }

        if (cfg) {
          const reach = cfg.radius * cfg.cellSize + cfg.cellSize * 0.25; // Chebyshev 容差（半格·避浮点边界漏判）
          let revealN = 0;
          for (const { id: eid } of events) {
            const ev = world.getComponent<MergeEvent>(eid, 'MergeEvent');
            if (!ev) continue;
            for (const [bid] of world.query('Blocker')) {
              const bk = world.getComponent<Blocker>(bid, 'Blocker');
              const bt = world.getComponent<Transform>(bid, 'Transform');
              if (!bk || !bt || bk.layers <= 0) continue;
              if (Math.abs(bt.x - ev.x) > reach || Math.abs(bt.y - ev.y) > reach) continue; // 不在邻格块内
              bk.layers -= cfg.dec;
              if (bk.layers <= 0) {
                // 清层 + 露出。
                if (!world.hasComponent(bid, 'DestroyRequest')) world.addComponent(bid, { type: 'DestroyRequest', entityId: bid } as DestroyRequest);
                const rv = bk.reveal;
                if (rv && rv.kind === 'spawn' && rv.templateId) {
                  const carrier = `mpc:${revealN++}`;
                  world.createEntity(carrier);
                  world.addComponent(carrier, { type: 'SpawnRequest', templateId: rv.templateId, x: bt.x, y: bt.y } as SpawnRequest);
                } else if (rv && rv.kind === 'resource' && rv.resourceId) {
                  const r = world.getComponent<Resource>(rv.resourceId, 'Resource');
                  if (r) r.current = Math.max(r.min, Math.min(r.max, r.current + (rv.amount ?? 0)));
                }
              }
            }
          }
        }
        // 消费 MergeEvent（专用载体·仅 MergeEvent → 回收；挂持久实体上则仅去组件）。
        for (const { id: eid, size } of events) {
          if (size === 1) world.destroyEntity(eid);
          else world.removeComponent(eid, 'MergeEvent');
        }
      },
    },
  ],
});
