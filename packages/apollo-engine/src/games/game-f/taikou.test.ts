import { describe, it, expect } from 'vitest';
import { TAIKOU_BEACHHEAD, TAIKOU_KOKUJIN, TAIKOU_BOSS, TAIKOU_ROSTER, STAGE_UNIT, unitForStage, unitByCode } from './taikou.js';
import { GAME_F_TEMPLATES } from './combat.js';
import { F_TAIKOU } from './assets.js';
import { PVE_COMP } from './stages.js';
import { Engine } from '../../runtime/engine.js';
import { getComponentById } from '@engine/core/query.js';
import { instantiate } from '@skills/tier3/index.js';
import { buildGameFBlueprint } from './blueprint.js';
import { TEAM_B, FROZEN, BUSHO, BOW } from './constants.js';
import { FAST } from './game-f.helpers.js';

describe('C 太阁全谱 roster（master §六 数据落地）', () => {
  it('全谱完整：滩头4 + 国人众6 + 天守11 = 21；按 master 数值钉关键样本', () => {
    expect(Object.keys(TAIKOU_BEACHHEAD)).toHaveLength(4);
    expect(Object.keys(TAIKOU_KOKUJIN)).toHaveLength(6);
    expect(Object.keys(TAIKOU_BOSS)).toHaveLength(11);
    expect(Object.keys(TAIKOU_ROSTER)).toHaveLength(21);
    // master 样本：斋藤(蝮,TAC,hp600)、家康(忍耐,厚血 hp2000)、谦信(军神,atk90,ASN,斩杀招牌)
    expect(unitByCode('saito')).toMatchObject({ cls: 'TAC', hp: 600, atkType: 'magic', seg: 'kokujin' });
    expect(unitByCode('ieyasu')).toMatchObject({ hp: 2000, seg: 'tenshu' });
    expect(unitByCode('kenshin')).toMatchObject({ atk: 90, cls: 'ASN' });
    expect(unitByCode('masamune')?.atkType).toBe('ranged'); // 狙击=远程
    // 每个单位都有皮 + 正数 hp/atk（master 完整性）
    for (const u of Object.values(TAIKOU_ROSTER)) {
      expect(u.sprite.startsWith('f.taikou.')).toBe(true);
      expect(u.hp).toBeGreaterThan(0);
      expect(u.atk).toBeGreaterThan(0);
    }
  });

  it('国人众进战斗（slice2）：W3–W5 编成引国人众；mob_<code> 战斗模板就绪（master 数值）', () => {
    // W2 含今川(弓阵)、W3 含斋藤、W4 含北条+毛利、W5 含明智。
    expect(PVE_COMP.find((w) => w.stage === 3)!.comp.some((c) => c.code === 'saito')).toBe(true);
    expect(PVE_COMP.find((w) => w.stage === 4)!.comp.map((c) => c.code)).toEqual(expect.arrayContaining(['hojo', 'mori']));
    // 国人众战斗模板就绪（部署槽 mob_<code> + 武器）：斋藤(法术弹)、北条(近战)。
    expect(GAME_F_TEMPLATES['mob_saito']).toBeDefined();
    expect(GAME_F_TEMPLATES['proj_mob_saito']).toBeDefined(); // 斋藤 magic → 弹
    expect(GAME_F_TEMPLATES['mob_hojo']).toBeDefined();
    expect(GAME_F_TEMPLATES['strike_mob_hojo']).toBeDefined(); // 北条 melee → 打击区
  });

  it('天守 Boss 斩杀接线（slice3，F-061）：谦信进终盘波 + 普攻带 executeBelow；非斩杀单位不带', () => {
    expect(PVE_COMP.find((w) => w.stage === 5)!.comp.some((c) => c.code === 'kenshin')).toBe(true); // 谦信终盘部署
    const ken = GAME_F_TEMPLATES['strike_mob_kenshin'] as unknown as { entities: { area: { Hitbox: { executeBelow?: number } } } };
    expect(ken.entities.area.Hitbox.executeBelow).toBe(0.3); // 军神·斩杀残血
    const hojo = GAME_F_TEMPLATES['strike_mob_hojo'] as unknown as { entities: { area: { Hitbox: { executeBelow?: number } } } };
    expect(hojo.entities.area.Hitbox.executeBelow).toBeUndefined(); // 北条非斩杀
  });

  it('天守 Boss 忍耐接线（slice3b）：家康进终盘波 + mob 带 over-time 自回复；普通单位不带', () => {
    expect(PVE_COMP.find((w) => w.stage === 5)!.comp.some((c) => c.code === 'ieyasu')).toBe(true);
    const ie = GAME_F_TEMPLATES['mob_ieyasu'] as unknown as { entities: { main: { OverTime?: { effects: { resource: string }[] } } } };
    expect(ie.entities.main.OverTime?.effects[0].resource).toBe('hp'); // 忍耐=自回血
    const yari = GAME_F_TEMPLATES['mob_ash_yari'] as unknown as { entities: { main: { OverTime?: unknown } } };
    expect(yari.entities.main.OverTime).toBeUndefined(); // 足轻无回复
  });
});

