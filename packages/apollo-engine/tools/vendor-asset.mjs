// vendor-asset —— 把**共享资产库**（assets/index.json）里的一个资源，copy 进**某游戏的本地美术目录**，
// 并登记进该游戏的**本地资产索引**（public/games/<game>/art/index.json）。REQ-Resource ⑤（owner 2026-07-01）。
//
// 架构（owner 拍板·vendoring 模型）：共享库是「被 copy 的货架」，游戏运行时不直接引它；游戏只引自己的本地索引，
// 保持本地目录 hermetic（自洽·安全·干净）。要用共享库资源 → 用本工具 copy 进本地目录 + 本地索引引这份拷贝。
//
// 用法: node scripts/vendor-asset.mjs <shared-asset-id> <game> [--as <local-id>]
//   例: node scripts/vendor-asset.mjs devicon/aarch64-original game-z --as tex/chip
//
// 确定性：纯文件 copy + JSON upsert（按 id 幂等·同输入同结果·可复放·可审计）。零网络/零外部依赖（node 内建）。
// 携带元数据：usage/colorSpace(spec) + license/source/style/tags/provenance 一并搬进本地条目，并记 vendoredFrom 溯源。
// 本地索引 = 站点绝对路径（/games/<game>/art/...）+ baseUrl '' → 游戏侧 registerAssetIndex(parseAssetIndex(local)) 直接消费。

import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_INDEX = join(ROOT, 'assets', 'index.json');

function die(msg) { console.error(`vendor-asset: ${msg}`); process.exit(1); }

// —— 参数 ——
const argv = process.argv.slice(2);
const asIdx = argv.indexOf('--as');
const localId = asIdx >= 0 ? argv[asIdx + 1] : undefined;
const asJson = argv.includes('--json'); // 机读：后端/UI 解析用
// 位置参数 = 既不是 flag（--x）、也不是 --as 的取值
const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--as');
const [assetId, game] = positional;
if (!assetId || !game) die('用法: node scripts/vendor-asset.mjs <shared-asset-id> <game> [--as <local-id>] [--json]');

// —— 读共享库·定位源条目 ——
if (!existsSync(SHARED_INDEX)) die(`找不到共享库索引 ${SHARED_INDEX}`);
const shared = JSON.parse(readFileSync(SHARED_INDEX, 'utf8'));
const src = shared.assets.find((a) => a.id === assetId);
if (!src) die(`共享库无资产 id "${assetId}"`);
if (src.status !== 'filled') die(`资产 "${assetId}" 未 filled（无可 vendor 内容）`);
// material 是数据型资产（无文件·数据全在 spec）→ 免 path、免 copy，只搬索引条目；其余（texture/mesh/hdr…）copy 文件。
const dataOnly = src.type === 'material';
if (!dataOnly && !src.path) die(`资产 "${assetId}" 缺 path（无文件可 copy）`);

// —— 目标：游戏本地美术目录 + 本地索引 ——
const id = localId ?? src.id;
const artDir = join(ROOT, 'public', 'games', game, 'art');
const localIndexFile = join(artDir, 'index.json');

let servedPath; // 数据型资产无文件 → 无 path
if (dataOnly) {
  mkdirSync(artDir, { recursive: true });
} else {
  const srcFile = join(ROOT, 'assets', src.path);
  if (!existsSync(srcFile)) die(`源文件不存在：${srcFile}`);
  const destRel = src.path; // 镜像共享库子路径（devicon/x.svg → art/devicon/x.svg；mesh glb / env hdr 同法）
  const destFile = join(artDir, destRel);
  servedPath = `/games/${game}/art/${destRel.split('\\').join('/')}`; // 站点绝对路径
  mkdirSync(dirname(destFile), { recursive: true });
  copyFileSync(srcFile, destFile);
}

// 本地索引 upsert（按 id·幂等）。
const local = existsSync(localIndexFile)
  ? JSON.parse(readFileSync(localIndexFile, 'utf8'))
  : { version: 1, assets: [] };

const entry = {
  id,
  type: src.type,
  description: src.description,
  status: 'filled',
  ...(servedPath !== undefined ? { path: servedPath } : {}), // material 无 path
  ...(src.spec !== undefined ? { spec: src.spec } : {}), // usage/colorSpace/preset 等一并搬（法线线性等元数据不丢）
  ...(src.category !== undefined ? { category: src.category } : {}),
  ...(src.tags !== undefined ? { tags: src.tags } : {}),
  ...(src.style !== undefined ? { style: src.style } : {}),
  ...(src.license !== undefined ? { license: src.license } : {}),
  source: src.source ?? 'shared-library',
  provenance: { ...(src.provenance ?? {}), vendoredFrom: assetId }, // 溯源：从共享库哪条 vendor 来
};

const at = local.assets.findIndex((a) => a.id === id);
if (at >= 0) local.assets[at] = entry;
else local.assets.push(entry);
local.assets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // 稳定排序·可复放

writeFileSync(localIndexFile, JSON.stringify(local, null, 2) + '\n');

if (asJson) {
  console.log(JSON.stringify({ ok: true, id, game, type: src.type, dataOnly, servedPath: servedPath ?? null, localCount: local.assets.length, updated: at >= 0 }));
} else {
  console.log(`vendored "${assetId}" → ${dataOnly ? '(数据型·无文件)' : servedPath}`);
  console.log(`  本地索引: ${localIndexFile}（${local.assets.length} 条）`);
  console.log(`  游戏侧消费：registerAssetIndex(parseAssetIndex(<该 index.json>), assets)  // baseUrl ''`);
}
