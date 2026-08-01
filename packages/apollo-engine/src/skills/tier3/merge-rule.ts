import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { MergeRule, PrefabOrigin, Transform, HexPos, DestroyRequest, SpawnRequest } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  merge-rule —— 「N 换 1」声明式合成（REQ-F-046 升星；卡牌/合成品类通用原子）。
//
//  每 tick 对每条 MergeRule：按 PrefabOrigin.templateId===template 收集**存活实例**（distinct seq；
//  一次展开的全部实体共享一个 seq）→ 存量 ≥ need 时：
//    ① 取 seq 最小的 need 个（最老先合，确定性）；
//    ② 其全部实体发 DestroyRequest（挂件经 hierarchy-cascade 级联，同拍 destroy-apply 清场）；
//    ③ 在最老实例的锚点（其 localId 字典序最小且带 Transform 的实体）处发 SpawnRequest{into, intoOverrides}
//       —— prefab 同拍展开（writer→consumer 定序），合成观感原子；
//    ④ while 连锁直至存量 < need。跨级连锁（into 模板自己的 MergeRule）次拍接力。
//
//  范围注：只数 prefab 展开的实例（带 PrefabOrigin 戳）；装配期烘死的实体不参与合成（商店经济模式
//  下全员经购买展开，天然全员带戳）。检测有一拍延迟（merge 在 prefab 前跑，读上一拍实例），不可感知。
//  确定性：distinct-seq 计数与遍历序无关；选取按 seq 升序；锚点按 localId 字典序——全部确定。
//  定序（零显式边）：写 DestroyRequest/SpawnRequest 单向汇入 cascade/destroy-apply/prefab；
//  读 Transform 来自 Update 写者（grid-move 等）的自动前驱；MergeRule/PrefabOrigin 无运行时写者。
// ═══════════════════════════════════════════════════════════════

export const mergeRuleCapability = defineCapability({
  id: 't3-merge-rule',
  version: '1.0.0',

  describe: {
    name: 'merge-rule',
    summary: '「N 换 1」合成：同模板存活实例 ≥need → 按入场序取最老 need 个原子替换为 into 模板（挂件级联、同拍完成、while 连锁）。升星/合成/进化通用。',
    semantic: ['tier3', 'merge', 'cards', 'interpreter'],
    whenToUse:
      '同名集 N 换 1 的合成玩法：自走棋升星（3 个一星→1 个二星）、合成台、宝石合成。挂一条 MergeRule{template, need, into, intoOverrides?}（每个可合成模板一条；跨级=每级一条）。',
    examples: [
      "升星：MergeRule{ template:'guanyu_1', need:3, into:'guanyu_2', intoOverrides:{main:{Resource:{max:480,current:480}}} }",
      '跨级连锁：再加一条 MergeRule{ template:"guanyu_2", need:3, into:"guanyu_3" }（封顶=不写 guanyu_3 的规则）',
    ],
  },

  components: {
    provides: {
      MergeRule: {
        category: 'config',
        describe: '「N 换 1」合成规则：同 template 存活实例（PrefabOrigin 计数）≥need → 最老 need 个原子替换为 into。',
        fields: {
          template: { type: 'string', describe: '监视的模板 id' },
          need: { type: 'number', describe: '凑几换一（金铲铲=3）' },
          into: { type: 'string', describe: '替换成的模板 id' },
          intoOverrides: { type: 'string', describe: '新实例参数补丁（SpawnOverrides，F-032/033 管道）' },
        },
      },
    },
    reads: ['MergeRule', 'PrefabOrigin', 'Transform', 'HexPos'],
    writes: ['DestroyRequest', 'SpawnRequest'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'merge-rule',
      phase: SystemPhase.Update,
      reads: ['MergeRule', 'PrefabOrigin', 'Transform', 'HexPos'],
      writes: ['DestroyRequest', 'SpawnRequest'],
      consumes: [],
      execute(world: IWorld) {
        // 收集规则（无规则即零开销）。
        const rules: MergeRule[] = [];
        for (const [rid] of world.query('MergeRule')) {
          const r = world.getComponent<MergeRule>(rid, 'MergeRule');
          if (r && r.need >= 2 && r.template && r.into) rules.push(r);
        }
        if (rules.length === 0) return;

        // 存活实例索引：templateId → (seq → 实体列表)。一次扫描供全部规则用。
        const byTemplate = new Map<string, Map<number, string[]>>();
        for (const [eid] of world.query('PrefabOrigin')) {
          const po = world.getComponent<PrefabOrigin>(eid, 'PrefabOrigin')!;
          let seqs = byTemplate.get(po.templateId);
          if (!seqs) { seqs = new Map(); byTemplate.set(po.templateId, seqs); }
          const list = seqs.get(po.seq);
          if (list) list.push(eid); else seqs.set(po.seq, [eid]);
        }

        let mergeN = 0; // 本拍合成序号（SpawnRequest 载体实体的确定性唯一 id 用）
        for (const rule of rules) {
          const seqs = byTemplate.get(rule.template);
          if (!seqs) continue;
          // while 连锁：存量 ≥ need 就一直合（同级封顶由存量自然终止）。
          for (;;) {
            const alive = [...seqs.keys()].sort((a, b) => a - b);
            if (alive.length < rule.need) break;
            const chosen = alive.slice(0, rule.need); // 最老 need 个
            // 锚点：最老实例中 localId 字典序最小且带 Transform 的实体（确定）。
            // 出身格（REQ-F-049）：最老实例首个带 HexPos 的实体之格随产物继承（板上合成→产物留板上，
            // '@origin-hex' 哨兵代入；席上合成无 HexPos→产物留席，哨兵跳过）。
            const oldest = seqs.get(chosen[0])!.slice().sort();
            let ax = 0, ay = 0;
            let originHex: { q: number; r: number } | undefined;
            for (const eid of oldest) {
              const t = world.getComponent<Transform>(eid, 'Transform');
              if (t) { ax = t.x; ay = t.y; break; }
            }
            for (const eid of oldest) {
              const hp = world.getComponent<HexPos>(eid, 'HexPos');
              if (hp) { originHex = { q: hp.q, r: hp.r }; break; }
            }
            // 销毁选中实例的全部实体（挂件经 cascade；hasComponent 防御不覆盖既有意图）。
            for (const seq of chosen) {
              for (const eid of seqs.get(seq)!) {
                if (!world.hasComponent(eid, 'DestroyRequest')) {
                  world.addComponent(eid, { type: 'DestroyRequest', entityId: eid } as DestroyRequest);
                }
              }
              seqs.delete(seq); // 本拍内不再参与后续连锁
            }
            // 产出高一级实例（单组件载体实体，prefab 展开后按 BUG-004 自回收）。
            const carrier = `merge:${rule.into}:${mergeN++}`;
            world.createEntity(carrier);
            world.addComponent(carrier, {
              type: 'SpawnRequest', templateId: rule.into, x: ax, y: ay,
              ...(originHex ? { originHex } : {}),
              ...(rule.intoOverrides ? { overrides: rule.intoOverrides } : {}),
            } as SpawnRequest);
          }
        }
      },
    },
  ],
});