describe('T1 太阁守军 roster（滩头杂兵 + mob 换皮）', () => {
  it('滩头单位数据：枪足轻近战 / 弓足轻远程；stage 映射 + 越界兜底', () => {
    expect(unitForStage(1)).toBe(TAIKOU_BEACHHEAD.yari);
    expect(unitForStage(1).atkType).toBe('melee');
    expect(unitForStage(2).atkType).toBe('ranged'); // 弓足轻
    expect(STAGE_UNIT).toHaveLength(5);
    expect(unitForStage(99).code).toBe('ash_yari'); // 越界 = 枪足轻兜底
  });

  it('mob 模板已换皮太阁守军（名/皮按单位；远程波=追踪弹 + 射程驻足）', () => {
    const m1 = GAME_F_TEMPLATES['mob_ash_yari'] as unknown as { entities: { name: { Text: { content: string } }; main: { Sprite: { textureKey: string }; GridMover: { range?: number } } } };
    expect(m1.entities.name.Text.content).toBe('枪足轻'); // 不再是「黄巾賊」
    expect(m1.entities.main.Sprite.textureKey).toBe(F_TAIKOU.yari);
    expect(m1.entities.main.GridMover.range).toBeUndefined(); // 近战贴脸（无 range）

    // 近战波(stage1 atk6)=strike_mob；远程波(stage2 弓足轻 atk9)=proj_mob + range=4
    expect(GAME_F_TEMPLATES['strike_mob_ash_yari']).toBeDefined();
    expect(GAME_F_TEMPLATES['proj_mob_ash_yumi']).toBeDefined();
    const m2 = GAME_F_TEMPLATES['mob_ash_yumi'] as unknown as { entities: { main: { GridMover: { range?: number } } } };
    expect(m2.entities.main.GridMover.range).toBe(4);
  });
});

describe('贡献后置曲线（多人防独大/anti-snowball；designer #27）', () => {
  it('Boss 波贡献 >> 国人众 >> 滩头（终盘抢 Boss 才定岛主）', () => {
    const bp = buildGameFBlueprint();
    const v = (k: string): number => (bp.entities[k] as unknown as { Effect: { value: number } }).Effect.value;
    expect(v('eff_contrib_win_boss')).toBe(45);
    expect(v('eff_contrib_win_boss')).toBeGreaterThan(v('eff_contrib_win_2')); // 天守 > 国人众
    expect(v('eff_contrib_win_2')).toBeGreaterThan(v('eff_contrib_win_1'));    // 国人众 > 滩头
  });
});

describe('T-F1 信长·天下布武（守军全军 buff 阶段递增；现成能力重组、零引擎）', () => {
  it('终盘 deploy_pve_5 锁存 dmg_scale_b=1.40（全 mob hitbox scaleByResource 据此放大伤害）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const set = (id: string, v: number): void => { const r = getComponentById(e.world, 'Resource', 'id', id) as { current: number } | undefined; if (r) r.current = v; };
    const setFlag = (id: string, v: boolean): void => { const f = getComponentById(e.world, 'Flag', 'id', id) as { active: boolean } | undefined; if (f) f.active = v; };
    const sb = (): number => (getComponentById(e.world, 'Resource', 'id', 'dmg_scale_b') as unknown as { current: number }).current;
    for (let i = 0; i < 5; i++) e.world.tick(); // 沉降进 prep（deploy_armed 复位 false、dmg_scale_b 复位 1）
    expect(sb()).toBe(1); // 锁存前基线
    // 强制终盘部署窗条件（deploy_armed false→true 边沿 ∧ stage==5 ∧ round>=5）→ EventWhen 发 deploy_pve_5 → 全局 Effect 锁存。
    set('stage_idx', 5); set('round_idx', 5); setFlag('deploy_armed', true);
    e.world.tick();
    expect(sb()).toBeCloseTo(1.40, 5); // 天下布武：终盘守军伤害 ×1.40（阶段递增最高档）
  });
});

