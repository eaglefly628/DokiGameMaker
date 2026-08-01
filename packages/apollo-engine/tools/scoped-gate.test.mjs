// scripts/scoped-gate.test.mjs —— 智能门禁分类器行为契约（owner 2026-07-21）。
// 铁律=只在可证明安全时缩范围·任何不确定一律 full——本测钉死"缩错"不发生。
import { describe, it, expect } from 'vitest';
import { classify } from './scoped-gate.mjs';

describe('scoped-gate 分类器（缩范围只在可证明安全时）', () => {
  it('无改动 → none', () => {
    expect(classify([]).scope).toBe('none');
  });

  it('碰引擎/共享面 → full（下游全可能坏·绝不缩）', () => {
    expect(classify(['src/engine/protocol/components.ts']).scope).toBe('full');
    expect(classify(['src/skills/tier3/hand-pattern.ts']).scope).toBe('full');
    expect(classify(['src/ui/components/render.ts']).scope).toBe('full');
    expect(classify(['scripts/game-pipeline.mjs']).scope).toBe('full');
    expect(classify(['vite.config.ts']).scope).toBe('full');
    expect(classify(['src/launcher.tsx']).scope).toBe('full');
  });

  it('引擎面 + 游戏面同改 → full（不因掺了游戏就缩）', () => {
    expect(classify(['src/games/game-a/rules.ts', 'src/engine/x.ts']).scope).toBe('full');
  });

  it('改动收敛单游戏（src/public/docs 混合）→ game:<g>', () => {
    const c = classify([
      'src/games/game-a/guandan-session.ts',
      'public/games/game-a/art/index.json',
      'docs/design/game-a/requests.md',
    ]);
    expect(c.scope).toBe('game');
    expect(c.game).toBe('game-a');
  });

  it('单游戏面 + 通用文档 → 仍 game:<g>（通用文档不影响编译）', () => {
    const c = classify(['src/games/game-b/mahjong.ts', 'docs/workflow/requests.md']);
    expect(c).toMatchObject({ scope: 'game', game: 'game-b' });
  });

  it('多游戏同改 → full（安全兜底）', () => {
    expect(classify(['src/games/game-a/x.ts', 'src/games/game-b/y.ts']).scope).toBe('full');
  });

  it('仅通用文档 → docs-only（跳过编译门禁）', () => {
    expect(classify(['docs/workflow/requests.md', 'README.md']).scope).toBe('docs-only');
  });

  it('仅单游戏文档（无编译/资产）→ docs-only', () => {
    expect(classify(['docs/design/game-a/gdd.md']).scope).toBe('docs-only');
  });

  it('无法归类的非文档改动 → full（不认识=不敢缩）', () => {
    expect(classify(['weird/unknown-file.ts']).scope).toBe('full');
    expect(classify(['src/foo.ts']).scope).toBe('full'); // src 下非 games = 引擎/共享
  });

  it('游戏资产单改（public/games/<g>）→ game（该游戏 vendor/asset 测试守）', () => {
    const c = classify(['public/games/game-a/art/cards/ace-of-spades.svg']);
    expect(c).toMatchObject({ scope: 'game', game: 'game-a' });
  });
});
