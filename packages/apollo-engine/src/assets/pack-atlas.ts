import type { Rect } from './asset-types.js';
import type { AssetIndex, AssetIndexEntry } from './asset-index.js';

// ═══════════════════════════════════════════════════════════════
//  pack-atlas —— AOT 离线资产打包工具的**纯转换核心**（R9 增益 ③）。
//  Free Texture Packer / TexturePacker 把散图打成一张大图 + 一份 JSON（hash 格式）；
//  本模块把那份 JSON 收敛进引擎的**唯一真理 AssetIndex**（一个 atlas = 一条 filled texture 条目 +
//  spec.frames 承载命名子矩形）。不造第二个 manifest（Gemini 裁决）。
//
//  纯函数、无 I/O → 可单测、确定。实际的"读 FTP json 文件 + 写 assets/index.json"由一段薄 Node 胶水
//  调用本模块完成（约 10 行 fs：JSON.parse → mergeAtlasIntoIndex → fs.writeFile），不进浏览器构建。
//
//  运行期消费：registerAssetIndex 见到带 spec.frames 的 texture 条目 → 注册成 AtlasDescriptor，
//  Sprite.textureKey 指帧名即出图；配合命名动画剪辑（增益 B）可逐帧播放。
// ═══════════════════════════════════════════════════════════════

/** Free Texture Packer / TexturePacker 的单帧（hash 格式，取我们需要的子矩形）。 */
export interface FtpFrame {
  readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}
/** FTP 输出 JSON（hash 格式）：帧名 → 帧；meta.image 为大图文件名。 */
export interface FtpAtlasJson {
  readonly frames: Readonly<Record<string, FtpFrame>>;
  readonly meta?: { readonly image?: string };
}

/** 帧名归一：去扩展名（"hero_idle_0.png" → "hero_idle_0"），作全局唯一符号 key。 */
export function normalizeFrameName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

/** FTP JSON → 命名帧矩形表（= atlas.frames 形态，也即 AssetIndex 条目的 spec.frames）。 */
export function ftpFrames(ftp: FtpAtlasJson): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  for (const [name, f] of Object.entries(ftp.frames)) {
    out[normalizeFrameName(name)] = { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h };
  }
  return out;
}

/** FTP JSON → 一条 filled texture AssetIndexEntry（spec.frames 承载切片）。 */
export function ftpToAtlasEntry(ftp: FtpAtlasJson, opts: { id: string; path: string; description?: string }): AssetIndexEntry {
  return {
    id: opts.id,
    type: 'texture',
    status: 'filled',
    path: opts.path,
    description: opts.description ?? `图集 ${opts.id}`,
    spec: { frames: ftpFrames(ftp) },
  };
}

/** 把一个打包好的 atlas 合并进 AssetIndex（按 id 替换同名条目）。纯函数 → 确定、可测。 */
export function mergeAtlasIntoIndex(index: AssetIndex, ftp: FtpAtlasJson, opts: { id: string; path: string; description?: string }): AssetIndex {
  const entry = ftpToAtlasEntry(ftp, opts);
  const assets = index.assets.filter((a) => a.id !== entry.id);
  assets.push(entry);
  return { version: index.version, assets };
}
