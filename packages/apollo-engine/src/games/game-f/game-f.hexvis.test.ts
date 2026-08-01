import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { buildGameFBlueprint } from './blueprint.js';
import { FAST, flag } from './game-f.helpers.js';
import {
  TEAM_A, TEAM_B, WARRIOR, TACTICIAN, ASSASSIN, FACT_SHU, FACT_WEI, FACT_WU,
  FROZEN, PROTAG, LOOT, BAG, EQUIP, RUNE, BENCH_OCC, MARKER_VIS, PROJ, RESULT, BUSHO, BOW,
} from './constants.js';

// 回归：六角棋盘格在「备战」相位整盘消失、开战后才出现（用户报；dev+烧录都中）。
// 根因 = item_bag（隐形 380×320 全盘收集框，Tag=BAG）与 marker 显隐位 MARKER_VIS 撞同一 bit(1<<19)。
// ph_prep 的 set-visible-tagged(MARKER_VIS,true) 顺带把 item_bag 点亮 → 大方块糊住 zOrder0 的六角格；
// ph_combat 的 (…,false) 又藏回去 → 战斗期六角格重现。修法：BAG 挪到空闲 bit，与 MARKER_VIS 解耦。
describe('Game F · 六角棋盘格备战期可见（BAG↔MARKER_VIS 撞位回归）', () => {
  it('备战期 item_bag 仍隐形（不糊棋盘）', () => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameFBlueprint(FAST));
    for (let i = 0; i < 12; i++) e.world.tick(); // 进备战、ph_prep 已发
    expect(flag(e, 'in_combat')).toBe(false);
    const vis = e.world.getComponent('item_bag', 'Visibility') as { visible: boolean } | undefined;
    expect(vis?.visible).toBe(false); // 撞位时此处会被翻成 true → 大方块覆盖六角格
  });

  it('Tag 位常量两两不撞（杜绝再现「相位误翻常驻实体」）', () => {
    const named: Array<[string, number]> = [
      ['TEAM_A', TEAM_A], ['TEAM_B', TEAM_B], ['WARRIOR', WARRIOR], ['TACTICIAN', TACTICIAN],
      ['ASSASSIN', ASSASSIN], ['FACT_SHU', FACT_SHU], ['FACT_WEI', FACT_WEI], ['FACT_WU', FACT_WU],
      ['FROZEN', FROZEN], ['PROTAG', PROTAG], ['LOOT', LOOT], ['BAG', BAG], ['EQUIP', EQUIP],
      ['RUNE', RUNE], ['BENCH_OCC', BENCH_OCC], ['MARKER_VIS', MARKER_VIS], ['PROJ', PROJ],
      ['RESULT', RESULT], ['BUSHO', BUSHO], ['BOW', BOW],
    ];
    const seen = new Map<number, string>();
    for (const [name, bit] of named) {
      const prev = seen.get(bit);
      expect(prev, `位 ${Math.log2(bit)} 同时被 ${prev} 与 ${name} 占用`).toBeUndefined();
      seen.set(bit, name);
    }
  });
});
