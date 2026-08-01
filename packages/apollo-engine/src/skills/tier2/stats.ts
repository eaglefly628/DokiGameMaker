import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld } from '@engine/core/types.js';
import type { Stats, StatModifier } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  stats —— 属性修正系统（①，ARPG 能力簇）。把"有效属性 = 基础值 + 一组具名来源的加/乘修正"下沉为通用原语。
//
//  现有缺口（验证过）：`Resource` 是平值，没有"基础 + 修正"分层。暗黑**词缀**、Hades **boon/Heat**、
//  **光环/诅咒**、**天赋树**——全是"某来源临时/永久改有效攻防速暴击"，现在表达不了。
//
//  分层：effective[s] = (base[s] + Σ mods.add) × Π mods.mul。一个组件装**多 stat**（绕开"一实体一组件"），
//  mods 是列表（多来源共存）。装备→push 一条 {source}；卸下→按 source 滤除——增删 = 纯数据，零游戏代码。
//  下游消费（与 D 协调，本程不碰其文件）：hitbox 伤害读攻击者 effective.attack、steering 读 effective.moveSpeed、
//  maxHp→Resource.max。本程只下沉**原语 + 重算系统 + 测试**；消费接线交 Programmer D（steering/caster 是他的）。
//
//  确定性：纯整数/IEEE 算术；按 stat 名遍历、按列表序累加（加性/乘性序内可交换）→ 录放一致。
//  幂等重算：每帧从 base+mods 重算 effective（不累计漂移），故"卸装备=滤 mods"次帧即反映。
// ═══════════════════════════════════════════════════════════════

// 纯函数：把 base + mods 折算成 effective。effective[s] = (base[s] + Σadd) × Πmul（覆盖 base 与 mods 涉及的所有 stat）。
export function computeEffective(base: Record<string, number>, mods: readonly StatModifier[]): Record<string, number> {
  const stats = new Set<string>(Object.keys(base));
  for (const m of mods) stats.add(m.stat);
  const out: Record<string, number> = {};
  for (const s of stats) {
    let add = 0;
    let mul = 1;
    for (const m of mods) {
      if (m.stat !== s) continue;
      add += m.add ?? 0;
      mul *= m.mul ?? 1;
    }
    out[s] = ((base[s] ?? 0) + add) * mul;
  }
  return out;
}

export const statsCapability = defineCapability({
  id: 't2-stats',
  version: '1.0.0',

  describe: {
    name: 'stats',
    summary: '属性修正：有效属性 = 基础值 + 具名来源(装备/buff/光环/天赋/boon)的加/乘修正。每帧重算 effective，下游读它。',
    semantic: ['tier2', 'stat', 'modifier', 'rpg'],
    whenToUse:
      '需要"装备/buff/光环改攻防速"时。挂 Stats{base,mods,effective}；装备→往 mods push{stat,add/mul,source}，卸下→按 source 滤。下游(hitbox 伤害/steering 速度/maxHp)读 effective。暗黑词缀、Hades boon 全是数据组合。',
    examples: [
      '戒指 +50 maxHp：mods.push({ stat:"maxHp", add:50, source:"ring1" }) → effective.maxHp = base+50',
      '急速 buff +20% 移速：{ stat:"moveSpeed", mul:1.2, source:"buff_haste" }',
      '卸下戒指：mods = mods.filter(m => m.source !== "ring1") → 次帧 effective 复原',
    ],
  },

  components: {
    provides: {
      Stats: {
        category: 'config',
        describe: '属性分层：base(基础) + mods(来源增删的修正列表) → effective(每帧重算)。effective[s]=(base[s]+Σadd)×Πmul。',
        fields: {
          base: { type: 'string', describe: '基础值 Record<stat,number>（裸属性）' },
          mods: { type: 'string', describe: '修正列表 [{stat,add?,mul?,source}]（装备/buff push，卸下按 source 滤）' },
          effective: { type: 'string', describe: '折算结果 Record<stat,number>（stat-apply 每帧重算；下游读）' },
        },
      },
    },
    reads: ['Stats'],
    writes: ['Stats'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'stat-apply',
      reads: ['Stats'],
      writes: ['Stats'],
      consumes: [],
      execute(world: IWorld) {
        for (const [id] of world.query('Stats')) {
          const s = world.getComponent<Stats>(id, 'Stats');
          if (!s) continue;
          s.effective = computeEffective(s.base, s.mods);
        }
      },
    },
  ],
});
