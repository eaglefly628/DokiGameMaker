#!/usr/bin/env node
// UI 审计工具 · ZeroCraft 数据驱动 UI 自检（配 docs/design/ui-playbook.md）
//
// 干什么：把一棵 LayoutNode 树 mount 到真浏览器，量真实包围盒 + computed 颜色，
//   程序化检查两件 validate.ts 挡不住的事：① 组件重叠（overlap）② 文字对比度（contrast）。
//   绿了 exit 0；有问题打印清单 + exit 1（可进 CI / pre-push 卡口）。
//
// 怎么用：
//   node tools/ui-audit.mjs <entry.ts> [--mount root] [--w 1060] [--h 760] [--min-contrast 4.5]
//   entry.ts 须把树 mount 到 document.getElementById('<mount>')（缺省 id 'root'）。
//   现成示例入口：tools/audits/*.audit.ts（如 mmo-hud.audit.ts）。
//   一行跑示例：  node tools/ui-audit.mjs tools/audits/mmo-hud.audit.ts
//
// 判定规则（与 ui-playbook.md §1/§2 同源）：
//   · 重叠：只比**带 id 的绝对定位元素**两两相交（装饰层 vignette/pattern/sheen 是无 id 的 inset 覆盖层→天然排除；
//     祖孙嵌套排除）。相交面积 > 容差 = 不合格。意图叠层请在 entry 里用 data-allow-overlap 标（见下）。
//   · 对比：每个含直接文字的元素，取 computed color vs 逐层向上第一个不透明背景，算 WCAG 比；< 阈值 = 不合格。
//
// 依赖：vite（项目内）+ playwright + chromium（本环境 /opt 预装）。无侵入项目依赖。

import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 参数 ───────────────────────────────────────────────
const argv = process.argv.slice(2);
const entry = argv.find((a) => !a.startsWith('--'));
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
if (!entry) {
  console.error('用法: node tools/ui-audit.mjs <entry.ts> [--mount root] [--w 1060] [--h 760] [--min-contrast 4.5]');
  process.exit(2);
}
const MOUNT = opt('mount', 'root');
const W = Number(opt('w', 1060));
const H = Number(opt('h', 760));
const MIN_CONTRAST = Number(opt('min-contrast', 4.5)); // AA 正文目标：低于此=警告（次级文字常落这）
const HARD_FLOOR = Number(opt('hard-floor', 3.0));     // 硬地板：低于此=真读不清(深底深字/字≈底)=失败阻断
const OVERLAP_TOL = Number(opt('overlap-tol', 4)); // px² 容差

// ── 1) vite 把 entry 打成 IIFE ──────────────────────────
const tmp = join(ROOT, '.ui-audit-tmp');
const bundleName = 'audit-bundle.js';

// playwright 解析（项目内优先，回落本环境 /opt 预装）
async function loadChromium() {
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { const m = await import(c); if (m.chromium) return m.chromium; } catch { /* next */ }
  }
  throw new Error('找不到 playwright（项目未装且 /opt 回落失败）');
}

