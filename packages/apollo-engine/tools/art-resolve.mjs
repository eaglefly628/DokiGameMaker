#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/art-resolve.mjs —— 占位图解析（owner 07-12「占位符应显示游戏当前实际在用的图」）
//
//  用法：npx vite-node scripts/art-resolve.mjs <slug>
//
//  跑与运行器**同一套**引擎解析器（resolveArtRefs + artlibRecords + rankRecords）——
//  台账上显示的占位图 = 游戏画面里真在用的那张（同 query 同图·确定性·零另写排序器漂移）。
//  stdout 末行=机读 JSON {ok, resolutions:[{entity,component,field,query,id,thumb}]}。只读不写。
// ═══════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveArtRefs } from '../src/assembly/resolve-art-refs.ts';
import { artlibRecords } from '../src/assets/library.ts';

function die(msg) { process.stderr.write(`${msg}\n`); process.exit(1); }

const slug = process.argv[2];
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) die(`art-resolve: 非法 slug: ${slug ?? '(缺)'}`);

const ROOT = process.cwd();
let mfPath = resolve(ROOT, 'library', slug, 'manifest.json');
if (!existsSync(mfPath)) mfPath = resolve(ROOT, 'public', 'games', slug, 'manifest.json');
if (!existsSync(mfPath)) die(`art-resolve: 无 manifest: ${slug}`);

const idxPath = resolve(ROOT, 'assets', 'FreeArtLib', 'index.json');
if (!existsSync(idxPath)) die('art-resolve: 无 FreeArtLib 索引');

const manifest = JSON.parse(readFileSync(mfPath, 'utf8'));
const records = artlibRecords(JSON.parse(readFileSync(idxPath, 'utf8')));
const byId = new Map(records.map((r) => [r.id, r]));

const { resolutions } = resolveArtRefs(manifest, records);
const out = resolutions.map((r) => ({
  entity: r.entity, component: r.component, field: r.field, query: r.query, id: r.id,
  thumb: r.id && byId.get(r.id) ? byId.get(r.id).thumb : null,
}));
process.stdout.write(JSON.stringify({ ok: true, resolutions: out }) + '\n');
process.exit(0);
