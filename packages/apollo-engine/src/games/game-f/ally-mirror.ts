// Game F · 盟友战局镜像（三人组队 mirror，用户 2026-06-15 定调 Mirror 而非 lockstep）。
// 每个盟友 = 一台独立 game-f 引擎，自跑自己的 PvE（无需跨端确定性——浮点命门只在 lockstep 下成立）。
// 表现层每帧经 state-sync 真实镜像路径（packKeyframe→applyPacket）取盟友快照，投影成右栏迷你棋盘。
// 这里是「AI 补位」的本地实现：真人队友接入时（BroadcastChannel 跨页）由真实 peer 快照替换之。
import { Engine } from '../../runtime/engine.js';
import { buildGameFBlueprint } from './blueprint.js';
import { templatesFor } from './combat.js';
import { rosterFor, finalHp, type Faction } from './heroes.js';
import { instantiate } from '@skills/tier3/index.js';
import { getComponentById } from '@engine/core/query.js';
import { packKeyframe, applyPacket } from '../../net/state-sync.js';
import { TEAM_A, TEAM_B } from './constants.js';

export interface MirrorUnit {
  q: number;
  r: number;
  enemy: boolean; // true=太阁守军(TEAM_B)，false=盟友棋子(TEAM_A)
  hpFrac: number; // 0..1 血量比（迷你棋盘点大小/透明度）
}

export interface AllyMirror {
  faction: Faction;
  units(): MirrorUnit[]; // 当前镜像快照里的全部参战单位（经 state-sync 还原）
  contribution(): number; // 该盟友本局累计贡献度（共享岛聚合用；读其引擎 contribution 资源）
  dispose(): void;
}

// 盟友默认出战阵容（取该势力名册前 4 个可播种将，落在自己默认格）。AI 补位无需经济/拖拽，直接铺场。
function createAllyMirror(faction: Faction, difficulty = 1, enemyDmgBase = 1): AllyMirror {
  const engine = new Engine({ tickRate: 60 });
  // 短节奏：盟友战局快进（备战 1s → 战斗），右栏一直有活的战斗可看。difficulty/enemyDmgBase=太阁 hp/atk 按人数缩放（同玩家盘）。
  engine.load(buildGameFBlueprint({ playerFaction: faction, prepTicks: 60, resolutionTicks: 60, celebrateTicks: 30, difficulty, enemyDmgBase }));
  const templates = templatesFor(rosterFor(faction));
  const comp = rosterFor(faction).filter((h) => h.team === TEAM_A).slice(0, 4); // AI 补位铺场不看 seed（seed 仅管玩家起手板）
  let seq = 0;
  let lastFieldVersion = -999;

  const field = (): void => {
    for (const h of comp) {
      const tmpl = templates[`hero_${h.id}`];
      if (!tmpl) continue;
      const hp = Math.round(finalHp(h));
      // 直接实例化战斗单位（绕过买入/拖拽）：TEAM_A → 自动索敌太阁守军开打。grid-move 每拍据 HexPos 重投影。
      instantiate(engine.world, tmpl, `hero_${h.id}`, seq++, 0, 0, {
        main: { HexPos: { q: h.q, r: h.r }, Tag: { flags: h.team | h.cls | h.faction }, Resource: { current: hp, max: hp } },
      }, { q: h.q, r: h.r });
    }
    lastFieldVersion = engine.world.getVersion();
  };
  field();
  engine.start();

  return {
    faction,
    units(): MirrorUnit[] {
      // 看门狗：盟友我方被清场（wipe/全灭）→ 隔 ≥40 拍补场，保持战局常活。
      const snap = applyPacket(null, packKeyframe(engine.world.snapshot(), 0));
      const out: MirrorUnit[] = [];
      let allyCount = 0;
      for (const id of Object.keys(snap)) {
        const c = snap[id] as Record<string, { flags?: number; q?: number; r?: number; current?: number; max?: number }>;
        const tag = c['Tag'];
        const hex = c['HexPos'];
        if (!tag || !hex || typeof tag.flags !== 'number') continue;
        const isAlly = (tag.flags & TEAM_A) !== 0;
        const isEnemy = (tag.flags & TEAM_B) !== 0;
        if (!isAlly && !isEnemy) continue;
        const res = c['Resource'];
        const hpFrac = res && res.max ? Math.max(0, Math.min(1, (res.current ?? 0) / res.max)) : 1;
        out.push({ q: hex.q ?? 0, r: hex.r ?? 0, enemy: isEnemy, hpFrac });
        if (isAlly) allyCount++;
      }
      if (allyCount === 0 && engine.world.getVersion() - lastFieldVersion >= 40) field();
      return out;
    },
    contribution(): number {
      const r = getComponentById(engine.world, 'Resource', 'id', 'contribution') as unknown as { current?: number } | undefined;
      return r?.current ?? 0;
    },
    dispose(): void {
      engine.stop();
    },
  };
}

// 起两名 AI 盟友引擎（吴/魏，对应右栏 ALLY_ROSTER 卡）。3-faction plumbing 落地后 rosterFor('wu') 有效
// （吴+魏敌方半区），故 'wu' 盟友跑真实吴名册 PvE；迷你棋盘画单位位置/阵营，颜色由 UI 侧决定。
// 按组队房配置起 N 名 AI 盟友引擎（slice3：每席阵营可配；缺省 吴/魏 补位）。
export function createAllyMirrors(factions: Faction[] = ['wu', 'wei'], difficulty = 1, enemyDmgBase = 1): AllyMirror[] {
  return factions.map((f) => createAllyMirror(f, difficulty, enemyDmgBase));
}