// try/finally：无论 build/launch/evaluate 哪步抛错，都关浏览器 + 清临时目录（防进程/磁盘泄漏）。
let browser, report;
try {
  mkdirSync(tmp, { recursive: true });
  await build({
    configFile: join(ROOT, 'vite.config.ts'),
    logLevel: 'error',
    build: { write: true, outDir: tmp, emptyOutDir: false,
      lib: { entry: resolve(ROOT, entry), formats: ['iife'], name: 'UIAudit', fileName: () => bundleName } },
  });
  writeFileSync(join(tmp, 'audit.html'),
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#06080d"><div id="${MOUNT}" style="width:${W - 20}px"></div><script src="./${bundleName}"></script></body>`);
  const chromium = await loadChromium();
  browser = await chromium.launch({ executablePath: process.env.UI_AUDIT_CHROMIUM || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`file://${join(tmp, 'audit.html')}`);
  await page.waitForTimeout(600);

  // 浏览器内量包围盒 + 颜色，跑两项审计
  report = await page.evaluate(({ MOUNT, OVERLAP_TOL, MIN_CONTRAST, HARD_FLOOR }) => {
  const host = document.getElementById(MOUNT);
  const base = host.getBoundingClientRect();
  const rel = (r) => ({ x: Math.round(r.x - base.x), y: Math.round(r.y - base.y), w: Math.round(r.width), h: Math.round(r.height) });

  // — 重叠：带 id 的绝对/固定定位元素（排除装饰无 id 层；排除标了 data-allow-overlap 的意图叠层）—
  const positioned = [...host.querySelectorAll('[id]')].filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.position === 'absolute' || cs.position === 'fixed') && el.getAttribute('data-allow-overlap') === null;
  });
  const isRelated = (a, b) => a.contains(b) || b.contains(a);
  const interArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                              Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const overlaps = [];
  for (let i = 0; i < positioned.length; i++)
    for (let j = i + 1; j < positioned.length; j++) {
      if (isRelated(positioned[i], positioned[j])) continue;
      const ra = rel(positioned[i].getBoundingClientRect()), rb = rel(positioned[j].getBoundingClientRect());
      const a = interArea(ra, rb);
      if (a > OVERLAP_TOL) overlaps.push({ a: positioned[i].id, b: positioned[j].id, area: Math.round(a) });
    }

  // — 对比：含直接文字的元素 vs 逐层向上第一个不透明背景 —
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = (rgb) => { const a = rgb.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const ratio = (f, b) => { const L1 = lum(f), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const solidBgUp = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n); const bg = parse(cs.backgroundColor);
      if (bg && (bg[3] === undefined || bg[3] >= 0.95)) return bg.slice(0, 3);
      // 渐变底无 backgroundColor → 跳过（近似：继续向上找实底）
      n = n.parentElement;
    }
    return [6, 8, 13]; // 兜底页面深底
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  // emoji/符号：自带彩色字形，不吃 CSS color → 对比检查对它无意义。去掉 emoji + 变体选择符后无「真字符」的元素跳过。
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{2000}-\u{206F}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2660}-\u{2667}]/gu;
  const isGlyphOnly = (s) => !s.replace(EMOJI, '').replace(/[\s·:：>/|]/g, '').trim();
  const low = [];
  for (const el of host.querySelectorAll('*')) {
    const txt = ownText(el);
    if (!txt) continue;
    if (isGlyphOnly(txt)) continue; // 纯 emoji/符号 → 跳过（不吃 text-color·量它是噪音）
    if (el.closest('[data-audit-skip-contrast]')) continue; // 定色语义原语（扑克牌红黑花色·牌面本色）→ 免对比检查（A-007b）
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const r = ratio(fg.slice(0, 3), solidBgUp(el));
    const big = parseFloat(cs.fontSize) >= 18 && Number(cs.fontWeight) >= 600;
    const need = big ? 3 : MIN_CONTRAST;
    if (r < need) {
      const hard = r < (big ? 2.4 : HARD_FLOOR); // 大字硬地板放宽到 2.4
      low.push({ id: el.id || `<${el.tagName.toLowerCase()}>`, text: el.textContent.trim().slice(0, 18), ratio: Math.round(r * 100) / 100, need, hard });
    }
  }
  // — border-image 前提守卫（REQ-FACEART③·工具债提前清）：设了 border-image-source 却缺 border-style/width →
  //   真浏览器一像素不画（happy-dom 字符串断言测不出·faceArtSlice 就栽在此盲区）。缺前提=阻断。
  const borderImageBroken = [];
  for (const el of host.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const src = cs.borderImageSource;
    if (!src || src === 'none') continue;
    const noStyle = /^(none\s*)+$/.test((cs.borderStyle || '').trim());
    const noWidth = ((cs.borderWidth || '').match(/[\d.]+/g) || [0]).map(Number).every((w) => w === 0);
    if (noStyle || noWidth) borderImageBroken.push({ id: el.id || `<${el.tagName.toLowerCase()}>`, why: noStyle ? 'border-style:none' : 'border-width:0' });
  }
    return { positionedCount: positioned.length, overlaps, low, borderImageBroken };
  }, { MOUNT, OVERLAP_TOL, MIN_CONTRAST, HARD_FLOOR });
} finally {
  if (browser) await browser.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
}

// ── 4) 打印 + 退出码 ────────────────────────────────────
const hardLow = report.low.filter((l) => l.hard);
const warnLow = report.low.filter((l) => !l.hard);
console.log(`\n=== UI 审计 · ${entry} (${W}×${H}) ===`);
console.log(`绝对定位元素(带 id)：${report.positionedCount}`);
console.log(`\n[重叠] ${report.overlaps.length} 处（容差 ${OVERLAP_TOL}px²）— 阻断`);
for (const o of report.overlaps) console.log(`  ✕ ${o.a}  ⨉  ${o.b}   area=${o.area}px²`);
console.log(`\n[对比·硬失败 <${HARD_FLOOR}] ${hardLow.length} 处（真读不清·深底深字/字≈底）— 阻断`);
for (const l of hardLow) console.log(`  ✕ ${l.id.padEnd(16)} "${l.text}"  ratio=${l.ratio}`);
console.log(`\n[对比·警告 ${HARD_FLOOR}–${MIN_CONTRAST}] ${warnLow.length} 处（多为 dim 次级文字·复核非阻断）`);
for (const l of warnLow) console.log(`  ! ${l.id.padEnd(16)} "${l.text}"  ratio=${l.ratio} (AA 需≥${l.need})`);

const biBroken = report.borderImageBroken ?? [];
console.log(`\n[border-image 前提] ${biBroken.length} 处（设了皮却缺 border-style/width·真浏览器不画）— 阻断`);
for (const b of biBroken) console.log(`  ✕ ${b.id.padEnd(16)} ${b.why}`);

const fail = report.overlaps.length + hardLow.length + biBroken.length;
console.log(`\n${fail === 0
  ? `✅ 通过（阻断项 0）：无重叠、无硬性读不清文字、border-image 前提齐。${warnLow.length ? ` 另有 ${warnLow.length} 处次级文字低于 AA·建议复核是否正文。` : ''}`
  : `❌ 不合格：${report.overlaps.length} 重叠 + ${hardLow.length} 硬性低对比 + ${biBroken.length} border-image 缺前提。按 ui-playbook.md §1/§2 修。`}`);
process.exit(fail === 0 ? 0 : 1);
