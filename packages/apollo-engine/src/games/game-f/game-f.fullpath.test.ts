import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { buildGameFBlueprint } from './blueprint.js';
import { GAME_F_UI } from './game-f-ui.js';
import { collectButtons } from '@ui/shell/GameShell.js';
import { FAST, flag } from './game-f.helpers.js';
import { fullPathProbe, scanNonFinite, crawlStates, type FireFn } from '../../runtime/fullpath-probe.js';

// ═══════════════════════════════════════════════════════════════
//  Loop B — game-f 全路径回归：枚举 GAME_F_UI 声明的**所有按钮** → 逐个点（投信号）→ tick →
//  断言「不抛错 / 无 NaN/Infinity / 整串两遍逐步 hash 一致」。无浏览器、确定性、数据驱动
//  （按钮即数据可枚举，状态可 hash）—— 这正是数据驱动游戏比手写 UI 易做全路径回归的红利。
// ═══════════════════════════════════════════════════════════════

const makeEngine = () => {
  const e = new Engine({ tickRate: 60 });
  e.load(buildGameFBlueprint(FAST));
  for (let i = 0; i < 6; i++) e.world.tick(); // 预热到可交互（开局备战）
  return e;
};

// 点一个 GameShell 按钮 = 往输入总线投一条具名动作 {key:signal, phase:'action'}（keybind 桥，非空间）。
const fire: FireFn = (e, signal) => {
  if (!e.world.getAllEntities().includes('input')) e.world.createEntity('input');
  e.world.addComponent('input', { type: 'InputQueue', actions: [{ source: 'probe', key: signal, phase: 'action' }] });
  e.world.tick(); // keybind 命中 → Signal{name:signal} → 既有 EventWhen/Effect 链消费
  e.world.addComponent('input', { type: 'InputQueue', actions: [] });
};

describe('game-f 全路径回归（Loop B）— 点遍所有声明按钮', () => {
  const signals = collectButtons(GAME_F_UI.root).map((b) => b.signal);

  it('按钮爬虫非空（含核心 ready/buyxp/reroll + 商店 3 槽）', () => {
    expect(signals.length).toBeGreaterThanOrEqual(6);
    expect(signals).toEqual(
      expect.arrayContaining(['ready_btn', 'buyxp_btn', 'reroll_btn', 'buy_slot_1', 'buy_slot_2', 'buy_slot_3']),
    );
  });

  it('开局世界基线无非有限数', () => {
    expect(scanNonFinite(makeEngine().world)).toEqual([]);
  });

  it('点遍每个按钮：不抛错、无 NaN/Infinity、整串两遍逐步 hash 一致', () => {
    const report = fullPathProbe(makeEngine, fire, signals, { ticksPerAction: 8 });
    const bad = report.perSignal.filter((r) => !r.ok);
    expect(
      bad,
      `报错/非有限数的按钮：\n${bad.map((b) => `  ${b.signal}: ${b.error ?? (b.nonFinite ?? []).join(', ')}`).join('\n')}`,
    ).toEqual([]);
    expect(report.deterministic, `确定性发散于 step ${report.divergedAt?.step}（${report.divergedAt?.signal}）`).toBe(true);
    expect(report.ok).toBe(true);
  });

  it('BFS 状态图爬：从备战逐个点按钮发现多个状态，全程无报错/无 NaN（战斗态当叶不展开）', () => {
    const fmt = (xs: { path: string[]; signal: string; detail: string }[]) =>
      xs.map((x) => `  [${x.path.join('→')}]→${x.signal}: ${x.detail}`).join('\n');
    const report = crawlStates(makeEngine, fire, signals, {
      maxStates: 60,
      maxDepth: 4,
      ticksPerAction: 5,
      expand: (e) => !flag(e, 'in_combat'), // 战斗=连续态（每 tick 新 hash）→ 发现即可，不深入展开
    });
    expect(report.errors, `报错复现路径:\n${fmt(report.errors)}`).toEqual([]);
    expect(report.nonFinite, `NaN/Inf 复现路径:\n${fmt(report.nonFinite)}`).toEqual([]);
    expect(report.states, 'BFS 应分叉出多个状态').toBeGreaterThan(1);
  }, 30000);
});
