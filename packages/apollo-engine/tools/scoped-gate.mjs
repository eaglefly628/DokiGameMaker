// scripts/scoped-gate.mjs —— 智能推送门禁（owner 2026-07-21 拍板·省"每改动都重跑全量"的干等）。
//
// 背景：推送前固定跑 tsc+全量 vitest+build≈2 分钟，多 session 抢推时 rebase 后还要整套重跑——
// 大量是"改动根本碰不到的测试"在空转（owner：不是每个改动都要重跑测试；自己游戏跑自己游戏测试就够）。
//
// 铁律·只在**可证明安全**时缩范围，任何不确定一律 full（缩错=放过真 breakage=比慢更糟）：
//   · full       —— 碰了引擎/共享面（src/{engine,skills,assembly,renderer,services,net,ui,runtime,launcher*}、
//                    scripts/、tools/、vite.config/package.json/tsconfig）→ 下游全可能坏 → tsc+全量vitest+build。
//   · game:<g>   —— 改动**全部**落在单个游戏自己的面（src/games/<g>/**、public/games/<g>/**、docs/design/<g>/**）
//                    → 只有该游戏可能坏（它依赖的引擎没动）→ tsc + `vitest run src/games/<g>` + build。
//   · docs-only  —— 只碰文档（docs/**、根 *.md），无任何编译产物变化 → 跳过 tsc/vitest/build，只跑文档守卫。
//   · none       —— 无改动。
// 多游戏同时改 / 游戏面+根文档混合但仍单游戏=game；只要掺进引擎/共享/多游戏=full（安全兜底）。
//
// 用法：
//   node scripts/scoped-gate.mjs               分类并打印计划 + 判词（不执行）
//   node scripts/scoped-gate.mjs --run         按计划真跑门禁（退出码=门禁结果）
//   node scripts/scoped-gate.mjs --base <ref>  改比较基线（默认 origin/claude/mainbranch）
// 判词 token：`SCOPED-GATE: FULL|GAME:<g>|DOCS-ONLY|NONE`（审计/日志可 grep）。
import { execSync, spawnSync } from 'node:child_process';

