import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import type { Resource, Flag, Shape, Status, Transform } from '@engine/protocol/components.js';
import { buildGameFBlueprint, GAME_F_HERO_IDS, GAME_F_TEMPLATES, FROZEN, TEAM_A } from './blueprint.js';
import { offsetToAxial, project } from './hex.js';
import { FAST, A_HEROES, B_HEROES, alive, mains, isBSide, mainOf, childOf, flag } from './game-f.helpers.js';

describe('Game F · 战斗（自动对冲/死亡级联/大招/状态/滑行/多实例/相位门）', () => {
  it('F-061 刺客斩杀接入（B）：ASSASSIN 普攻模板注 executeBelow:0.15；非刺客不注；升星继承', () => {
    const huang = GAME_F_TEMPLATES['proj_a_huangzhong'] as unknown as { entities: { p: { Hitbox: { executeBelow?: number } } } };
    expect(huang.entities.p.Hitbox.executeBelow).toBe(0.15); // 黄忠=ASSASSIN·ranged 弹体带斩杀线
    const guan = GAME_F_TEMPLATES['strike_a_guanyu'] as unknown as { entities: { area: { Hitbox: { executeBelow?: number } } } };
    expect(guan.entities.area.Hitbox.executeBelow).toBeUndefined(); // 关羽=WARRIOR 无斩杀
    const huang2 = GAME_F_TEMPLATES['proj_a_huangzhong_s2'] as unknown as { entities: { p: { Hitbox: { executeBelow?: number } } } };
    expect(huang2.entities.p.Hitbox.executeBelow).toBe(0.15); // 升星弹同样继承斩杀
  });

  it('两队自动对冲互砍：双方都真受伤（aggro + grid-move + timer→event-when→caster→hitbox 涌现）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const hurt = (hero: string): boolean => {
      const m = mainOf(e, hero);
      if (!m) return true; // 实例没了 = 战死（也算真受伤）
      const r = e.world.getComponent<Resource>(m, 'Resource');
      return !!r && r.current < r.max;
    };
    for (let i = 0; i < 400; i++) e.world.tick(); // 慢节奏(0.5s/动作)：走位~1.5s 后交火，给足时间
    expect(A_HEROES.some(hurt)).toBe(true);
    expect(B_HEROES.some(hurt)).toBe(true);
  });

  it('战斗收敛到团灭：一方存活=0 → 其 present Flag 落 false（Zone 判胜负）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const livingA = (): number => mains(e).filter((id) => id.startsWith('hero_a_')).length;
    const livingB = (): number => mains(e).filter(isBSide).length;
    for (let i = 0; i < 50; i++) e.world.tick(); // 先让回合 1 展开
    let loser = ''; // 先团灭的那队（resolution 的 wipe 随后会把胜方也清掉，只有败方 flag 判定是本测的语义）
    for (let i = 0; i < 3000 && !loser; i++) {
      e.world.tick();
      if (livingA() === 0) loser = 'a';
      else if (livingB() === 0) loser = 'b';
    }
    expect(loser).not.toBe('');
    // 收敛后再跑几拍让 zone-occupancy 把 present flag 落定（mortal 销毁与 zone 计数差一拍）。
    for (let i = 0; i < 3; i++) e.world.tick();
    expect(flag(e, `team_${loser}_present`)).toBe(false);
  });

  it('棋子死亡 → 名牌/条/sidecar 全族随之消失（hierarchy-cascade 经 @local: 重映射的真实父 id）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 50; i++) e.world.tick();
    const m = mainOf(e, 'a_guanyu')!;
    expect(m).toBeTruthy();
    for (const part of ['name', 'hpbar', 'mpbg', 'mana']) expect(alive(e, childOf(m, part))).toBe(true); // 死前全在
    // 给关羽实例致命局部伤害 → 死亡。
    e.world.addComponent(m, { type: 'ResourceModify', resourceId: 'hp', amount: -99999, scope: 'local' });
    for (let i = 0; i < 3; i++) e.world.tick();
    expect(alive(e, m)).toBe(false); // 棋子销毁
    for (const part of ['name', 'hpbar', 'mpbg', 'mana']) expect(alive(e, childOf(m, part))).toBe(false); // 挂件无残留
    // 死亡碎裂（打击感批）：Mortal.dropTemplate 在尸位炸出 4 个迷你分身飞散渐隐，lifetime 自清
    expect(e.world.getAllEntities().filter((id) => id.startsWith('death_a_guanyu#')).length).toBe(4);
    for (let i = 0; i < 40; i++) e.world.tick();
    expect(e.world.getAllEntities().some((id) => id.startsWith('death_a_guanyu#'))).toBe(false); // 自清无残留
  });

  it('战后庆祝相位（用户「打完不要瞬间全消失」）：胜方横幅+彩点、幸存棋子留板亮相，停拍后才清场；远程弹道在飞', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const ui = (): string => { for (const x of e.world.getAllEntities()) { const st = e.world.getComponent(x, 'State') as { fsmId: string; current: string } | undefined; if (st && st.fsmId === 'round_ui') return st.current; } return '?'; };
    const vis = (id: string): boolean => (e.world.getComponent(id, 'Visibility') as { visible: boolean } | undefined)?.visible ?? true;
    // 战斗中：远程/法术棋子有真弹道（追踪弹实体在场）
    let sawProj = false;
    let guard = 0;
    while (ui() !== 'celebrate' && guard++ < 4000) {
      e.world.tick();
      sawProj ||= e.world.getAllEntities().some((id) => id.startsWith('proj_'));
    }
    expect(ui()).toBe('celebrate'); // 团灭后先进庆祝亮相，不直接清场
    expect(sawProj).toBe(true); // 法术/远程=追踪弹道（诸葛/周瑜/野怪对手里至少一方射过）
    expect(mains(e).length).toBeGreaterThan(0); // 幸存棋子留板亮相（没瞬间全消失）
    for (let i = 0; i < 3; i++) e.world.tick();
    const won = flag(e, 'won');
    expect(vis(won ? 'banner_win' : 'banner_lose')).toBe(true); // 胜/败横幅亮起
    if (won) expect(e.world.getAllEntities().some((id) => id.startsWith('win_burst#'))).toBe(true); // 金彩喷洒
    let guard2 = 0;
    while (ui() === 'celebrate' && guard2++ < 200) e.world.tick();
    for (let i = 0; i < 6; i++) e.world.tick();
    expect(ui()).toBe('resolution');
    expect(mains(e)).toHaveLength(0); // 亮相结束才清场
    expect(vis('banner_win')).toBe(false); // 横幅随相位收走
    expect(vis('banner_lose')).toBe(false);
  });

  it('蓝条→大招（F-9 完结篇，全 per-instance）：over-time 回蓝 → sidecar SelfRule 蓝满放招清蓝', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const mp = (hero: string): number => {
      const m = mainOf(e, hero);
      if (!m) return -1;
      return e.world.getComponent<Resource>(childOf(m, 'mana'), 'Resource')?.current ?? -1; // 普通 id 'mp'，实例寻址
    };
    let guanyuUlt = false;
    let drained = false;
    for (let i = 0; i < 500; i++) {
      e.world.tick();
      if (e.world.getAllEntities().some((x) => x.startsWith('ult_a_guanyu#'))) {
        guanyuUlt = true;
        if (mp('a_guanyu') === 0) drained = true; // 放招拍清蓝（SelfRule do 同拍 set 0）
      }
    }
    expect(guanyuUlt).toBe(true); // 关羽蓝满放出了大招区
    expect(drained).toBe(true); // 清蓝随放招原子发生
  });

  it('实时血条/蓝条：战斗中 hp 填充条真随掉血缩窄（< 自身满宽轨道）、mp 填充条真随攒蓝充起（REQ-F-029 gauge 接入）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    // 比对自身暗轨道宽（=满宽）而非常量：常量改了测试仍真。
    const w = (id: string): number => e.world.getComponent<Shape>(id, 'Shape')?.width ?? -1;
    let hpShrank = false;
    let mpFilled = false;
    for (let i = 0; i < 400 && !(hpShrank && mpFilled); i++) {
      e.world.tick();
      hpShrank ||= GAME_F_HERO_IDS.some((hero) => {
        const m = mainOf(e, hero);
        return !!m && w(childOf(m, 'hpbar')) < w(childOf(m, 'hpbg'));
      });
      mpFilled ||= GAME_F_HERO_IDS.some((hero) => {
        const m = mainOf(e, hero);
        return !!m && w(childOf(m, 'mpbar')) > 0;
      });
    }
    expect(hpShrank).toBe(true); // 有人掉血 → 绿条窄于轨道
    expect(mpFilled).toBe(true); // 有人攒蓝 → 蓝条从 0 充起
  });

  it('八阵图冰冻：诸葛亮大招命中 → 敌方棋子 Status 置 FROZEN（hitbox setMask/statusDuration + GridMover.haltStatusMask，REQ-F-030 接入）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    let froze = false;
    for (let i = 0; i < 600 && !froze; i++) {
      e.world.tick();
      froze = mains(e).some((id) => isBSide(id) && ((e.world.getComponent<Status>(id, 'Status')?.flags ?? 0) & FROZEN) !== 0);
    }
    expect(froze).toBe(true); // 魏方有人被八阵图冻住（定身/解冻语义由引擎 grid-move 4 测覆盖）
  });

  it('平滑滑行（REQ-F-034 接入）：棋子 Transform 每拍位移 ≤ glideSpeed=0.8（旧为 ~18px/格瞬移），逻辑格照走', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    // 7×8 真盘 + 射程驻足（F-060）后：前排出生即贴脸、法师站射程外——开局阵无人需要走位。
    // 备战期把关羽 marker 拖去后排 (2,7) → 开战后近战必须步行入场，借此采样滑行。
    for (let i = 0; i < 10; i++) e.world.tick();
    const gseat = e.world.getAllEntities().find((id) => id.startsWith('bench_a_guanyu#') && id.endsWith(':seat'))!;
    const gt = e.world.getComponent<Transform>(gseat, 'Transform')!;
    const back = offsetToAxial(2, 7);
    const bp2 = project(back.q, back.r);
    e.world.createEntity('input');
    e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', key: 'drag', x: gt.x, y: gt.y, values: [bp2.x, bp2.y], phase: 'drag' }] });
    e.world.tick();
    e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    for (let i = 0; i < 39; i++) e.world.tick(); // 入战拍展开
    const m = mainOf(e, 'a_guanyu')!;
    const t = (): Transform => e.world.getComponent<Transform>(m, 'Transform')!;
    let prev = { x: t().x, y: t().y };
    let maxStep = 0;
    let moved = false;
    for (let i = 0; i < 300 && alive(e, m); i++) {
      e.world.tick();
      if (!alive(e, m)) break;
      const cur = t();
      const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      maxStep = Math.max(maxStep, d);
      moved ||= d > 0;
      prev = { x: cur.x, y: cur.y };
    }
    expect(moved).toBe(true); // 真在滑（不是站桩）
    expect(maxStep).toBeLessThanOrEqual(0.81); // 每拍 ≤ glideSpeed → 平滑无瞬移
  });

  it('F-9 同模板多实例普攻不串台：错拍注入第二个关羽 → 一个攻击周期窗（45 拍）内 ≥2 个独立打击区', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 50; i++) e.world.tick(); // 入战拍部署完毕（FAST prep 40 + 成型 ~4 拍；超员检查带此前已收口）
    expect(mains(e).some((id) => id.startsWith('hero_a_guanyu#'))).toBe(true);
    // 注入第二个同模板关羽（错拍：两实例 timer 相位差 ~6 拍 → 出手拍必然不同）；坐标视觉(3,7)经 odd-r 换算。
    // 注入在 enforce_cap 检查带（count_team_a≥1 边沿，~tick 46）之后 → 不触保额清场，5 单位合法存活。
    const a = offsetToAxial(3, 7);
    e.world.createEntity('req2');
    e.world.addComponent('req2', {
      type: 'SpawnRequest',
      templateId: 'hero_a_guanyu',
      x: 0,
      y: 0,
      overrides: { main: { HexPos: { q: a.q, r: a.r }, Tag: { flags: TEAM_A }, Resource: { current: 5000, max: 5000 } } },
    });
    const seen = new Set<string>();
    for (let i = 50; i < 140; i++) {
      // 窗口 [50,140)：槽源关羽首击 ~88、注入关羽首击 ~96、槽源二击 ~133——窗内两实例各自出手即证不串台
      e.world.tick();
      for (const id of e.world.getAllEntities()) if (id.startsWith('strike_a_guanyu#')) seen.add(id);
    }
    expect(mains(e).filter((id) => id.startsWith('hero_a_guanyu#'))).toHaveLength(2); // 双关羽都活着
    expect(seen.size).toBeGreaterThanOrEqual(2); // 旧"唯一 id"方案此处必串台（共读首份 timer/同信号齐发）
  });

  it('whenGlobal 阶段门（REQ-F-035/F-9）：关 in_combat 立即停手（目标仍在），重开恢复出手', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 60; i++) e.world.tick(); // 进入战斗（已交火）
    const setCombat = (v: boolean): void => {
      for (const eid of e.world.getAllEntities()) {
        const f = e.world.getComponent<Flag>(eid, 'Flag');
        if (f && f.id === 'in_combat') f.active = v;
      }
    };
    const strikes = (): number => e.world.getAllEntities().filter((id) => id.startsWith('strike_')).length;
    setCombat(false); // 模拟 flow 关门（resolution/prep 即此语义）
    for (let i = 0; i < 3; i++) { e.world.tick(); setCombat(false); } // 旧打击区 2 拍自毁，清残留
    let closed = 0;
    for (let i = 0; i < 60; i++) { e.world.tick(); setCombat(false); closed += strikes(); }
    expect(closed).toBe(0); // 门关：目标仍在也零出手（备战/结算不动手铁律；窗口短于首个大招 ~225 拍，无 ult 干扰）
    setCombat(true);
    let reopened = 0;
    for (let i = 0; i < 50 && !reopened; i++) { e.world.tick(); reopened = strikes(); }
    expect(reopened).toBeGreaterThan(0); // 门开恢复出手
  });
});
