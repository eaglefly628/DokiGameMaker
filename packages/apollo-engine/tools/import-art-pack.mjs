// 从 GitHub 托管的 CC0/CC-BY 资产包整包拉取 → 解压 → 落进 assets/<dest>/ + 并进 assets/index.json。
//
// 用法: node scripts/import-art-pack.mjs <pack> [limit]
//   例: node scripts/import-art-pack.mjs game-icons 80
//
// 为什么走 GitHub：本环境 curl 出口仅 GitHub(raw/codeload)可达，素材站(kenney/OGA/itch)直连 403——故整包走 codeload。
//   （发现新仓库可用工具层 WebFetch/WebSearch，它们走另一后端能上更广的网；但下载入库仍由本脚本 curl codeload。）
// 授权：每条记 license/source/style/provenance（CC-BY 需署名——provenance.author 留痕，不设硬门）。
// 确定性：文件排序 + 取前 limit + 稳定 id；同一包+同一 limit → 同一份并入计划，可复放、可审计。
// 零外部依赖：curl 下包、tar 解压（环境自带）；SVG 尺寸从 viewBox 现解（同 src/assets/import/sniff.ts）。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');
const INDEX = join(ASSETS, 'index.json');

// 包目录（数据驱动：增一个包 = 加一条；扒数据本身不写自由逻辑）。
const PACKS = {
  'game-icons': {
    repo: 'game-icons/icons',
    ref: 'master',
    tarTop: 'icons-master', // tar 解压顶层目录
    ext: '.svg',
    style: 'cartoon.flat',
    license: 'CC BY 3.0',
    source: 'game-icons',
    category: 'icon.ui',
    dest: 'gameicons',
    idPrefix: 'gameicons',
    transparent: false, // game-icons = 白图标+黑底方块（不透明）
    // 按文件名归类（首个命中胜，否则用 category）：扑克牌单独成类，供扑克游戏直接 category=playing-card 取。
    categoryRules: [
      { re: /^card-(?:[2-9]|10|jack|queen|king|ace)-(?:clubs|diamonds|hearts|spades)$/, category: 'playing-card' },
      { re: /^card-(?:joker|back)$/, category: 'playing-card' },
      { re: /^(?:clubs|spades|hearts|diamonds)$/, category: 'playing-card' },
    ],
  },
  // 统一描线风格成系列图标（MIT）。subdir 只取 outline；flatId：id=tabler/<名>（无作者层）。
  tabler: {
    repo: 'tabler/tabler-icons',
    ref: 'main',
    tarTop: 'tabler-icons-main',
    ext: '.svg',
    subdir: 'icons/outline',
    flatId: true,
    sample: 'even',
    style: 'cartoon.flat',
    license: 'MIT',
    source: 'tabler',
    category: 'icon.ui',
    dest: 'tabler',
    idPrefix: 'tabler',
    transparent: true,
  },
  // Phosphor 图标族（MIT）：圆润成体系，取 regular 权重。
  phosphor: {
    repo: 'phosphor-icons/core',
    ref: 'main',
    tarTop: 'core-main',
    ext: '.svg',
    subdir: 'assets/regular',
    flatId: true,
    sample: 'even',
    style: 'cartoon.flat',
    license: 'MIT',
    source: 'phosphor',
    category: 'icon.ui',
    dest: 'phosphor',
    idPrefix: 'phosphor',
    transparent: true,
  },
  // Material Design Icons（Apache-2.0）：最全的统一填充风图标体系。
  mdi: {
    repo: 'Templarian/MaterialDesign',
    ref: 'master',
    tarTop: 'MaterialDesign-master',
    ext: '.svg',
    subdir: 'svg',
    flatId: true,
    sample: 'even',
    style: 'cartoon.flat',
    license: 'Apache-2.0',
    source: 'mdi',
    category: 'icon.ui',
    dest: 'mdi',
    idPrefix: 'mdi',
    transparent: true,
  },
  // Lucide（ISC）：Feather 的维护分支，统一 24px 线性。
  lucide: {
    repo: 'lucide-icons/lucide', ref: 'main', tarTop: 'lucide-main', ext: '.svg',
    subdir: 'icons', flatId: true, style: 'cartoon.flat', license: 'ISC',
    source: 'lucide', category: 'icon.ui', dest: 'lucide', idPrefix: 'lucide', transparent: true,
  },
  // Simple Icons（CC0）：3400+ 品牌/产品 logo，文件名即品牌 slug。注：图形本身可能含商标，渲染品牌标识需自行把关。
  'simple-icons': {
    repo: 'simple-icons/simple-icons', ref: 'develop', tarTop: 'simple-icons-develop', ext: '.svg',
    subdir: 'icons', flatId: true, style: 'cartoon.flat', license: 'CC0-1.0',
    source: 'simple-icons', category: 'icon.ui', dest: 'simpleicons', idPrefix: 'simpleicons',
    transparent: true, extraTags: ['brand', 'logo', 'icon'],
  },
  // flag-icons（MIT）：~260 国旗，取 4x3 矩形版。文件名是 ISO 国家码（ad/ae…），补 flag/country 检索词。
  'flag-icons': {
    repo: 'lipis/flag-icons', ref: 'main', tarTop: 'flag-icons-main', ext: '.svg',
    subdir: 'flags/4x3', flatId: true, style: 'cartoon.flat', license: 'MIT',
    source: 'flag-icons', category: 'icon.ui', dest: 'flags', idPrefix: 'flag',
    transparent: false, extraTags: ['flag', 'country', 'nation'],
  },
  // Weather Icons（SIL OFL 1.1）：~219 天气图标，文件名 wi-*。
  'weather-icons': {
    repo: 'erikflowers/weather-icons', ref: 'master', tarTop: 'weather-icons-master', ext: '.svg',
    subdir: 'svg', flatId: true, style: 'cartoon.flat', license: 'SIL OFL 1.1',
    source: 'weather-icons', category: 'icon.ui', dest: 'weather', idPrefix: 'weather',
    transparent: true, extraTags: ['weather', 'icon'],
  },
  // unDraw（MIT）：~417 张扁平场景插画，文件名 概念词+hash（Astronaut_xxxx）。
  undraw: {
    repo: 'cuuupid/undraw-illustrations', ref: 'master', tarTop: 'undraw-illustrations-master', ext: '.svg',
    subdir: 'svg', flatId: true, style: 'cartoon.flat', license: 'MIT',
    source: 'undraw', category: 'illustration', dest: 'undraw', idPrefix: 'undraw',
    transparent: true, extraTags: ['illustration', 'scene', 'flat'],
  },
  // Fluent Emoji（MIT）：取 Flat 风格的彩色 emoji（assets/<名>/Flat/*_flat.svg），~3145。
  'fluentui-emoji': {
    repo: 'microsoft/fluentui-emoji', ref: 'main', tarTop: 'fluentui-emoji-main', ext: '.svg',
    subdir: 'assets', pathIncludes: '/flat/', flatId: true, style: 'cartoon.flat', license: 'MIT',
    source: 'fluentui-emoji', category: 'emoji', dest: 'fluentui', idPrefix: 'fluentui',
    transparent: true, extraTags: ['emoji', 'color', 'flat'],
  },
  // Devicon（MIT）：取每个技术的 -original 变体（icons/<名>/<名>-original.svg），~559 开发/品牌 logo。
  devicon: {
    repo: 'devicons/devicon', ref: 'master', tarTop: 'devicon-master', ext: '.svg',
    subdir: 'icons', pathIncludes: '-original.svg', flatId: true, style: 'cartoon.flat', license: 'MIT',
    source: 'devicon', category: 'icon.ui', dest: 'devicon', idPrefix: 'devicon',
    transparent: true, extraTags: ['brand', 'logo', 'dev', 'tech'],
  },
  // ── PNG / 9-patch 游戏素材（位图；用 pngDims 读尺寸）──
  // Kenney UI Pack（CC0）：~148 个游戏 UI 元件（按钮/滑块/面板/勾选框）PNG。
  'kenney-ui': {
    repo: 'ereborstudios/kenney-ui-pack', ref: 'main', tarTop: 'kenney-ui-pack-main', ext: '.png',
    subdir: 'sprites', keepSubpath: true, style: 'cartoon.flat', license: 'CC0-1.0',
    source: 'kenney-ui', category: 'icon.ui', dest: 'kenney-ui', idPrefix: 'kenney-ui',
    transparent: true, extraTags: ['ui', 'button', 'panel', 'kenney', 'game-ui'],
  },
  // 输入提示按钮（CC0）：手柄/键鼠按键提示，取 SVG（更清晰，~471）。
  'input-prompts': {
    repo: 'mr-breakfast/mrbreakfasts_free_prompts', ref: 'main', tarTop: 'mrbreakfasts_free_prompts-main', ext: '.svg',
    keepSubpath: true, style: 'cartoon.flat', license: 'CC0-1.0',
    source: 'input-prompts', category: 'icon.ui', dest: 'input-prompts', idPrefix: 'input',
    transparent: true, extraTags: ['ui', 'button', 'input', 'controller', 'key', 'prompt'],
  },
  // gdx-skins 的 kenney-pixel 皮肤（CC0）：9-patch 像素 GUI（面板/按钮/窗口），~34 张。
  'gdx-kenney-pixel': {
    repo: 'czyzby/gdx-skins', ref: 'master', tarTop: 'gdx-skins-master', ext: '.png',
    subdir: 'kenney-pixel', keepSubpath: true, style: 'pixel', license: 'CC0-1.0',
    source: 'gdx-kenney-pixel', category: 'icon.ui', dest: 'gdx-kenney-pixel', idPrefix: 'gdxkp',
    transparent: true, extraTags: ['ui', '9patch', 'panel', 'button', 'pixel', 'kenney', 'game-ui'],
  },
  // Superpowers Ninja Adventure（CC0，Pixel-boy）：完整像素 RPG 包之一，~161 PNG。去掉 3d-* 不涉及（已限定子目录）。
  'superpowers-ninja': {
    repo: 'sparklinlabs/superpowers-asset-packs', ref: 'master', tarTop: 'superpowers-asset-packs-master', ext: '.png',
    subdir: 'ninja-adventure', keepSubpath: true, style: 'pixel', license: 'CC0-1.0',
    source: 'superpowers', category: 'sheet', dest: 'superpowers/ninja-adventure', idPrefix: 'sp/ninja',
    transparent: true, extraTags: ['pixel', 'rpg', 'sprite', 'ninja', 'game'],
  },
};

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// SVG 尺寸：viewBox 优先，回退 width/height 属性（与 sniff.ts 同源逻辑）。
function svgDims(buf) {
  const tag = buf.subarray(0, 1024).toString('latin1').match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const vb = tag.match(/viewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.+-]+)\s+([\d.+-]+)/i);
  let w = vb ? Math.round(parseFloat(vb[1])) : 0;
  let h = vb ? Math.round(parseFloat(vb[2])) : 0;
  if (!w) w = Math.round(parseFloat(tag.match(/\bwidth\s*=\s*["']?\s*([\d.]+)/i)?.[1] ?? '0'));
  if (!h) h = Math.round(parseFloat(tag.match(/\bheight\s*=\s*["']?\s*([\d.]+)/i)?.[1] ?? '0'));
  return { w, h };
}

// PNG 尺寸：读 IHDR（8 字节签名后 = 长度4+类型4，宽高各 4 字节大端，偏移 16/20）。零外部依赖。
function pngDims(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return { w: 0, h: 0 };
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// 按扩展名取尺寸 + 格式（SVG 矢量 / PNG 位图）。
function dimsAndFormat(buf, rel) {
  return rel.toLowerCase().endsWith('.png')
    ? { ...pngDims(buf), format: 'png' }
    : { ...svgDims(buf), format: 'svg' };
}

const packKey = process.argv[2] ?? 'game-icons';
const limit = Number(process.argv[3] ?? 80);
const P = PACKS[packKey];
if (!P) {
  console.error(`未知包 "${packKey}"。可选: ${Object.keys(PACKS).join(', ')}`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'artpack-'));
try {
  const tgz = join(tmp, 'pack.tgz');
  const url = `https://codeload.github.com/${P.repo}/tar.gz/refs/heads/${P.ref}`;
  console.log(`↓ 下载 ${url}`);
  execFileSync('curl', ['-sSL', '-m', '180', '-o', tgz, url]);
  execFileSync('tar', ['-xzf', tgz, '-C', tmp]);
  const srcRoot = join(tmp, P.tarTop);

  let files = walk(srcRoot)
    .filter((f) => f.toLowerCase().endsWith(P.ext))
    .map((f) => relative(srcRoot, f).split(sep).join('/'))
    .filter((rel) => !P.subdir || rel.startsWith(P.subdir + '/'))
    .filter((rel) => !P.pathIncludes || rel.toLowerCase().includes(P.pathIncludes)) // 选风格/变体（如 fluentui 取 /flat/、devicon 取 -original）
    .filter((rel) => !P.pathExcludes || !P.pathExcludes.some((x) => rel.toLowerCase().includes(x))) // 排除子集（如 superpowers 去掉 3d-*）
    .sort();
  if (files.length > limit) {
    if (P.sample === 'even') {
      const step = files.length / limit, picked = [];
      for (let i = 0; picked.length < limit && Math.floor(i) < files.length; i += step) picked.push(files[Math.floor(i)]);
      files = picked;
    } else files = files.slice(0, limit);
  }

  const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
  const byId = new Map(idx.assets.map((a) => [a.id, a]));

  let added = 0;
  for (const rel of files) {
    const parts = rel.split('/');
    const ext = rel.toLowerCase().endsWith('.png') ? '.png' : '.svg';
    const stripExt = (s) => s.replace(/\.9\.png$/i, '').replace(/\.(svg|png)$/i, '');
    const name = stripExt(parts[parts.length - 1]);
    if (!name) continue;
    const author = P.flatId ? P.source : parts[0]; // flatId 包无作者层
    if (!P.flatId && !P.keepSubpath && parts.length < 2) continue;
    const buf = readFileSync(join(srcRoot, rel));
    const { w, h, format } = dimsAndFormat(buf, rel);
    if (!w || !h) continue; // 尺寸读不出 → 跳过
    // keepSubpath：保留 subdir 下的层级（slug 化，避免不同子目录同名互相覆盖；PNG 包常见）。
    let id, destRel;
    if (P.keepSubpath) {
      const under = P.subdir ? rel.slice(P.subdir.length + 1) : rel;
      const slug = stripExt(under).toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
      id = `${P.idPrefix}/${slug}`;
      destRel = `${P.dest}/${slug}${ext}`;
    } else if (P.flatId) {
      id = `${P.idPrefix}/${name}`;
      destRel = `${P.dest}/${name}${ext}`;
    } else {
      id = `${P.idPrefix}/${author}/${name}`;
      destRel = `${P.dest}/${author}/${name}${ext}`;
    }
    const destAbs = join(ASSETS, destRel);
    mkdirSync(dirname(destAbs), { recursive: true });
    copyFileSync(join(srcRoot, rel), destAbs);
    const category = (P.categoryRules ?? []).find((r) => r.re.test(name))?.category ?? P.category;
    const words = name.split(/[-_]/).filter(Boolean);
    const extraTags = category === 'playing-card' ? ['card', 'poker', 'playing-card'] : (P.extraTags ?? ['icon', 'flat', 'vector']);
    byId.set(id, {
      id,
      type: 'texture',
      description: (P.flatId || P.keepSubpath) ? `${name.replace(/[-_]/g, ' ')} · ${P.source}` : `${name.replace(/[-_]/g, ' ')} · ${P.source} (${author})`,
      status: 'filled',
      path: destRel,
      category,
      style: P.style,
      license: P.license,
      source: P.source,
      tags: [...new Set([...words, P.source, ...extraTags])],
      spec: { format, width: w, height: h, transparent: P.transparent ?? true },
      provenance: (P.flatId || P.keepSubpath) ? { repo: P.repo, ref: P.ref } : { repo: P.repo, ref: P.ref, author },
    });
    added++;
  }

  idx.assets = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(INDEX, JSON.stringify(idx, null, 2) + '\n');
  console.log(
    `✓ 并入 ${added} 项 (${P.style} · ${P.license}) → assets/${P.dest}/ + assets/index.json（共 ${idx.assets.length} 项）`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