// ── 引擎/共享面前缀（碰到=full·与 CLAUDE.md 引擎域界一致）───────────────────────
const ENGINE_PREFIXES = [
  'src/engine/', 'src/skills/', 'src/assembly/', 'src/renderer/', 'src/services/',
  'src/net/', 'src/ui/', 'src/runtime/', 'src/studio/', 'src/assets/',
  'scripts/', 'tools/',
];
const ENGINE_FILES = new Set([
  'src/launcher.tsx', 'vite.config.ts', 'package.json', 'package-lock.json',
  'tsconfig.json', 'index.html',
]);
const gameOf = (f) => {
  const m = f.match(/^(?:src|public)\/games\/([a-z0-9-]+)\//) || f.match(/^docs\/design\/([a-z0-9-]+)\//);
  return m ? m[1] : null;
};
const isDoc = (f) => f.endsWith('.md') || f.startsWith('docs/');
const isEngineOrShared = (f) =>
  ENGINE_FILES.has(f) || (f.startsWith('src/launcher/')) || ENGINE_PREFIXES.some((p) => f.startsWith(p));

/**
 * 纯分类（可单测）：给定改动文件列表 → { scope, game?, reason }。
 * 优先级：none → 引擎/共享=full → 收敛单游戏=game → 纯文档=docs-only → 其余=full（兜底）。
 */
export function classify(files) {
  const list = files.filter(Boolean);
  if (list.length === 0) return { scope: 'none', reason: '无改动' };

  const engine = list.filter(isEngineOrShared);
  if (engine.length) return { scope: 'full', reason: `碰引擎/共享面（${engine.slice(0, 3).join(', ')}${engine.length > 3 ? '…' : ''}）` };

  // 非文档的编译/资产改动必须归属游戏；docs 可为游戏 doc 或通用 doc。
  const games = new Set();
  let hasNonDocGame = false;
  let hasGeneralDoc = false;
  for (const f of list) {
    const g = gameOf(f);
    if (g) { games.add(g); if (!isDoc(f)) hasNonDocGame = true; }
    else if (isDoc(f)) hasGeneralDoc = true;
    else return { scope: 'full', reason: `无法归类的非文档改动（${f}）→ 安全兜底 full` };
  }

  if (games.size === 0) return { scope: 'docs-only', reason: '仅通用文档' };
  if (games.size === 1) {
    const g = [...games][0];
    if (!hasNonDocGame) return { scope: 'docs-only', reason: `仅 ${g} 文档（无编译/资产变化）` };
    return { scope: 'game', game: g, reason: `改动收敛在单游戏 ${g}${hasGeneralDoc ? '（含通用文档·不影响）' : ''}` };
  }
  return { scope: 'full', reason: `多游戏同改（${[...games].join(', ')}）→ 安全兜底 full` };
}

function changedFiles(base) {
  const runs = [
    `git diff --name-only ${base}...HEAD`, // 本分支相对基线的提交
    'git diff --name-only HEAD', // 未暂存
    'git diff --name-only --cached', // 已暂存
    'git ls-files --others --exclude-standard', // 新增未跟踪（提交前也能分类）
  ];
  const set = new Set();
  for (const cmd of runs) {
    try { execSync(cmd, { encoding: 'utf8' }).split('\n').forEach((l) => l.trim() && set.add(l.trim())); }
    catch { /* base 不存在等 → 忽略该源 */ }
  }
  return [...set];
}

// 门禁计划（scope → 要跑哪些步）。每步 {name, cmd}。
function planFor(c) {
  const DOC_GUARDS = [
    { name: 'docs-ref', cmd: ['node', ['scripts/docs-ref-guard.mjs']] },
    { name: 'context-budget', cmd: ['node', ['scripts/context-budget-guard.mjs']] },
  ];
  const TSC = { name: 'tsc', cmd: ['npx', ['tsc', '--noEmit']] };
  const BUILD = { name: 'build', cmd: ['npm', ['run', 'build']] };
  if (c.scope === 'none') return [];
  if (c.scope === 'docs-only') return DOC_GUARDS;
  if (c.scope === 'game') {
    return [TSC, { name: `vitest:${c.game}`, cmd: ['npx', ['vitest', 'run', `src/games/${c.game}`]] }, BUILD, ...DOC_GUARDS];
  }
  // full
  return [TSC, { name: 'vitest:full', cmd: ['npx', ['vitest', 'run']] }, BUILD, ...DOC_GUARDS];
}

function main() {
  const argv = process.argv.slice(2);
  const run = argv.includes('--run');
  const bi = argv.indexOf('--base');
  const base = bi >= 0 ? argv[bi + 1] : 'origin/claude/mainbranch';

  const files = changedFiles(base);
  const c = classify(files);
  const token = c.scope === 'game' ? `GAME:${c.game}`
    : c.scope === 'docs-only' ? 'DOCS-ONLY'
    : c.scope === 'none' ? 'NONE' : 'FULL';

  console.log(`[scoped-gate] 基线=${base} · 改动 ${files.length} 文件 · 判定=${c.scope}（${c.reason}）`);
  const plan = planFor(c);
  console.log(`[scoped-gate] 计划：${plan.length ? plan.map((s) => s.name).join(' → ') : '（无·无改动）'}`);
  console.log(`SCOPED-GATE: ${token}`);

  if (!run) {
    if (c.scope === 'full') console.log('（未加 --run·如需缩范围执行请带 --run；full 时等价 tsc+全量vitest+build）');
    return;
  }
  for (const step of plan) {
    console.log(`\n── ${step.name} ──`);
    const r = spawnSync(step.cmd[0], step.cmd[1], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`\n❌ 门禁失败于 ${step.name}（退出码 ${r.status}）`); process.exit(r.status || 1); }
  }
  console.log(`\n✅ 门禁全绿（scope=${c.scope}${c.game ? ':' + c.game : ''}）`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
