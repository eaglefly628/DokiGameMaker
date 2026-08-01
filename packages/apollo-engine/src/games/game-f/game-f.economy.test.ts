import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import type { Resource, Transform, CardPile } from '@engine/protocol/components.js';
import { buildGameFBlueprint } from './blueprint.js';
import { GAME_F_TEMPLATES } from './combat.js';
import { PVE_CODES } from './stages.js';
import { unitByCode } from './taikou.js';
import { FAST, alive, mains, flag } from './game-f.helpers.js';

describe('Game F · 经济/商店（买入/刷新/卖出/经验连败/羁绊/符文/主角/装备/野怪法球/HUD）', () => {
  it('商店买入核心（F-11/REQ-F-040 + v2 §4.6）：钱不够原子拒单（牌不丢金不动）；付得起则扣金占席、据码入备战席、bought_code 复位', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    const play0 = (): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'shop', key: 'play', values: [0] }] });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    // 起手金 5 → 先降到 2 以验「钱不够原子拒单」（备战期无收入窗，停在 2）
    e.world.addComponent('r_gold', { type: 'ResourceModify', resourceId: 'gold', amount: -3, scope: 'local' });
    for (let i = 0; i < 2; i++) e.world.tick();
    expect(res('gold')).toBe(2); // 2 金 < 3 买不起
    play0();
    for (let i = 0; i < 3; i++) e.world.tick();
    expect(res('gold')).toBe(2); // 拒单：金不动
    expect(res('bench_space')).toBe(9); // 席位不动
    expect(e.world.getAllEntities().filter((id) => id.startsWith('bench_') && id.endsWith(':seat'))).toHaveLength(4); // 无新 marker（只有开局 4 个在板，牌也不丢——引擎拒单五断言盖）
    // 注资 → 买成：等到 r2 备战（结算窗外注资才不蹭利息带）；r2 自动刷新后手牌=[1,3,1] → 槽0 = 1 = 关羽
    let r2guard = 0;
    while (res('round_idx') === 1 && r2guard++ < 4000) e.world.tick();
    for (let i = 0; i < 10; i++) e.world.tick(); // r2 备战早段（刷新已过）
    e.world.addComponent('r_gold', { type: 'ResourceModify', resourceId: 'gold', amount: 10, scope: 'local' });
    for (let i = 0; i < 2; i++) e.world.tick();
    const gFunded = res('gold');
    play0();
    for (let i = 0; i < 6; i++) e.world.tick();
    expect(res('gold')).toBe(gFunded - 3); // 原子扣价
    expect(res('bench_space')).toBe(8); // 占 1 席
    expect(e.world.getAllEntities().some((id) => id.startsWith('bench_a_guanyu#') && id.endsWith(':seat') && !e.world.getComponent(id, 'HexPos'))).toBe(true); // 据码（r2 刷新后槽0=1=关羽）入**席**（开局在板关羽带格不混；托盘自动落座）
    expect(res('bought_code')).toBe(0); // 复位（防同码二连买 edge 失效）
  });

  it('商店余三件（F-12/REQ-F-041）：prep 自动刷新换牌；锁店跳过刷新且开战自动解锁；点席卖出返还金+席位', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    const hand = (): string => e.world.getComponent<CardPile>('shop', 'CardPile')!.hand.join(',');
    const click = (x: number, y: number): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', x, y, phase: 'down' }] });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    // 回合1 prep 自动刷新：初发 [3,1,5] 回袋底、换下一批 → 手牌 ≠ 初发（REQ-F-054 卡池守恒；6 将库牌袋）
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(hand()).toBe('2,6,4'); // 弃 [3,1,5] 回袋底，补 deck 第 4-6 张（确定性，6 将库牌袋）
    // 点「锁店」→ 打完回合1 → 回合2 prep 自动刷新被门挡（手牌不变）→ 开战拍自动解锁
    click(300, 120);
    expect(flag(e, 'shop_locked')).toBe(true);
    let guard = 0;
    while (res('round_idx') === 1 && guard++ < 4000) e.world.tick();
    const handAtR2 = hand();
    for (let i = 0; i < 10; i++) e.world.tick(); // 回合2 prep 早段：刷新窗已过
    expect(hand()).toBe(handAtR2); // 锁店生效：没换牌
    let guard2 = 0;
    while (!flag(e, 'in_combat') && guard2++ < 100) e.world.tick(); // 到开战拍
    expect(flag(e, 'shop_locked')).toBe(false); // 开战自动解锁（次序在刷新门判定之后）
    // 手动刷新 $2：注资后点「刷新」→ 扣 2 金 + 换牌（锁着也能花钱换——先验证解锁态即可）
    e.world.addComponent('r_gold', { type: 'ResourceModify', resourceId: 'gold', amount: 10, scope: 'local' });
    for (let i = 0; i < 2; i++) e.world.tick();
    const goldBefore = res('gold');
    const handBefore = hand();
    click(300, 150);
    for (let i = 0; i < 4; i++) e.world.tick();
    expect(res('gold')).toBe(goldBefore - 2); // 原子扣 2 金
    expect(hand()).not.toBe(handBefore); // 真换牌
    // 卖出：先买一个（手牌槽0）→ 点其席位 → marker 没了、金 +2、席位回 9
    const buyGold = res('gold');
    if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
    e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'shop', key: 'play', values: [0] }] });
    e.world.tick();
    e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    for (let i = 0; i < 6; i++) e.world.tick();
    expect(res('gold')).toBe(buyGold - 3);
    expect(res('bench_space')).toBe(8);
    // 买入的 marker 在**席上**（无 HexPos）——开局 4 个 marker 在板上，按无格过滤认准刚买的那张
    const marker = e.world.getAllEntities().find((id) => id.startsWith('bench_') && id.endsWith(':seat') && !e.world.getComponent(id, 'HexPos'))!;
    expect(marker).toBeTruthy();
    const mt = e.world.getComponent<Transform>(marker, 'Transform')!;
    e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', key: 'drag', x: mt.x, y: mt.y, values: [200, 118], phase: 'drag' }] }); // 拖进垃圾桶=卖出（REQ-F-058；点选卖出已停用）
    e.world.tick();
    e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    for (let i = 0; i < 5; i++) e.world.tick();
    expect(e.world.getAllEntities().includes(marker)).toBe(false); // 席位销毁（点谁卖谁 '@signal-source'）
    expect(res('gold')).toBe(buyGold - 3 + 2); // 卖价 2 返还
    expect(res('bench_space')).toBe(9); // 席位归还
  });

  it('MVP-1 尾款（§4.1/§4.3）：买经验$4=+4XP且 xp 阈值升级；连败计数随败累加（连败金 band 与连胜同形）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    const click = (x: number, y: number): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', x, y, phase: 'down' }] });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    for (let i = 0; i < 50; i++) e.world.tick(); // 进战斗（income_armed 已关：避开利息区间带对注资/消费的边沿响应——带宽语义见 finish-list Gotchas）
    expect(res('xp')).toBe(2); // 回合1 prep 自动 +2 XP（§4.3）
    expect(res('level')).toBe(4); // 起始等级=现固定阵容人口
    e.world.addComponent('r_gold', { type: 'ResourceModify', resourceId: 'gold', amount: 30, scope: 'local' });
    for (let i = 0; i < 2; i++) e.world.tick();
    const g0 = res('gold');
    for (let k = 0; k < 5; k++) { click(300, 64); for (let i = 0; i < 2; i++) e.world.tick(); } // 买经验 ×5
    expect(res('xp')).toBe(22); // 2 + 5×4
    expect(res('gold')).toBe(g0 - 20); // $4×5 原子扣费
    expect(res('level')).toBe(6); // 阈值下调 8/18/30/44：xp22 → 4+2=6（买经验看得见升级）
    // 连败计数：杀光我方 → 败方路径 → lose_streak +1（连败金 band 与连胜金同构同测法）
    for (const m of mains(e).filter((id) => id.startsWith('hero_a_'))) {
      e.world.addComponent(m, { type: 'ResourceModify', resourceId: 'hp', amount: -99999, scope: 'local' });
    }
    let guard = 0;
    while (res('lose_streak') === 0 && guard++ < 200) e.world.tick();
    expect(res('lose_streak')).toBe(1); // 败 → 连败+1（胜路清零由 flow 同一转移对称保证）
  });

  it('F-16 三件（REQ-F-044/047/048②）：蜀魂羁绊开战锁存 ×1.2；卖出归还牌袋（deck 回长）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    const deckLen = (): number => e.world.getComponent<CardPile>('shop', 'CardPile')!.deck.length;
    const input = (actions: unknown[]): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    // 羁绊：场上蜀将 4（关羽/赵云/诸葛/张飞，单机纯蜀 vs 魏世界观）→ ≥3 阈值开战拍锁存 dmg_scale_a=1.2
    let guard = 0;
    while (!flag(e, 'in_combat') && guard++ < 100) e.world.tick();
    for (let i = 0; i < 3; i++) e.world.tick();
    expect(res('count_shu')).toBe(4); // group-count 按 FACT_SHU 计场上（纯蜀 4 将）
    expect(res('dmg_scale_a')).toBeCloseTo(1.2); // 蜀魂 ≥3 锁存（prep 复位 ×1，下回合重判）
    // 卖出袋归还：注资买 1（deck 抽 1 补手 → 净 -1）→ 点席卖 → 码归还袋底（净回 +1）
    e.world.addComponent('r_gold', { type: 'ResourceModify', resourceId: 'gold', amount: 10, scope: 'local' });
    for (let i = 0; i < 2; i++) e.world.tick();
    input([{ source: 'shop', key: 'play', values: [0] }]);
    for (let i = 0; i < 6; i++) e.world.tick();
    const afterBuy = deckLen();
    const seat = e.world.getAllEntities().find((id) => id.startsWith('bench_') && id.endsWith(':seat') && !e.world.getComponent(id, 'HexPos'))!; // 刚买的在席（开局 4 marker 在板，过滤）
    const st = e.world.getComponent<Transform>(seat, 'Transform')!;
    input([{ source: 'test', key: 'drag', x: st.x, y: st.y, values: [200, 118], phase: 'drag' }]); // 拖进垃圾桶=卖出（REQ-F-058）
    for (let i = 0; i < 6; i++) e.world.tick();
    expect(e.world.getAllEntities().includes(seat)).toBe(false); // 席位售出销毁
    expect(deckLen()).toBe(afterBuy + 1); // 码归还袋底（§4.6 有限袋语义保真）
    expect(res('sold_code')).toBe(0); // 引擎自清
  });

  it('开局符文三选一（批D）：点「屯粮」金+5、三卡整组收走（一次性）；不点不影响流程', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    const click = (x: number, y: number): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', x, y, phase: 'down' }] });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    for (let i = 0; i < 5; i++) e.world.tick();
    expect(alive(e, 'rune_a')).toBe(true); // 三卡在场
    const g0 = res('gold');
    click(-110, -100); // 选「屯粮」
    for (let i = 0; i < 4; i++) e.world.tick();
    expect(res('gold')).toBe(g0 + 5); // 生效（用户：三选一屯粮 10→5 金；收入/利息窗已移到结算）
    expect(alive(e, 'rune_a')).toBe(false); // 整组收走（含被点那张）
    expect(alive(e, 'rune_b')).toBe(false);
    expect(alive(e, 'rune_c')).toBe(false);
  });

  it('主角小小英雄（批C，§4.7）：常驻不参战不被清场；碰法球两清、赏金入账金币后清零', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(alive(e, 'protag')).toBe(true);
    const goldBefore = res('gold');
    // 在主角脚下生成一颗法球（模拟野怪掉落落点重合）→ 双向 hitbox 两清
    e.world.createEntity('lootreq');
    e.world.addComponent('lootreq', { type: 'SpawnRequest', templateId: 'loot_orb', x: -150, y: 86 });
    for (let i = 0; i < 8; i++) e.world.tick();
    expect(e.world.getAllEntities().some((id) => id.startsWith('loot_orb#'))).toBe(false); // 球真结算一次后同拍自毁（044 consumeOnHit）
    expect(res('gold')).toBe(goldBefore + 5); // 赏金入账（loot→valueFrom→gold）
    expect(res('loot')).toBe(0); // 本地袋清零
    // 跑完回合 1 清场 → 主角与名牌仍常驻
    let wiped = false;
    for (let i = 0; i < 4000 && !wiped; i++) { e.world.tick(); wiped = mains(e).length === 0; }
    for (let i = 0; i < 5; i++) e.world.tick();
    expect(alive(e, 'protag')).toBe(true);
    expect(alive(e, 'protag_name')).toBe(true);
  });

  it('装备系统（A）：敌将（魏）死掉装备 orb → 主公行囊拾取 → items 累加（开局空、战中掉、入装备栏）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(res('items')).toBe(0); // 开局装备栏空
    // 在主公(行囊)脚下落一个魏将死亡掉落（含装备 orb，仅 B 方掉）→ 行囊（跟随主公）拾取
    e.world.createEntity('eqreq');
    e.world.addComponent('eqreq', { type: 'SpawnRequest', templateId: 'death_b_zhangliao', x: -150, y: 86 });
    for (let i = 0; i < 8; i++) e.world.tick();
    expect(res('items')).toBe(1); // 拾取入账 +1（装备 orb Hitbox→行囊 BAG，consumeOnHit）
    expect(e.world.getAllEntities().some((id) => id.startsWith('death_b_zhangliao#') && id.endsWith(':eorb'))).toBe(false); // orb 同拍自毁
    // 我方（蜀）死亡不掉装备（防自 farm）
    e.world.createEntity('eqreq2');
    e.world.addComponent('eqreq2', { type: 'SpawnRequest', templateId: 'death_a_guanyu', x: -150, y: 86 });
    for (let i = 0; i < 8; i++) e.world.tick();
    expect(res('items')).toBe(1); // 蜀死无装备 orb → 不增
  });

  it('P1 自动拾取：敌死在棋盘任意处(非主公脚下)→ 装备 orb 全盘自动归集 items（删捡 orb 摩擦）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) { const r = e.world.getComponent<Resource>(x, 'Resource'); if (r && r.id === id) return r.current; }
      return -1;
    };
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(res('items')).toBe(0);
    // 敌将死在棋盘正中(0,0)——离主公行囊原脚下(-150,86)很远；全盘收集体应仍自动归集。
    e.world.createEntity('eqfar');
    e.world.addComponent('eqfar', { type: 'SpawnRequest', templateId: 'death_b_zhangliao', x: 0, y: 0 });
    for (let i = 0; i < 8; i++) e.world.tick();
    expect(res('items')).toBe(1); // 棋盘中央击杀 → 自动入袋（不需主公走过去）
  });

  it('P1 概率掉落：名将/Boss(mob_death) 掉装备 orb，杂兵(mob_death_bare) 不掉；按 seg 确定性、零 RNG', () => {
    const T = GAME_F_TEMPLATES;
    expect((T['mob_death'] as { entities: Record<string, unknown> }).entities.eorb).toBeDefined();        // 名将掉装备
    expect((T['mob_death_bare'] as { entities: Record<string, unknown> }).entities.eorb).toBeUndefined();  // 杂兵不掉
    expect((T['mob_death_bare'] as { entities: Record<string, unknown> }).entities.orb).toBeDefined();     // 但仍掉金法球
    // 足轻(beachhead)→bare；名将(kokujin/tenshu)→full
    const drop = (code: string): string => (T[`mob_${code}`] as { entities: { main: { Mortal: { dropTemplate: string } } } }).entities.main.Mortal.dropTemplate;
    expect(drop('ash_yari')).toBe('mob_death_bare');  // 杂兵
    const named = PVE_CODES.find((c) => unitByCode(c)?.seg !== 'beachhead')!;
    expect(drop(named)).toBe('mob_death');            // 名将/Boss
  });

  it('野怪回合+法球（批B，一图流）：阶段1 全野怪（黄巾波次）；野怪死亡掉法球；结算清场含未拾法球', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 50; i++) e.world.tick();
    expect(mains(e).filter((m) => m.startsWith('mob_'))).toHaveLength(6); // W1=枪足轻×4+弓足轻×2
    expect(mains(e).filter((m) => m.startsWith('hero_b_'))).toHaveLength(0); // 无 PvP 敌阵（整段野怪化）
    const mob = mains(e).find((m) => m.startsWith('mob_'))!;
    e.world.addComponent(mob, { type: 'ResourceModify', resourceId: 'hp', amount: -99999, scope: 'local' });
    for (let i = 0; i < 4; i++) e.world.tick();
    expect(e.world.getAllEntities().some((id) => id.startsWith('mob_death_bare#') && id.endsWith(':orb'))).toBe(true); // 杂兵(足轻)死掉金法球+碎裂（P1：杂兵走 mob_death_bare，仍掉金不掉装备）
    let wiped = false;
    for (let i = 0; i < 4000 && !wiped; i++) { e.world.tick(); wiped = mains(e).length === 0; }
    expect(wiped).toBe(true);
    for (let i = 0; i < 5; i++) e.world.tick();
    expect(e.world.getAllEntities().some((id) => id.endsWith(':orb') && id.startsWith('mob_death#'))).toBe(false); // 未拾法球随 wipe 清（Tag LOOT 不看模板名）
  });

  it('商店面板可视可点 + HUD 数字（F-14/F-15，REQ-F-042/043）：5 卡面随镜像重铺；点卡即买；金币数字实时', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    // HUD 金币显示已移入 DOM 壳层；canvas 商店卡退役，买入走 CardPile.play（DOM 点将台同款路径）。
    const buy = (slot: number): void => {
      if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
      e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'shop', key: 'play', values: [slot] }] });
      e.world.tick();
      e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    };
    for (let i = 0; i < 12; i++) e.world.tick(); // 刷新 → CardPile 补满三槽镜像
    expect(res('shop_slot_1')).toBeGreaterThan(0); // 三槽镜像有在售英雄码（壳层按码取脸图）
    expect(res('gold')).toBe(5); // 起手金 5（用户：10 太多）
    e.world.addComponent('r_gold', { type: 'ResourceModify', resourceId: 'gold', amount: 20, scope: 'local' });
    for (let i = 0; i < 3; i++) e.world.tick();
    const g0 = res('gold');
    buy(0); // 买第 1 张 = CardPile.play(0) → 扣金占席入备战台
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(res('gold')).toBe(g0 - 3); // 扣金
    expect(res('bench_space')).toBe(8); // 占席
    expect(e.world.getAllEntities().some((id) => id.startsWith('bench_') && id.endsWith(':seat'))).toBe(true); // 入席可见
    expect(res('shop_slot_1')).toBeGreaterThan(0); // 买走→补牌→镜像仍有在售码（壳层重绘）
  });
});
