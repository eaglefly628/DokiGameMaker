// Game F · 关卡表 + 野怪波次 + 敌人预布阵（从 blueprint.ts 拆出）。
import { TEAM_B } from './constants.js';
import { type Faction, rosterFor } from './heroes.js';
import { project, offsetToAxial } from './hex.js';

// ── 关卡表（flow-spec §4.5，前 2 阶段）：敌阵=数据条目、与我方槽位同构；扩阶段=加条目+一行 when_deploy_stage_N。──
// 注：敌方强度暂只缩放 HP（攻击力烘在 strike_<id> 模板 amount 里；按阶段缩攻=每阶段一套 strike 模板，真需要再加）。
// 敌阵按**敌方阵营内序号 ei** 引用（0..3），build 时解析成 enemyHeroes[ei]——这样选阵营翻转后，
// 同一关卡表对蜀/魏皆成立（ei0=前排武将…）。默认蜀：ei0=张辽,ei1=许褚,ei2=司马,ei3=甘宁（与旧 b_ 逐字等价）。
export const STAGES: { n: number; comp: { ei: number; q: number; r: number; hpMul: number }[] }[] = [
  // （阶段1 无 PvP 敌阵——按准则整段野怪化，黄巾散兵=PVE_WAVES[0]，见下；坐标=7×8 视觉 col 0..6 / row 0..3 敌半场）
  {
    n: 2, // 阶段2「董卓先锋」：4 子全强度
    comp: [
      { ei: 0, q: 2, r: 3, hpMul: 1 },
      { ei: 1, q: 4, r: 3, hpMul: 1 },
      { ei: 2, q: 3, r: 1, hpMul: 1 },
      { ei: 3, q: 5, r: 1, hpMul: 1 },
    ],
  },
  {
    n: 3, // 阶段3「吕布陷阵」：5 子 + 2 星点缀（hpMul1.8≈2星）——同模板多实例（F-9 per-instance）
    comp: [
      { ei: 0, q: 1, r: 3, hpMul: 1.8 },
      { ei: 0, q: 5, r: 3, hpMul: 1 },
      { ei: 1, q: 3, r: 3, hpMul: 1 },
      { ei: 2, q: 3, r: 1, hpMul: 1 },
      { ei: 3, q: 5, r: 1, hpMul: 1 },
    ],
  },
  {
    n: 4, // 阶段4「官渡精锐」：6 子、整体 1.4×（羁绊成型近似——羁绊机制 Phase 3）
    comp: [
      { ei: 0, q: 1, r: 3, hpMul: 1.4 },
      { ei: 0, q: 5, r: 3, hpMul: 1.4 },
      { ei: 1, q: 2, r: 3, hpMul: 1.4 },
      { ei: 1, q: 4, r: 3, hpMul: 1.4 },
      { ei: 2, q: 3, r: 1, hpMul: 1.4 },
      { ei: 3, q: 5, r: 1, hpMul: 1.4 },
    ],
  },
  {
    n: 5, // 阶段5「赤壁决战」：7 子 + Boss（ei1 hpMul3，终关）
    comp: [
      { ei: 1, q: 3, r: 2, hpMul: 3 },
      { ei: 0, q: 1, r: 3, hpMul: 1.8 },
      { ei: 0, q: 5, r: 3, hpMul: 1.8 },
      { ei: 1, q: 2, r: 3, hpMul: 1.4 },
      { ei: 2, q: 2, r: 1, hpMul: 1.8 },
      { ei: 2, q: 4, r: 1, hpMul: 1.4 },
      { ei: 3, q: 5, r: 0, hpMul: 1.8 },
    ],
  },
];

// 敌人预布阵（功能 B，用户：排兵布阵时看敌人下一波）：返回当前回合英雄关敌阵的世界坐标 + 将名，
// 供 DOM 幽灵层投影画半透明敌兵。PVE 回合（阶段1 或 r≥5 野怪波）无英雄坐标→返回空（不预览）。
export function gameFEnemyPreview(stageIdx: number, roundIdx: number, pf: Faction = 'shu'): { name: string; x: number; y: number }[] {
  if (stageIdx <= 1 || roundIdx >= 5) return [];
  const stage = STAGES.find((s) => s.n === stageIdx);
  if (!stage) return [];
  const enemyHeroes = rosterFor(pf).filter((h) => h.team === TEAM_B);
  return stage.comp.map((c) => {
    const eh = enemyHeroes[c.ei];
    const a = offsetToAxial(c.q, c.r);
    const p = project(a.q, a.r);
    return { name: eh?.name ?? '魏', x: p.x, y: p.y };
  });
}

// ── 太阁守军波次（多兵种编成，master §七 W1–W5；index 对 deploy_pve_<stage>）──
// 每波=若干 {太阁码 × 数量}；血/攻取 taikou master（unitByCode），死亡掉法球。W6 终盘 Boss 大招=后续片。
// 注：stage1 全程 PVE；stage2–5 的 r5 PVE 波引入国人众部将（saito/hojo/mori/akechi/ishida/imagawa）。
export interface WaveSlot { code: string; count: number }
export const PVE_COMP: { stage: number; comp: WaveSlot[] }[] = [
  { stage: 1, comp: [{ code: 'ash_yari', count: 4 }, { code: 'ash_yumi', count: 2 }] }, // W1 滩头①
  { stage: 2, comp: [{ code: 'imagawa', count: 1 }, { code: 'ash_yari', count: 3 }, { code: 'ash_teppo', count: 2 }, { code: 'kunoichi', count: 1 }] }, // W2 滩头②（今川弓阵：今川+2铁炮=3弓 → 全军 buff）
  { stage: 3, comp: [{ code: 'honganji', count: 1 }, { code: 'saito', count: 1 }, { code: 'ishida', count: 1 }, { code: 'ash_yumi', count: 1 }] }, // W3 国人众①（斋藤毒沼 + 本愿寺人海 + 石田回血）
  { stage: 4, comp: [{ code: 'hideyoshi', count: 1 }, { code: 'hojo', count: 1 }, { code: 'mori', count: 1 }, { code: 'ash_yari', count: 3 }] }, // W4 国人众②（北条+毛利 + 秀吉一夜城：周期召兵）
  { stage: 5, comp: [{ code: 'nobunaga', count: 1 }, { code: 'kenshin', count: 1 }, { code: 'ieyasu', count: 1 }, { code: 'akechi', count: 1 }, { code: 'ash_yari', count: 3 }] }, // W5/W6 终盘天守：信长(天下布武 全军buff) + 谦信(斩杀) + 家康(忍耐回血) + 国人众精锐
];
// 全波次引用到的唯一太阁码（combat 据此生成 mob_<code> + 武器模板）。
export const PVE_CODES: string[] = [...new Set(PVE_COMP.flatMap((w) => w.comp.map((c) => c.code)))];