describe('T-F2/T-F3 召援（秀吉一夜城周期召兵 / 本愿寺一揆开场人海；REQ-021 spawn 重组、零引擎）', () => {
  it('reinf_ash_yari 登陆模板烘进 TEAM_B + hp（spawn 即满血参战，非部署 overrides）', () => {
    const r = GAME_F_TEMPLATES['reinf_ash_yari'] as unknown as { entities: { main: { Tag: { flags: number }; Resource: { max: number }; HexPos: { q: number } } } };
    expect(r).toBeDefined();
    expect(r.entities.main.Tag.flags & TEAM_B).toBe(TEAM_B); // 烘死敌方阵营 → 索敌玩家
    expect(r.entities.main.Resource.max).toBeGreaterThan(0); // 烘死满血
  });

  it('秀吉·一夜城：战斗期周期 spawn 援军 → reinf_ash_yari 实例真出现在世界', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST)); // 蓝图已载预制库（含 mob_hideyoshi / reinf_ash_yari）
    const inc = getComponentById(e.world, 'Flag', 'id', 'in_combat') as { active: boolean } | undefined;
    // 直接铺一个秀吉战斗单位（烘 TEAM_B/hp/格）；其 summon sidecar 每 180 拍召 1 足轻。
    instantiate(e.world, GAME_F_TEMPLATES['mob_hideyoshi'], 'probe_hideyoshi', 0, 0, 0,
      { main: { Tag: { flags: TEAM_B }, Resource: { id: 'hp', current: 9999, min: 0, max: 9999 }, HexPos: { q: 2, r: 2 } } }, { q: 2, r: 2 });
    const reinfCount = (): number => e.world.getAllEntities().filter((id) => id.includes('reinf_ash_yari')).length;
    expect(reinfCount()).toBe(0);
    for (let i = 0; i < 200; i++) { if (inc) inc.active = true; e.world.tick(); } // 钉死战斗态跑过 1 个召援周期
    expect(reinfCount()).toBeGreaterThan(0); // 一夜城确实召出援军
  });

  it('本愿寺·一揆：once 一次性 + count=3（开场人海，数据钉死）', () => {
    expect(unitByCode('honganji')!.summon).toMatchObject({ code: 'ash_yari', count: 3, once: true });
    expect(unitByCode('hideyoshi')!.summon!.once).toBeFalsy(); // 秀吉=周期(loop)非一次性
  });
});

describe('国人众招牌·普攻控/毒（斋藤毒沼 DoT / 明智群冻 FROZEN；hitbox 现成词汇、零引擎）', () => {
  it('斋藤·毒沼：proj_mob_saito 命中附 DoT（over-time 持续掉血）', () => {
    const p = GAME_F_TEMPLATES['proj_mob_saito'] as unknown as { entities: { p: { Hitbox: { dotPerTick?: number; dotDuration?: number } } } };
    expect(p.entities.p.Hitbox.dotPerTick).toBeGreaterThan(0);
    expect(p.entities.p.Hitbox.dotDuration).toBeGreaterThan(0);
  });
  it('明智·群冻：proj_mob_akechi 命中置 FROZEN + statusDuration（定身）', () => {
    const p = GAME_F_TEMPLATES['proj_mob_akechi'] as unknown as { entities: { p: { Hitbox: { setMask?: number; statusDuration?: number } } } };
    expect((p.entities.p.Hitbox.setMask ?? 0) & FROZEN).toBe(FROZEN);
    expect(p.entities.p.Hitbox.statusDuration).toBe(90);
  });
});

