import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { buildGameFBlueprint } from './blueprint.js';
import { FAST } from './game-f.helpers.js';
import { frameSvg } from '@renderer/frame-svg.js';

// ═══════════════════════════════════════════════════════════════
//  game-f 视觉回归（C）—— SVG「截图」+ 快照 diff（无浏览器、确定）。
//  渲到 SVG 而非 PNG：node 无 GL 上下文（同 game-d/f/g render-frame 既定）。golden 落 __frames__/，
//  浏览器可直接打开看；改了视觉 → toMatchFileSnapshot 当场报 diff（首次运行自动写 golden）。
// ═══════════════════════════════════════════════════════════════

const frameAt = (ticks: number): string => {
  const e = new Engine({ tickRate: 60 });
  e.load(buildGameFBlueprint(FAST));
  for (let i = 0; i < ticks; i++) e.world.tick();
  return frameSvg(e.world, { title: 'Game F · 三分天下自走棋' });
};

describe('game-f 视觉回归（SVG 截图 + 快照 diff）', () => {
  it('备战帧（tick 6）匹配 golden', async () => {
    const svg = frameAt(6);
    expect(svg).toMatch(/<(rect|text|circle|polygon)/); // 非空帧（有可渲染物）
    await expect(svg).toMatchFileSnapshot('./__frames__/game-f-prep.svg');
  });

  it('交火帧（tick 70）匹配 golden', async () => {
    const svg = frameAt(70);
    expect(svg).toMatch(/<(rect|text|circle|polygon)/);
    await expect(svg).toMatchFileSnapshot('./__frames__/game-f-combat.svg');
  });

  it('确定性：同一帧两次渲染逐字符一致（回归基线稳定）', () => {
    expect(frameAt(70)).toBe(frameAt(70));
  });
});
