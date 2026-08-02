// 风格包库（style-packs·REQ-DEMO-T1 ②·工作流档 §四）——**纯数据文件 `scripts/style-packs.json`**，本模块只是薄加载器。
// 一个 packId 翻译成各家方言（万相吃中文 promptZh·Tripo/Meshy 吃英文 promptEn）；弱 LLM/用户只碰 packId。
// palette = palette-snap 后处理的靶（同款游戏全列表共用 → 天然成套）。
// **扩包 = 往 style-packs.json 加一条（不改任何代码）**；demo 前先调稳这 3 包。
// refImage（定调图参考·图生图锚）：字段保留在 schema；adapters 当前无参考图入参——
//   blocker 记录：万相 style-repaint / Meshy image-to-3D 的参考图 API 待真 key 验证后接（工作流档 §四）。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ packId:string, name:string, promptZh:string, promptEn:string, palette:number[],
 *   uiPromptZh?:string, uiPromptEn?:string,   // 非场景资产（sprite/texture/UI）的场景-free 变体（仅配色+质感·缺=回退 promptZh/En）
 *   negative:{zh:string,en:string}, post:{paletteSnap:boolean, pixelGrid?:number},
 *   params:{provider:'qwen'|'seedream'|'tripo'|'meshy', model:string, seed?:number}, refImage?:string, local?:boolean }} StylePack */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKS_FILE = join(SCRIPT_DIR, 'style-packs.json');
// 本地命名风格预设库（owner 2026-07-22·工坊自建风格·gitignored·同 .apollo-config.json 就近本机）：
// owner 在工坊「新建风格」存这里→并入 STYLE_PACKS（本地覆盖同名内置）→一键换风格可选它。绝不入仓。
const LOCAL_FILE = join(SCRIPT_DIR, '..', '.apollo-styles.json');

/** @type {Record<string, StylePack>} */
export const BUILTIN_PACKS = JSON.parse(readFileSync(PACKS_FILE, 'utf8'));

/** 读本地风格库（缺/坏=空·绝不炸）。每条打 local:true 便于 UI 区分「可删的自建风格」。 */
export function readLocalStyles() {
  try {
    const d = JSON.parse(readFileSync(LOCAL_FILE, 'utf8'));
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
    const out = {};
    for (const [id, p] of Object.entries(d)) if (p && typeof p === 'object') out[id] = { ...p, packId: id, local: true };
    return out;
  } catch { return {}; }
}

/** 内置 + 本地合并（本地覆盖同名内置）。CLI 每次调用重导入→自然拿最新本地。 */
export function allStylePacks() { return { ...BUILTIN_PACKS, ...readLocalStyles() }; }

/** @type {Record<string, StylePack>} 内置+本地合并快照（导入期）。子进程每次调用=新鲜。 */
export const STYLE_PACKS = allStylePacks();

export const STYLE_PACK_IDS = Object.keys(STYLE_PACKS);

const PROVIDERS = ['qwen', 'seedream', 'tripo', 'meshy'];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** 校验一条风格包（owner 自建门·防坏数据混进生成链）。返回 {ok, errors[]}。 */
export function validateStylePack(p) {
  const e = [];
  if (!p || typeof p !== 'object') return { ok: false, errors: ['非对象'] };
  if (typeof p.packId !== 'string' || !SLUG.test(p.packId)) e.push('packId 需小写字母数字连字符（slug）');
  if (typeof p.name !== 'string' || !p.name.trim()) e.push('name 必填');
  if (typeof p.promptZh !== 'string' || !p.promptZh.trim()) e.push('promptZh 必填');
  if (typeof p.promptEn !== 'string' || !p.promptEn.trim()) e.push('promptEn 必填');
  if (!Array.isArray(p.palette) || p.palette.length === 0 || !p.palette.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffff)) e.push('palette 需非空整数色数组（0..0xffffff）');
  if (!p.params || !PROVIDERS.includes(p.params.provider)) e.push(`params.provider 需属 ${PROVIDERS.join('/')}`);
  if (!p.params || typeof p.params.model !== 'string' || !p.params.model.trim()) e.push('params.model 必填');
  return { ok: e.length === 0, errors: e };
}

/** 归一化一条自建风格到完整 schema（补缺省·剥未知项·防注入）。 */
function normalizeStylePack(p) {
  return {
    packId: p.packId, name: String(p.name), local: true,
    promptZh: String(p.promptZh), promptEn: String(p.promptEn),
    ...(typeof p.uiPromptZh === 'string' ? { uiPromptZh: p.uiPromptZh } : {}),
    ...(typeof p.uiPromptEn === 'string' ? { uiPromptEn: p.uiPromptEn } : {}),
    palette: p.palette.map((n) => n | 0),
    negative: (p.negative && typeof p.negative === 'object') ? { zh: String(p.negative.zh || ''), en: String(p.negative.en || '') } : { zh: '', en: '' },
    post: (p.post && typeof p.post === 'object') ? { paletteSnap: !!p.post.paletteSnap, ...(p.post.pixelGrid ? { pixelGrid: p.post.pixelGrid | 0 } : {}) } : { paletteSnap: false },
    params: { provider: p.params.provider, model: String(p.params.model), ...(p.params.seed != null ? { seed: p.params.seed | 0 } : {}) },
    refImage: null,
  };
}

/** 存一条自建风格进本地库（校验→归一化→写 .apollo-styles.json）。返回 {ok, errors?, packId?}。 */
export function saveLocalStyle(pack, { file = LOCAL_FILE } = {}) {
  const v = validateStylePack(pack);
  if (!v.ok) return { ok: false, errors: v.errors };
  let cur = {};
  try { if (existsSync(file)) { const d = JSON.parse(readFileSync(file, 'utf8')); if (d && typeof d === 'object' && !Array.isArray(d)) cur = d; } } catch { cur = {}; }
  cur[pack.packId] = normalizeStylePack(pack);
  writeFileSync(file, JSON.stringify(cur, null, 2) + '\n', 'utf8');
  return { ok: true, packId: pack.packId };
}

/** 删一条自建风格（只能删本地·内置不可删）。返回 {ok, errors?}。 */
export function deleteLocalStyle(packId, { file = LOCAL_FILE } = {}) {
  if (BUILTIN_PACKS[packId]) return { ok: false, errors: ['内置风格不可删'] };
  let cur = {};
  try { if (existsSync(file)) { const d = JSON.parse(readFileSync(file, 'utf8')); if (d && typeof d === 'object' && !Array.isArray(d)) cur = d; } } catch { cur = {}; }
  if (!(packId in cur)) return { ok: false, errors: [`本地无此风格: ${packId}`] };
  delete cur[packId];
  writeFileSync(file, JSON.stringify(cur, null, 2) + '\n', 'utf8');
  return { ok: true, packId };
}

/** 风格包 → 供 UI/端点列出的摘要（local 标位·供工坊区分可删的自建风格）。 */
export function listStylePacks() {
  return Object.keys(STYLE_PACKS).map((id) => {
    const p = STYLE_PACKS[id];
    return { packId: p.packId, name: p.name, palette: p.palette, provider: p.params.provider, post: p.post, local: !!p.local };
  });
}
