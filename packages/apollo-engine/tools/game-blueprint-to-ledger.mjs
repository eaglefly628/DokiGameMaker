// scripts/game-blueprint-to-ledger.mjs
// 把「代码游戏」里已导出的 WorldBlueprint 用引擎既有 exportManifest 序列化成 manifest.json，
// 落到 public/games/<game>/manifest.json —— 之后跑 `art-replace.mjs derive <game>` 即得美术台账。
// 零逆向、零改游戏代码：用游戏自己的蓝图数据 + 引擎既有能力（exportManifest + deriveForGame）。
// 用法（需 vite-node 解析 @engine/@skills 别名）：npx vite-node scripts/game-blueprint-to-ledger.mjs <game>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportManifest } from '../src/studio/inspect.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// game → 该游戏导出的 WorldBlueprint 构造器（新增蓝图游戏在此登记）。
const BUILDERS = {
  'game-d': async () => (await import('../src/games/game-d/rooms.ts')).baseBlueprint(),
  'game-f': async () => (await import('../src/games/game-f/blueprint.ts')).buildGameFBlueprint(),
};

const game = process.argv[2];
if (!BUILDERS[game]) {
  console.error(`未登记蓝图游戏: ${game || '(空)'}（可选: ${Object.keys(BUILDERS).join(', ')}）`);
  process.exit(1);
}
const bp = await BUILDERS[game]();
const manifest = JSON.parse(exportManifest(bp));
const mfPath = join(ROOT, 'public', 'games', game, 'manifest.json');
mkdirSync(dirname(mfPath), { recursive: true });
writeFileSync(mfPath, JSON.stringify(manifest, null, 2) + '\n');
const nEnt = Object.keys(manifest.entities || {}).length;
const nCap = (manifest.capabilities || []).length;
console.log(`✓ ${game}: exportManifest → ${mfPath}（实体 ${nEnt} · 能力 ${nCap}）`);
console.log(`  下一步：node scripts/art-replace.mjs derive ${game}  → 出美术台账`);
