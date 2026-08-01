import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import type { Resource } from '@engine/protocol/components.js';
import { buildGameFBlueprint, gameFEnemyPreview, TEAM_A, TEAM_B, rosterFor } from './blueprint.js';
import { FAST, alive, mains, flag } from './game-f.helpers.js';

describe('Game F · 流程/加载/名册（确定性/符文收走/ready开战/敌阵预览/6将库/run_flow/选阵营）', () => {
  it('蓝图可加载且确定（同初值重跑 hash 一致，含 prep 展开拍）', () => {
    const run = (): string => {
      const e = new Engine({ tickRate: 60 });
      e.load(buildGameFBlueprint(FAST));
      for (let i = 0; i < 80; i++) e.world.tick();
      return e.hash();
    };
    expect(run()).toBe(run());
  });

  it('开局符文开战自动收走（用户报「永远在屏幕中央」）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 12; i++) e.world.tick();
    expect(alive(e, 'rune_a')).toBe(true); // 回合1备战：符文三选一在场
    expect(alive(e, 'rune_title')).toBe(true); // 标题说明
    // 不点符文 → 开战拍 ph_combat 兜底收走（真打的时候去掉）
    let guard = 0;
    while (!flag(e, 'in_combat') && guard++ < 200) e.world.tick();
    for (let i = 0; i < 4; i++) e.world.tick();
    expect(alive(e, 'rune_a')).toBe(false); // 开战即清
    expect(alive(e, 'rune_title')).toBe(false);
  });

  it('ready 开战（§3.3 操作表）：注入点击信号 → 备战提前结束进 combat（40 拍倒计时兜底仍在）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(flag(e, 'in_combat')).toBe(false); // 备战中
    // 走真实输入路：InputQueue 指针事件（世界坐标）→ clickable 命中「开战」按钮 → 'ready_btn' Signal → Effect 置 ready。
    // （裸造 Signal 实体行不通：event-when 每拍全局先清后标，外来信号活不到 Commit 的 effect-apply。）
    e.world.createEntity('input');
    e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', x: 300, y: 180, phase: 'down' }] });
    e.world.tick(); // 命中 → 信号 → ready=true（同拍 Commit）
    e.world.addComponent('input', { type: 'InputQueue', actions: [] }); // 清空输入（单击语义）
    let entered = false;
    for (let i = 0; i < 15 && !entered; i++) {
      e.world.tick();
      entered = flag(e, 'in_combat');
    }
    expect(entered).toBe(true); // tick ~12-26 已开战 —— 远早于 40 拍兜底（兜底路径由其余测试天然覆盖）
  });

  it('去腐 keybind 桥：GameShell button→enqueueAction(信号) 走 InputQueue 具名动作 → KeyBinding 产信号 → ready（无需 canvas 指针命中）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(flag(e, 'in_combat')).toBe(false);
    // GameShell 路：enqueueAction('ready_btn') → InputQueue 具名动作 {key,phase:'action'}（非空间，无 x/y）。
    e.world.createEntity('input');
    e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'test', key: 'ready_btn', phase: 'action' }] });
    e.world.tick(); // keybind 命中 KeyBinding{key:'ready_btn'} → Signal{ready_btn} → eff_ready 置 ready
    e.world.addComponent('input', { type: 'InputQueue', actions: [] });
    let entered = false;
    for (let i = 0; i < 15 && !entered; i++) { e.world.tick(); entered = flag(e, 'in_combat'); }
    expect(entered).toBe(true); // 具名动作经 keybind 驱动开战 —— 假点击桥可退役
  });

  it('敌人预布阵（B）：英雄关返回敌阵坐标+将名供半透明预览；野怪回合返回空', () => {
    const p2 = gameFEnemyPreview(2, 1); // 阶段2「董卓先锋」=4 魏将
    expect(p2).toHaveLength(4);
    expect(p2.map((f) => f.name)).toContain('张辽');
    expect(p2.every((f) => typeof f.x === 'number' && typeof f.y === 'number')).toBe(true); // 世界坐标供投影
    expect(gameFEnemyPreview(1, 1)).toHaveLength(0); // 阶段1=野怪波，无英雄预览
    expect(gameFEnemyPreview(2, 5)).toHaveLength(0); // r5=野怪波，无英雄预览
    // 选魏阵营翻转：敌方变蜀将
    expect(gameFEnemyPreview(2, 1, 'wei').map((f) => f.name)).toContain('关羽');
  });

  it('蜀 6 将库（C）：roster 含 6 蜀（含商店专属马超/黄忠）；开局只播种原 4 将', () => {
    const shu = rosterFor('shu').filter((h) => h.team === TEAM_A);
    expect(shu).toHaveLength(6);
    expect(shu.map((h) => h.name)).toEqual(['关羽', '赵云', '诸葛亮', '张飞', '马超', '黄忠']);
    expect(shu.filter((h) => h.seed !== false)).toHaveLength(4); // 只原 4 将播种，新增 2 将商店专属
    // 加载实跑：开局在板 marker 仍 4（新增将不播种）
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 12; i++) e.world.tick();
    expect(e.world.getAllEntities().filter((id) => id.startsWith('bench_') && id.endsWith(':seat'))).toHaveLength(4);
  });

  it('L1 run_flow + §4.1/§4.2 表：回合1收入2金；advance 推进；败方按阶段表扣血；round>5 进位换关卡敌阵', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    for (let i = 0; i < 5; i++) e.world.tick();
    e.world.addComponent('r_gold', { type: 'ResourceModify', resourceId: 'gold', amount: -5, scope: 'local' }); // 归零起手金：本测试单验收入窗（§4.1 表）
    for (let i = 0; i < 45; i++) e.world.tick();
    expect(res('player_hp')).toBe(100); // §3.1 量程（boot 初始化，旧 20 为占位）
    expect(res('round_idx')).toBe(1);
    expect(res('stage_idx')).toBe(1);
    expect(res('gold')).toBe(0); // 本测试归零起手金，单验收入窗
    // 打完回合 1：r1 结算窗发第一笔 2 金 → L1 advance → 回合 2
    let guard = 0;
    while (res('round_idx') === 1 && guard++ < 4000) e.world.tick();
    expect(res('round_idx')).toBe(2);
    expect(res('gold')).toBe(2); // r1 结算：基础收入 2（无利息、无连胜金档）
    for (let i = 0; i < 50; i++) e.world.tick(); // 回合 2 备战（收入要等 r2 结算）
    expect(res('gold')).toBe(2);
    expect(res('player_hp')).toBe(flag(e, 'won') ? 100 : 98); // §4.2 阶段1败=基础0+存活近似2
    // 注入把 round_idx 推到 5（合法 sim 输入），打完该回合验证 >5 进位 banded：stage+1、round=1、敌阵换装
    e.world.addComponent('r_round_idx', { type: 'ResourceModify', resourceId: 'round_idx', amount: 3, scope: 'local' });
    let guard2 = 0;
    while (!(res('round_idx') === 1 && res('stage_idx') === 2) && guard2++ < 4000) e.world.tick();
    expect(res('stage_idx')).toBe(2); // when_stage_up：进位发生
    for (let i = 0; i < 60; i++) e.world.tick(); // 阶段 2 备战（40）→ 入战拍展开
    expect(mains(e).filter((id) => id.startsWith('hero_b_'))).toHaveLength(4); // 关卡表换敌阵：「董卓先锋」4 子全强度
  });

  it('T3/T4 贡献度 + 攻岛进度（单机 scaffold，纯数据 banded）：每波结算累加贡献；攻岛满 100=岛陷落→通关', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    const res = (id: string): number => {
      for (const x of e.world.getAllEntities()) {
        const r = e.world.getComponent<Resource>(x, 'Resource');
        if (r && r.id === id) return r.current;
      }
      return -1;
    };
    expect(res('contribution')).toBe(0); // 开局零贡献
    expect(res('island_progress')).toBe(0); // 攻岛进度从 0 起
    // 打完回合 1：结算窗（income_armed）按胜负累加贡献（胜=5/败=2，阶段1）。
    for (let i = 0; i < 5; i++) e.world.tick();
    let guard = 0;
    while (res('round_idx') === 1 && guard++ < 4000) e.world.tick();
    expect(res('contribution')).toBeGreaterThan(0); // 一波结算 → 贡献累加（与战斗胜负无关都累）
    if (flag(e, 'won')) expect(res('island_progress')).toBe(20); // 仅胜利波推进攻岛 +20
    // 攻岛进度满 100 → island_taken → run_flow round 态并行转移 victory → run_won（岛陷落通关）。
    e.world.addComponent('r_island', { type: 'ResourceModify', resourceId: 'island_progress', amount: 100, scope: 'local' });
    let g2 = 0;
    while (!flag(e, 'run_won') && g2++ < 4000) e.world.tick();
    expect(flag(e, 'island_taken')).toBe(true); // 岛陷落旗立
    expect(flag(e, 'run_won')).toBe(true); // 通关（与打穿关卡表并行的胜利条件）
  });

  it('开局选阵营=魏（REQ-F-061）：我方变魏将(a_zhangliao 下半场)、敌方变蜀将(b_guanyu 上半场)；蓝图确定可加载', () => {
    const WEI = { ...FAST, playerFaction: 'wei' as const };
    const run = (): string => {
      const e = new Engine({ tickRate: 60 });
      e.load(buildGameFBlueprint(WEI));
      for (let i = 0; i < 80; i++) e.world.tick();
      return e.hash();
    };
    expect(run()).toBe(run()); // 选魏一局同样确定（同初值重跑 hash 一致）
    const wr = rosterFor('wei');
    const ids = wr.map((h) => h.id);
    expect(ids).toContain('a_zhangliao'); // 魏将上位我方(a_)
    expect(ids).toContain('b_guanyu'); // 蜀将下位敌方(b_)
    expect(ids).not.toContain('a_guanyu'); // 关羽不再我方
    const zl = wr.find((h) => h.id === 'a_zhangliao')!;
    expect(zl.team).toBe(TEAM_A);
    expect(zl.r).toBeGreaterThanOrEqual(4); // 我方在下半场 r4-7（站位镜像）
    const gy = wr.find((h) => h.id === 'b_guanyu')!;
    expect(gy.team).toBe(TEAM_B);
    expect(gy.r).toBeLessThanOrEqual(3); // 敌方在上半场 r0-3
    // 选魏一局棋子真展开（开战拍我方魏将成型）
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(WEI));
    for (let i = 0; i < 80; i++) e.world.tick();
    expect(e.world.getAllEntities().some((id) => id.startsWith('hero_a_zhangliao#'))).toBe(true);
  });
});
