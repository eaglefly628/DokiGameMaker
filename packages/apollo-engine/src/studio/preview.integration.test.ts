import { describe, it, expect } from 'vitest';
import { Engine } from '../runtime/engine.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import { demoBlueprint } from '../assembly/demo.assembly.js';
import { buildGameFBlueprint } from '../games/game-f/index.js';

// 透视器预览路径的集成保护：把每个真实游戏的蓝图喂进引擎、真的跑 tick、读快照。
// 这是项目里第一组"蓝图→引擎→运行"的集成测试（此前 SESSION-HANDOFF §4 自审：零集成、
// 所有游戏蓝图从未在真实 ECS 循环里被 load+tick 过）。透视器的实时预览正是依赖这条路径。
const cases: Array<[string, () => WorldBlueprint]> = [
  ['demo', () => demoBlueprint],
  ['game-f', () => buildGameFBlueprint()],
];

describe('数据透视器 · 预览路径集成（每个游戏蓝图 load+tick）', () => {
  for (const [name, build] of cases) {
    it(`${name}: load → 30 ticks 无异常，快照非空，hash 确定`, () => {
      const engine = new Engine({ tickRate: 60 });
      engine.load(build());
      expect(engine.world.getAllEntities().length).toBeGreaterThan(0);

      for (let i = 0; i < 30; i++) engine.world.tick();

      const snap = engine.world.snapshot();
      expect(Object.keys(snap).length).toBeGreaterThan(0);
      // 同一蓝图独立两次跑到同 tick → hash 必须一致（确定性，透视器"重跑"可复现）。
      const engine2 = new Engine({ tickRate: 60 });
      engine2.load(build());
      for (let i = 0; i < 30; i++) engine2.world.tick();
      expect(engine.hash()).toBe(engine2.hash());
    });
  }
});