describe('石田三成·辅助（三献茶：周期范围回血太阁方；hitbox 负 amount=回血、零引擎）', () => {
  it('石田在场战斗 → 同格残血友军 hp 被治疗区回上来', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const inc = getComponentById(e.world, 'Flag', 'id', 'in_combat') as { active: boolean } | undefined;
    // 石田 + 一个残血足轻（同格 {2,2}，TEAM_B）：石田 healer sidecar 周期 spawn 治疗区 → 覆盖友军回血。
    instantiate(e.world, GAME_F_TEMPLATES['mob_ishida'], 'probe_ishida', 0, 0, 0,
      { main: { Tag: { flags: TEAM_B }, Resource: { id: 'hp', current: 999, min: 0, max: 999 }, HexPos: { q: 2, r: 2 } } }, { q: 2, r: 2 });
    instantiate(e.world, GAME_F_TEMPLATES['mob_ash_yari'], 'probe_ally', 0, 0, 0,
      { main: { Tag: { flags: TEAM_B }, Resource: { id: 'hp', current: 100, min: 0, max: 999 }, HexPos: { q: 2, r: 2 } } }, { q: 2, r: 2 });
    const allyHp = (): number => (e.world.getComponent('probe_ally#0:main', 'Resource') as unknown as { current: number }).current;
    expect(allyHp()).toBe(100);
    for (let i = 0; i < 110; i++) { if (inc) inc.active = true; e.world.tick(); } // 跑过 1 个治疗周期(90拍)
    expect(allyHp()).toBeGreaterThan(100); // 三献茶把残血友军奶上来
  });
});

describe('毛利元就·三矢（场上部将≥3 → 守军全军 buff；玩家羁绊敌方镜像、零引擎）', () => {
  it('铺 3 个部将(BUSHO)入战斗 → dmg_scale_b 叠加 +0.18（group-count→edge→Effect）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const state = getComponentById(e.world, 'State', 'fsmId', 'round_ui') as { current: string } | undefined;
    const sb = (): number => (getComponentById(e.world, 'Resource', 'id', 'dmg_scale_b') as unknown as { current: number }).current;
    // 直接铺 3 个国人众部将（烘 TEAM_B|BUSHO）→ group-count 计 count_busho=3。
    for (let n = 0; n < 3; n++) {
      instantiate(e.world, GAME_F_TEMPLATES['mob_hojo'], `probe_busho${n}`, n, 0, 0,
        { main: { Tag: { flags: TEAM_B | BUSHO }, Resource: { id: 'hp', current: 999, min: 0, max: 999 }, HexPos: { q: 2 + n, r: 2 } } }, { q: 2 + n, r: 2 });
    }
    let maxScale = 0;
    for (let i = 0; i < 8; i++) { if (state) state.current = 'combat'; e.world.tick(); maxScale = Math.max(maxScale, sb()); }
    expect(maxScale).toBeGreaterThanOrEqual(1.18); // 三矢：部将≥3 → 全军 +0.18（从基线 1）
  });
});

describe('今川义元·弓阵（场上弓兵≥3 → 守军全军 buff；同毛利镜像、零引擎）', () => {
  it('铺 3 个弓兵(BOW)入战斗 → dmg_scale_b 叠加 +0.12', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const state = getComponentById(e.world, 'State', 'fsmId', 'round_ui') as { current: string } | undefined;
    const sb = (): number => (getComponentById(e.world, 'Resource', 'id', 'dmg_scale_b') as unknown as { current: number }).current;
    for (let n = 0; n < 3; n++) {
      instantiate(e.world, GAME_F_TEMPLATES['mob_ash_yumi'], `probe_bow${n}`, n, 0, 0,
        { main: { Tag: { flags: TEAM_B | BOW }, Resource: { id: 'hp', current: 999, min: 0, max: 999 }, HexPos: { q: 2 + n, r: 1 } } }, { q: 2 + n, r: 1 });
    }
    let maxScale = 0;
    for (let i = 0; i < 8; i++) { if (state) state.current = 'combat'; e.world.tick(); maxScale = Math.max(maxScale, sb()); }
    expect(maxScale).toBeGreaterThanOrEqual(1.12); // 弓阵：弓≥3 → 全军 +0.12
  });
});
