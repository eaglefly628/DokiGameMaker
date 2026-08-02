#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  new-game.mjs —— 从 ZeroCraft Engine 模板新建一个游戏。
//
//  解决的问题：新建的游戏工程**本身不含引擎积木库**。这里让新游戏直接长在引擎
//  包内（src/games/<slug>），于是 tier1–4 积木、八阶段流程板、美术管线工具、
//  以及 zerocraft-game-maker Skill 全部开箱即得——不复制引擎、不留第二份真相。
//
//  产出（全部是**能跑通的真代码**，不是占位注释）：
//    src/games/<slug>/blueprint.ts   起手蓝图（真 capability·tween 动画可见）
//    src/games/<slug>/<slug>.ts      入口 mount(container) => cleanup
//    src/games/<slug>/<slug>.test.ts 冒烟测试（真引擎 load + 空跑 2 tick）
//    docs/design/<slug>/README.md    设计文档骨架（S1 立项卡的落点）
//    并自动注册进 src/dev-preview.ts 的 GAMES（预览页立刻可见）
//
//  用法：
//    node tools/new-game.mjs <slug> [--name "显示名"] [--pitch "一句话玩法"]
//  例：
//    node tools/new-game.mjs game-demo --name "Demo" --pitch "点方块得分"
//
//  建完下一步：node tools/game-pipeline.mjs board <slug>
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};

if (!slug) {
  console.error('用法: node tools/new-game.mjs <slug> [--name "显示名"] [--pitch "一句话玩法"]');
  process.exit(2);
}
// slug 会进目录名、import 路径与流程板台账 key —— 限死字符集，避免路径注入与跨平台大小写折叠。
if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error(`slug 必须是小写字母开头、仅含小写字母/数字/连字符，得到 ${JSON.stringify(slug)}`);
  process.exit(2);
}

const gameDir = join(ROOT, 'src', 'games', slug);
if (existsSync(gameDir)) {
  console.error(`✗ ${slug} 已存在：src/games/${slug}`);
  process.exit(1);
}

const displayName = flag('name') ?? slug;
const pitch = flag('pitch') ?? '（待填：一句话说清玩家做什么 → 得到什么反馈 → 怎么算赢）';
// 标识符化：game-demo → gameDemo，用于导出名。
const camel = slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

mkdirSync(gameDir, { recursive: true });

// ── 1) 起手蓝图：纯数据，用真能力（transform/shape/color/tween），无资产即可见 ──
writeFileSync(
  join(gameDir, 'blueprint.ts'),
  `// ${displayName} · 起手蓝图（由 tools/new-game.mjs 生成）
//
// 铁律：游戏是**数据**，不是代码。玩法用既有 capability 组合表达，不在游戏层自写解释器。
// 本文件是纯蓝图数据：capabilities 声明用哪些积木，entities 声明世界里有什么。
//
// 下一步：跑 \`pnpm --filter @zerocraft/apollo-engine catalog -- --grep <玩法关键词>\`
// 查还有哪些积木可用，照它 e.g. 的数据形状往下加。

import type { WorldBlueprint } from '../../assembly/demo.assembly.js';
import { transformCapability, shapeCapability, colorCapability } from '@atom-skills/index.js';
import { tweenCapability } from '@skills/tier1/index.js';

/** ${displayName} 的起手蓝图：一个会来回移动的方块（证明引擎跑得起来）。 */
export function ${camel}Blueprint(): WorldBlueprint {
  return {
    capabilities: [transformCapability, shapeCapability, colorCapability, tweenCapability],
    entities: {
      hello: {
        Transform: { x: 80, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 48, height: 48 },
        Color: { tint: 0x7c3aed, alpha: 1 },
        Tween: {
          target: 'Transform.x',
          from: 80,
          to: 560,
          elapsed: 0,
          duration: 120,
          easing: 'easeInOut',
          done: false,
          loop: 'pingpong',
        },
      },
    },
  };
}
`,
  'utf8',
);

// ── 2) 入口：与上游 launcher / 本包 dev-preview 同一契约 mount(container) => cleanup ──
writeFileSync(
  join(gameDir, `${slug}.ts`),
  `// ${displayName}（由 tools/new-game.mjs 生成）
//
// 入口契约：mount(container) => cleanup —— 与 dev-preview 及上游 launcher 一致。
// 宿主只提供一个挂载容器；画面由引擎 + 渲染后端产出，游戏层不手写 DOM。

import { Engine } from '../../runtime/engine.js';
import { CanvasRenderer } from '@renderer/index.js';
import { ${camel}Blueprint } from './blueprint.js';

export function mount(container: HTMLElement): () => void {
  const engine = new Engine({ tickRate: 60 });
  engine.load(${camel}Blueprint());

  const renderer = new CanvasRenderer({ width: 640, height: 400, background: '#0a0f1e' });
  engine.attachRenderer(renderer, container);
  engine.start();

  // cleanup：停 tick + 销毁渲染器。容器由宿主回收。
  return () => {
    engine.stop();
    renderer.destroy();
  };
}
`,
  'utf8',
);

