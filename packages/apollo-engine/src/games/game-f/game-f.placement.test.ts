import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import type { Resource, Transform, HexPos, SelfRule } from '@engine/protocol/components.js';
import { buildGameFBlueprint } from './blueprint.js';
import { offsetToAxial, project } from './hex.js';
import { FAST, alive, mains, childOf, flag } from './game-f.helpers.js';

describe('Game F · 摆放（播种展开/回合重置/升星合成/摆子拖拽）', () => {
  it('开局播种+入战拍展开（REQ-F-049 统一架构）：备战=板上 4 可拖 marker、零棋子；开战拍棋子在各自 marker 格成型', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 20; i++) e.world.tick(); // 备战期
    expect(mains(e)).toHaveLength(0); // 棋子开战才成型（备战摆的是 marker 本体）
    const seats = e.world.getAllEntities().filter((id) => id.startsWith('bench_') && id.endsWith(':seat'));
    expect(seats).toHaveLength(4); // 开局播种 4 个在板 marker（与买入 marker 同族、可拖可卖可合成）
    for (const s of seats) expect(e.world.getComponent(s, 'HexPos')).toBeTruthy(); // 在板（哨兵继承 bootcast 的格）
    for (let i = 0; i < 30; i++) e.world.tick(); // FAST prep 40 → 入战拍部署 → prefab 成型
    const r1 = mains(e);
    expect(r1).toHaveLength(10); // 我方 4 + W1 太阁滩头（枪足轻×4+弓足轻×2=6）
    for (const m of r1) {
      expect(alive(e, childOf(m, 'name'))).toBe(true); // 名牌随模板整体展开
      expect(alive(e, childOf(m, 'hpbar'))).toBe(true); // 血条
      if (m.startsWith('hero_')) expect(alive(e, childOf(m, 'mana'))).toBe(true); // 蓝 sidecar（野怪无大招链）
      const hp = e.world.getComponent<Resource>(m, 'Resource')!;
      expect(hp.current).toBe(hp.max); // overrides 写入星级数值，满状态
      expect(hp.max).toBeGreaterThan(1); // 不是模板占位值（overrides 真生效）
    }
    // 我方棋子的格 = marker 的格（'@origin-hex' 哨兵跟手）
    const guanyuSeat = seats.find((s) => s.startsWith('bench_a_guanyu#'))!;
    const seatHex = e.world.getComponent<HexPos>(guanyuSeat, 'HexPos')!;
    const heroHex = e.world.getComponent<HexPos>(mains(e).find((m) => m.startsWith('hero_a_guanyu#'))!, 'HexPos')!;
    expect([heroHex.q, heroHex.r]).toEqual([seatHex.q, seatHex.r]);
    // REQ-F-056：战斗期 marker 隐藏（消「武将复制、老的没删」幽灵）——seat 持久但 Visibility=false。
    const vis = (id: string): boolean => (e.world.getComponent(id, 'Visibility') as { visible: boolean } | undefined)?.visible ?? true;
    expect(alive(e, guanyuSeat)).toBe(true); // marker 持久（记布阵不删）
    expect(vis(guanyuSeat)).toBe(false); // 战斗期隐藏（只剩会动的战斗棋子可见，无双重显示）
  });

  it('回合重置（REQ-F-032/033 接入）：团灭→resolution 清场→prep 重展开满状态新实例；槽位/模板库跨回合持久', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 60; i++) e.world.tick();
    const r1 = mains(e);
    expect(r1).toHaveLength(10); // 回合 1 展开（我方 4 + W1 太阁 6）
    // 打到一方团灭 → resolution 'wipe' destroy-tagged 双向清场 → 全场 0 子（挂件级联，下面用名牌验）。
    const r1name = childOf(r1[0], 'name');
    let wiped = false;
    for (let i = 0; i < 4000 && !wiped; i++) {
      e.world.tick();
      wiped = mains(e).length === 0;
    }
    expect(wiped).toBe(true);
    expect(alive(e, r1name)).toBe(false); // 名牌等挂件随清场级联，无孤儿
    expect(e.world.getAllEntities().some((id) => id.startsWith('bench_a_guanyu#') && id.endsWith(':seat'))).toBe(true); // 阵容=marker（无 TEAM 位）跨回合持久
    expect(alive(e, 'slot_s2_2_b_simayi')).toBe(true); // 阶段 2 敌槽同样持久（槽位 id 带序号防同名撞键）
    expect(alive(e, 'library')).toBe(true); // 模板库持久
    // resolution + done 握手 → 回 prep（marker 留板）→ 下一开战拍重展开满状态新实例。
    let r2: string[] = [];
    for (let i = 0; i < 4000 && r2.length < 7; i++) { e.world.tick(); r2 = mains(e); }
    expect(r2).toHaveLength(10); // 新一轮（仍 W1）10 子
    for (const id of r2) expect(r1).not.toContain(id); // prefab.seq 单调 → 实例 id 全新（确定性可重放）
    for (const m of r2) {
      const hp = e.world.getComponent<Resource>(m, 'Resource')!;
      expect(hp.current).toBe(hp.max); // 满状态重开（战斗状态不跨回合）
      expect(alive(e, childOf(m, 'hpbar'))).toBe(true); // 挂件随新实例整族重生
    }
  });

  it('升星合成（F-17/REQ-F-046+049 全链）：3 同将 marker 自动合二星（席位回账）；拖上板 → 开战按 ×1.8 血/×1.5 弹成型；星级卖价', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    const act = (a: Record<string, unknown>): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', ...a }] });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    const drag = (fx: number, fy: number, tx: number, ty: number): void => act({ key: 'drag', x: fx, y: fy, values: [tx, ty], phase: 'drag' }); // 壳层合成同形
    for (let i = 0; i < 10; i++) e.world.tick(); // 回合1 备战
    // 直注 3 张关羽席位 marker（绕过商店牌序的购买路径——merge 只认 PrefabOrigin 家族，与来源无关）
    [-66, -22, 22].forEach((x, i) => {
      e.world.createEntity(`mreq${i}`);
      e.world.addComponent(`mreq${i}`, { type: 'SpawnRequest', templateId: 'bench_a_guanyu', x, y: 178 });
    });
    for (let i = 0; i < 6; i++) e.world.tick();
    // 三连合成取**最老** 3 个 = 开局在板关羽(seq 最小) + 前 2 张注入席卡 → 锚在最老（板上）→
    // 产物继承其格 = **原地升星**（merge-rule 出身格继承，REQ-F-049；正是金铲铲"场上单位就地升星"观感）。
    const b2all = e.world.getAllEntities().filter((id) => id.startsWith('bench2_a_guanyu#') && id.endsWith(':seat'));
    expect(b2all).toHaveLength(1);
    const b2 = b2all[0];
    const home = offsetToAxial(2, 4); // 关羽经典站位（7×8 盘视觉 2,4）
    const b2hex = e.world.getComponent<HexPos>(b2, 'HexPos')!;
    expect([b2hex.q, b2hex.r]).toEqual([home.q, home.r]); // 板上合成 → 产物留板上原格
    expect(alive(e, b2.replace(/:seat$/, ':star'))).toBe(true); // ★★ 角标随体
    expect(e.world.getAllEntities().filter((id) => id.startsWith('bench_a_guanyu#') && id.endsWith(':seat'))).toHaveLength(1); // 第 3 张注入卡幸存在席
    expect(res('bench_space')).toBe(8); // 派生回账：席上只剩 1 张幸存卡 → 9−1（在板 marker 不占席，F-052 onBoard:false）
    let guard2 = 0;
    while (!flag(e, 'in_combat') && guard2++ < 100) e.world.tick();
    for (let i = 0; i < 10; i++) e.world.tick(); // 入战拍成型
    const gys = mains(e).filter((id) => id.startsWith('hero_a_guanyu#'));
    expect(gys).toHaveLength(1); // 在板的二星出兵；席上幸存的一星不出兵（requireHexPos 门）
    const hp = e.world.getComponent<Resource>(gys[0], 'Resource')!;
    expect(hp.max).toBe(Math.round((240 * 18 + 120) * 1.8)); // finalHp(关羽含玉玺) × 1.8 = 7992（二星数值烘在模板族）
    expect(e.world.getComponent<SelfRule>(gys[0], 'SelfRule')!.do[0].template).toBe('strike_a_guanyu_s2');
    // 星级卖价（战斗窗卖：income 窗已关，金额断言不吃利息带宽）：点板上二星席=sell2 → +8 金（棋子本回合继续打）
    const g0 = res('gold');
    const p = project(home.q, home.r);
    drag(p.x, p.y, 200, 118); // 板上二星拖进垃圾桶=卖出（任何相位可卖，REQ-F-058）
    for (let i = 0; i < 5; i++) e.world.tick();
    expect(e.world.getAllEntities().includes(b2)).toBe(false); // 点谁卖谁（板上也可卖）
    expect(res('gold')).toBe(g0 + 8); // 2星卖价 = 3×3−1（§4.6）
  });

  it('摆子拖拽（F-18/REQ-F-045+049+050 全量）：备战拖上板吸附格=出兵点、人口限额拒超、战斗期锁拖', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const drag = (fx: number, fy: number, tx: number, ty: number): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', key: 'drag', x: fx, y: fy, values: [tx, ty], phase: 'drag' }] });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    const pos = (id: string): Transform => e.world.getComponent<Transform>(id, 'Transform')!;
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(flag(e, 'in_prep')).toBe(true); // 备战相位门开（flow prep onEnter 维护）
    e.world.createEntity('mreq');
    e.world.addComponent('mreq', { type: 'SpawnRequest', templateId: 'bench_a_zhaoyun', x: 0, y: 0 });
    e.world.createEntity('mreq2');
    e.world.addComponent('mreq2', { type: 'SpawnRequest', templateId: 'bench_a_zhuge', x: 0, y: 0 });
    for (let i = 0; i < 3; i++) e.world.tick();
    const seat = e.world.getAllEntities().find((id) => id.startsWith('bench_a_zhaoyun#') && id.endsWith(':seat') && !e.world.getComponent(id, 'HexPos'))!;
    const seat2 = e.world.getAllEntities().find((id) => id.startsWith('bench_a_zhuge#') && id.endsWith(':seat') && !e.world.getComponent(id, 'HexPos'))!;
    // 托盘自动落座（REQ-F-055）：两张新卡按 id 序占 0/1 号槽（出生点无谓，托盘收口）
    expect([pos(seat).x, pos(seat).y]).toEqual([-176, 118]);
    expect([pos(seat2).x, pos(seat2).y]).toEqual([-132, 118]);
    // 席内拖拽互换：把 0 号拖到 1 号槽上 → 两席对调
    drag(-176, 118, -132, 118);
    expect([pos(seat).x, pos(seat2).x]).toEqual([-132, -176]);
    // 人口限额：开局 4 marker 在板 = level 4 满员 → 第 5 个拖上板整次拒绝（弹回席位）
    const a55 = offsetToAxial(5, 5);
    const c55 = project(a55.q, a55.r);
    drag(-132, 118, c55.x, c55.y);
    expect(e.world.getComponent(seat, 'HexPos')).toBeFalsy(); // 拒单
    expect([pos(seat).x, pos(seat).y]).toEqual([-132, 118]); // 托盘弹回原槽（地上不留单位）
    // 腾位（拖开局赵云 marker 下板）后再上 → 放行 + 吸附格写 HexPos + Transform=格投影
    const zhaoSeat = e.world.getAllEntities().find((id) => id.startsWith('bench_a_zhaoyun#') && id.endsWith(':seat') && id !== seat && e.world.getComponent(id, 'HexPos'))!;
    expect(zhaoSeat).toBeTruthy();
    const zt = pos(zhaoSeat);
    drag(zt.x, zt.y, 0, -200); // 拖出板（落点选板上方，避开左右两侧垃圾桶；失格即回席，托盘自动落座）
    expect(e.world.getComponent(zhaoSeat, 'HexPos')).toBeFalsy(); // 回席（板外落点移除 HexPos）
    e.world.tick();
    expect(e.world.getComponent(zhaoSeat, 'TraySeat')).toBeTruthy(); // 托盘把回席者捡进空槽
    drag(-132, 118, c55.x, c55.y);
    const hex = e.world.getComponent<HexPos>(seat, 'HexPos')!;
    expect([hex.q, hex.r]).toEqual([a55.q, a55.r]); // 吸附格
    expect(pos(seat).x).toBeCloseTo(c55.x, 5); // 投影贴格
    expect(e.world.getComponent(seat, 'TraySeat')).toBeFalsy(); // 上板让座
    // 战斗期锁拖（onlyFlag 门）
    let guard = 0;
    while (!flag(e, 'in_combat') && guard++ < 100) e.world.tick();
    expect(flag(e, 'in_prep')).toBe(false); // 开战即关门
    drag(c55.x, c55.y, -110, 118);
    const hex2 = e.world.getComponent<HexPos>(seat, 'HexPos')!;
    expect([hex2.q, hex2.r]).toEqual([a55.q, a55.r]); // 战斗期拖拽被拒：格不变
  });
});
