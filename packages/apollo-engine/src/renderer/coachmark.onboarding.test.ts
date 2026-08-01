import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Flag, EventWhen, Effect, Coachmark } from '@engine/protocol/components.js';
import { eventWhenCapability } from '@skills/tier2/event-when.js';
import { effectApplyCapability } from '@skills/tier2/effect-apply.js';
import { collectActiveCoachmarks } from './coachmark.js';

// ═══════════════════════════════════════════════════════════════
//  端到端「首次使用某功能即引导」**全数据样例**（REQ-ARCH-COACH 验收 + 给游戏程序照抄的参考接线）。
//  证明逻辑层**零引擎新增**：触发 / 显隐 / 点对推进 / 看过不再弹 全用 EventWhen + Effect + Flag + save 重组；
//  引擎只提供 Coachmark 组件 + OnboardingOverlay 渲染器。
//  ★ 关键：推进走 **effect-apply 的 onSignal**（不是 flow 的 signal 条件——ConditionExpr 无 signal kind），
//    这正是 owner 主诉求「每功能首触」的干净形（独立、懒触发、无 GameFlow）。
// ═══════════════════════════════════════════════════════════════

function onboardingWorld(): World {
  const w = new World();
  for (const s of eventWhenCapability.systems) w.addSystem(s);
  for (const s of effectApplyCapability.systems) w.addSystem(s);
  const ent = (id: string, c: object): void => { w.createEntity(id); w.addComponent(id, c as never); };
  // —— 持久状态（进 hash + 存档）——
  ent('f_seen', { type: 'Flag', id: 'seen_buy', active: false } as Flag);   // 看过没（save 持久化 → 永不再弹）
  ent('f_shop', { type: 'Flag', id: 'shop_open', active: true } as Flag);   // 功能可见（商店开着）
  ent('f_coach', { type: 'Flag', id: 'coach_buy', active: false } as Flag); // 当前是否在教「买」(驱动高亮显隐)
  ent('f_click', { type: 'Flag', id: 'did_click', active: false } as Flag); // 测试桩：点了「买」没（真实游戏=Clickable 产信号，见下）
  // —— 触发：第一次开商店（not seen ∧ shop_open）→ 发信号 → 置 coach_buy（亮高亮）——
  ent('ew', { type: 'EventWhen', signal: 'show_coach_buy', mode: 'edge', armed: false,
    when: { kind: 'and', of: [{ kind: 'not', of: { kind: 'flag', id: 'seen_buy' } }, { kind: 'flag', id: 'shop_open' }] } } as EventWhen);
  ent('e_show', { type: 'Effect', onSignal: 'show_coach_buy', kind: 'set-flag', targetId: 'coach_buy', value: true } as Effect);
  // —— 点对了才推进：clicked_buy 信号 → 关高亮 + 置 seen。**真实游戏**：买按钮挂 `Clickable{onlyFlag:'coach_buy', signal:'clicked_buy'}`
  //   （点错的框无门、不响应）；本测试用 flag 门控的 EventWhen 在 tick 内产同名信号当桩（信号须系统内产、effect-apply 同拍消费）。
  ent('ew_click', { type: 'EventWhen', signal: 'clicked_buy', mode: 'edge', armed: false, when: { kind: 'flag', id: 'did_click' } } as EventWhen);
  ent('e_off', { type: 'Effect', onSignal: 'clicked_buy', kind: 'set-flag', targetId: 'coach_buy', value: false } as Effect);
  ent('e_seen', { type: 'Effect', onSignal: 'clicked_buy', kind: 'set-flag', targetId: 'seen_buy', value: true } as Effect);
  // —— 引擎高亮：一条 Coachmark，可见性绑 coach_buy（流程置真即亮）——
  ent('mark', { type: 'Coachmark', anchor: 'buy_btn', text: '第一次来？点这里抽牌建你的库', visibleWhen: 'coach_buy' } as Coachmark);
  return w;
}
const shows = (w: World): string[] => collectActiveCoachmarks(w).map((m) => m.anchor);
const flagOf = (w: World, id: string): boolean => {
  for (const [e] of w.query('Flag')) { const f = w.getComponent<Flag>(e, 'Flag'); if (f?.id === id) return f.active; }
  return false;
};
const click = (w: World): void => { // 点「买」= 置 did_click（下一 tick EventWhen 在拍内产 clicked_buy 信号）
  for (const [e] of w.query('Flag')) { const f = w.getComponent<Flag>(e, 'Flag'); if (f?.id === 'did_click') f.active = true; }
};

describe('coachmark · 端到端首触引导（全数据重组 · REQ-ARCH-COACH 验收 + 参考样例）', () => {
  it('首次开商店→高亮显；点对→高亮灭+置 seen；snapshot 重载→不再弹', () => {
    const w = onboardingWorld();
    expect(shows(w)).toEqual([]); // 初始未触发

    w.tick(); // 触发：EventWhen(not seen ∧ shop_open) → show_coach_buy → Effect 置 coach_buy
    expect(shows(w)).toEqual(['buy_btn']); // 高亮亮起

    click(w); w.tick(); // 点「买」→ clicked_buy → 关 coach_buy + 置 seen_buy
    expect(shows(w)).toEqual([]); // 高亮灭
    expect(flagOf(w, 'seen_buy')).toBe(true);

    // 存档持久化 → 重载（snapshot/restore）：看过的不再弹
    const w2 = onboardingWorld();
    w2.restore(w.snapshot());
    expect(flagOf(w2, 'seen_buy')).toBe(true); // seen 跟存档回来
    w2.tick(); // 再开商店：not seen = 假 → 不触发
    expect(shows(w2)).toEqual([]);
  });
});