// ── 3) 冒烟测试：S3 骨架关的判据就是「能存必须能跑」——真引擎 load + 空跑 2 tick ──
writeFileSync(
  join(gameDir, `${slug}.test.ts`),
  `// ${displayName} · 冒烟测试（由 tools/new-game.mjs 生成）
//
// 对应 S3 骨架关判据「能存必须能跑」：真引擎装载 + 空跑 2 tick 不炸。
// 往下做玩法时，把「胜负/重开/核心循环」的断言加到这里（S4 玩法关要求测试断言行为而非常量）。

import { describe, it, expect } from 'vitest';
import { Engine } from '../../runtime/engine.js';
import { ${camel}Blueprint } from './blueprint.js';

describe('${slug} · 骨架', () => {
  it('蓝图能被真引擎装载并空跑 2 tick', () => {
    const engine = new Engine({ tickRate: 60 });
    engine.load(${camel}Blueprint());
    expect(() => {
      engine.world.tick();
      engine.world.tick();
    }).not.toThrow();
  });

  it('tween 真的推动了实体（断言行为，不是断言常量）', () => {
    const engine = new Engine({ tickRate: 60 });
    engine.load(${camel}Blueprint());
    const xAt = () =>
      (engine.world.query('Transform')[0]?.[1].get('Transform') as { x: number } | undefined)?.x;
    const before = xAt();
    for (let i = 0; i < 30; i++) engine.world.tick();
    const after = xAt();
    expect(before).toBeDefined();
    expect(after).not.toBe(before);
  });
});
`,
  'utf8',
);

// ── 4) 设计文档骨架（S1 立项卡的落点）──
const designDir = join(ROOT, 'docs', 'design', slug);
mkdirSync(designDir, { recursive: true });
writeFileSync(
  join(designDir, 'README.md'),
  `# ${displayName}

> 由 \`tools/new-game.mjs\` 生成。推进流程用八阶段流程板：
> \`node packages/apollo-engine/tools/game-pipeline.mjs board ${slug}\`

## S1 立项卡

- **一句话玩法**：${pitch}
- **参考**：（待填）
- **风格意向**：（待填）

落账：
\`\`\`bash
node packages/apollo-engine/tools/game-pipeline.mjs concept ${slug} \\
  --name "${displayName}" --pitch "${pitch}"
\`\`\`

## S2 能力计划

用哪些积木、怎么组合。先查清单再定：

\`\`\`bash
pnpm --filter @zerocraft/apollo-engine catalog -- --grep <玩法关键词>
\`\`\`

| 需求 | 选用积木 | 理由 |
| --- | --- | --- |
| （待填） | | |

## 铁律自查

- [ ] 游戏是数据：玩法用既有 capability 表达，未在游戏层自写解释器
- [ ] 无裸 \`Math.random()\`（随机走引擎受控随机源）
- [ ] 无 \`innerHTML\`（UI 走 LayoutNode）
- [ ] 有测试，且断言行为而非常量
`,
  'utf8',
);

// ── 5) 注册进预览页（改一处即可在 http://localhost:5180 见到）──
const previewPath = join(ROOT, 'src', 'dev-preview.ts');
let registered = false;
if (existsSync(previewPath)) {
  const src = readFileSync(previewPath, 'utf8');
  const anchor = 'const GAMES: PreviewGame[] = [';
  if (src.includes(anchor) && !src.includes(`id: '${slug}'`)) {
    const entry =
      `\n  {\n` +
      `    id: '${slug}',\n` +
      `    title: '${displayName}',\n` +
      `    load: () => import('./games/${slug}/${slug}.js') as Promise<{ mount: MountFn }>,\n` +
      `  },`;
    writeFileSync(previewPath, src.replace(anchor, anchor + entry), 'utf8');
    registered = true;
  }
}

console.log(`✓ 已创建 ${displayName}（${slug}）`);
console.log(`    src/games/${slug}/{blueprint.ts, ${slug}.ts, ${slug}.test.ts}`);
console.log(`    docs/design/${slug}/README.md`);
console.log(registered ? `    已注册进预览页 src/dev-preview.ts` : `    ⚠ 预览页未自动注册，请手动在 dev-preview.ts 的 GAMES 加一条`);
console.log('');
console.log('下一步：');
console.log(`  1. node packages/apollo-engine/tools/game-pipeline.mjs board ${slug}   # 看流程板`);
console.log(`  2. pnpm dev:engine                                                     # 跑起来看`);
console.log(`  3. pnpm --filter @zerocraft/apollo-engine catalog -- --ids             # 查还有哪些积木`);
