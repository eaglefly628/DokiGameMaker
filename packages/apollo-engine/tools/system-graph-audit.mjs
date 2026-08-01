#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/system-graph-audit.mjs —— 系统调度依赖图体检（REQ-STAB·积木稳定性）
//
//  用法（走 vite-node·要 import 引擎 TS）：
//    npx vite-node scripts/system-graph-audit.mjs                 # 全局体检（全部注册能力）
//    npx vite-node scripts/system-graph-audit.mjs <capId> [capId…] # 只查这几个能力**共装**会不会成环（=某游戏的能力子集）
//
//  产出：
//    · 硬错（退出码 1·恒为 bug）：悬空显式边（runsBefore/runsAfter 指不存在系统=静默失效）、重复 system id。
//    · SCC（真环）：Tarjan 精确切出最小环 + 点名闭环组件 + 破环建议。
//      - 全局模式：SCC=**信息**（全局超集常含现实从不同装的组合而成环·不判失败）——判词看硬错。
//      - 子集模式：SCC=**该子集共装会在 load 时抛环**（退出码 1）——这才是「某游戏能不能排」的真问题。
//    判词 token：`SYSTEM-GRAPH: PASS|FAIL`（照 docs-ref-guard 模式·可接门禁/CI）。
// ═══════════════════════════════════════════════════════════════
import { ALL_CAPABILITIES } from '../src/assembly/capability-registry.ts';
import { analyzeSystemGraph } from '../src/assembly/system-graph.ts';

function fmtScc(s, mode) {
  const tag = mode === 'subset' ? '✗ 环（共装会抛）' : 'ℹ 全局超集环';
  const lines = [
    `  ${tag} · phase ${s.phase} · ${s.systems.length} 系统`,
    `     ${s.systems.map((x) => x.id).join(', ')}`,
  ];
  if (s.viaComponents.length) lines.push(`     闭环组件(RMW): ${s.viaComponents.join(', ')}`);
  lines.push(`     破环: ${s.suggestion}`);
  return lines.join('\n');
}

function main(argv) {
  const ids = argv.filter((a) => !a.startsWith('-'));
  // 硬错（悬空边/重复 id）恒按全局算——它们与装不装子集无关。
  const global = analyzeSystemGraph(ALL_CAPABILITIES);

  let fail = false;
  const out = [];
  out.push(`[system-graph] 注册系统 ${global.systemCount} · phase ${global.phases.join('/')} · 显式定序边 ${global.explicitEdgeCount}`);

  if (global.duplicateIds.length) {
    fail = true;
    out.push(`✗ 重复 system id（idToIndex 静默覆盖·定序不可预期）：`);
    for (const d of global.duplicateIds) out.push(`   - ${d.id} ← ${d.caps.join(', ')}`);
  } else out.push('✓ 无重复 system id');

  if (global.danglingEdges.length) {
    fail = true;
    out.push(`✗ 悬空显式边（指向不存在系统·静默失效=定序漏洞）：`);
    for (const d of global.danglingEdges) out.push(`   - ${d.capId}/${d.system} ${d.kind} → ${d.ref}（不存在）`);
  } else out.push('✓ 无悬空显式边');

  if (ids.length) {
    // 子集模式：只看这几个能力共装会不会成环。
    const known = new Map(ALL_CAPABILITIES.map((c) => [c.id, c]));
    const missing = ids.filter((i) => !known.has(i));
    if (missing.length) { out.push(`✗ 未知能力 id：${missing.join(', ')}`); fail = true; }
    const subset = ids.filter((i) => known.has(i)).map((i) => known.get(i));
    const sub = analyzeSystemGraph(subset);
    out.push(`— 子集 [${ids.join(', ')}]：系统 ${sub.systemCount}`);
    if (sub.sccs.length) {
      fail = true;
      out.push(`✗ 该子集共装会在 load 时抛环（${sub.sccs.length} 个）：`);
      for (const s of sub.sccs) out.push(fmtScc(s, 'subset'));
    } else out.push('✓ 该子集可排（无环·load 不抛）');
  } else {
    // 全局模式：SCC 只作信息。
    if (global.sccs.length) {
      out.push(`ℹ 全局超集环 ${global.sccs.length} 个（现实从不同装的能力组合而成·非 per-game bug；用 <capId…> 查真实游戏子集）：`);
      for (const s of global.sccs) out.push(fmtScc(s, 'global'));
    } else out.push('✓ 全局无环（任何 world 都保证可排）');
  }

  out.push(`SYSTEM-GRAPH: ${fail ? 'FAIL' : 'PASS'}`);
  process.stdout.write(out.join('\n') + '\n');
  process.exit(fail ? 1 : 0);
}

main(process.argv.slice(2));
