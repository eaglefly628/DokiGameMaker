import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { buildGameFBlueprint } from './blueprint.js';
import { GAME_F_UI } from './game-f-ui.js';
import { collectButtons, statDisplay, barFraction, readResource } from '@ui/shell/GameShell.js';
import { FAST } from './game-f.helpers.js';

// 去腐片4 验证（无浏览器）：用 GameShell 的纯绑定助手证明 GAME_F_UI 数据对 game-f 世界绑定正确。
// 渲染本身（React mount）browser-only，但「布局声明了对的 resource/signal」可在此钉死。
describe('去腐片4 · GAME_F_UI 布局数据绑定正确（GameShell 纯助手验证）', () => {
  const world = (() => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 6; i++) e.world.tick();
    return e.world;
  })();

  it('按钮信号齐全且走 keybind 桥（ready/buyxp/reroll + 商店 3 槽 buy_slot）', () => {
    const sigs = collectButtons(GAME_F_UI.root).map((b) => b.signal);
    expect(sigs).toEqual(expect.arrayContaining(['ready_btn', 'buyxp_btn', 'reroll_btn', 'buy_slot_1', 'buy_slot_2', 'buy_slot_3']));
  });

  it('stat/bar 绑到真实存在的 Resource（gold/hp/level/island/contribution 等）', () => {
    // 这些 id 都应在世界里有对应 Resource（绑定不悬空）。
    for (const id of ['stage_idx', 'round_idx', 'prep_left', 'win_streak', 'player_hp', 'level', 'xp', 'gold', 'bench_space', 'contribution', 'island_progress']) {
      expect(readResource(world, id), `Resource ${id} 应存在`).toBeDefined();
    }
    // 开局值投影：金币起手 5 → stat 文案含 5；满血 → hp 比例 1。
    expect(statDisplay(world, { bind: 'gold', icon: '🪙' })).toContain('5');
    expect(barFraction(world, 'player_hp')).toBe(1);
    expect(barFraction(world, 'island_progress')).toBe(0); // 攻岛从 0
  });
});
