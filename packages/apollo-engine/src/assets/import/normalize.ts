import type { AssetIndexEntry } from '../asset-index.js';
import type { ImageInfo } from './sniff.js';
import type { NormalizationProfile } from './profile.js';

// 导入归一化核心 —— 纯函数：一批文件元数据 + 一份 profile + 现有 id 集 → 导入计划。
// 计划逐行给出「原始文件 → 归一化 id/落盘路径 + 处置 + 理由」，UI 只负责展示与让人改写，
// 真正的判定全在这里（可单测、可复放：同输入同 profile 必同输出）。

/** 待导入文件的元数据（字节本体留在调用方；这里只要 hash + 嗅探结果，保持纯净）。 */
export interface ImportFile {
  /** 原始相对路径（可含目录，作分类规则匹配与溯源）。 */
  readonly name: string;
  readonly size: number;
  /** 内容哈希（fnv1a）—— 重复检测依据。 */
  readonly hash: string;
  readonly info?: ImageInfo;
}

export type PlanAction = 'import' | 'rename' | 'skip-duplicate' | 'skip-conflict' | 'skip-unsupported';

export interface PlanRow {
  readonly file: ImportFile;
  /** 主题名（去变体后缀、已 slug 化）。 */
  readonly subject: string;
  readonly variant?: number;
  /** 归一化稳定 id（= 未来的 textureKey）。 */
  readonly id: string;
  /** 落盘路径（相对仓库根，assets/ 开头）。 */
  readonly targetPath: string;
  readonly category: string;
  readonly action: PlanAction;
  readonly reason: string;
  /** 原名含非 ASCII，slug 时被转写/丢弃（原名保留进描述）。 */
  readonly transliterated: boolean;
  readonly spec?: Readonly<Record<string, unknown>>;
}

export interface ImportPlan {
  readonly rows: readonly PlanRow[];
  readonly counts: Readonly<Record<PlanAction, number>>;
}

const SUPPORTED_EXT: Readonly<Record<string, string>> = {
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
};

function basename(p: string): string {
  const segs = p.split(/[\\/]/);
  return segs[segs.length - 1];
}

function splitExt(file: string): { stem: string; ext: string } {
  const m = file.match(/^(.*)\.([a-z0-9]+)$/i);
  return m ? { stem: m[1], ext: m[2].toLowerCase() } : { stem: file, ext: '' };
}

/** 变体后缀拆分（按 profile 的模式顺序，首个命中生效）："sword_3" → {subject:"sword", variant:3}。 */
export function splitVariant(
  stem: string,
  profile: NormalizationProfile,
): { subject: string; variant?: number } {
  for (const src of profile.variantPatterns) {
    const m = stem.match(new RegExp(src));
    if (m && m[1] !== undefined) {
      return { subject: stem.slice(0, stem.length - m[0].length), variant: parseInt(m[1], 10) };
    }
  }
  return { subject: stem };
}

/** stem → id 安全 slug。返回是否发生了非 ASCII 转写（丢字符）。 */
export function slugify(stem: string, profile: NormalizationProfile): { slug: string; transliterated: boolean } {
  const lowered = profile.lowercase ? stem.toLowerCase() : stem;
  // 非 ASCII 直接丢弃（原名保留在描述/溯源里）；ASCII 里的非法字符折成 '_'。
  const asciiOnly = lowered.replace(/[^\x20-\x7e]+/g, '');
  const transliterated = asciiOnly !== lowered;
  const slug = asciiOnly
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  return { slug, transliterated };
}

/** 分类判定：categoryRules 自上而下首个命中（对完整相对路径不区分大小写做子串匹配）。 */
export function categoryFor(name: string, profile: NormalizationProfile): string {
  const hay = name.toLowerCase();
  for (const r of profile.categoryRules) {
    if (r.match && hay.includes(r.match.toLowerCase())) return r.category;
  }
  return profile.category;
}

/** 生成导入计划（核心入口）。`existingIds` = 当前库里全部已占用 id。 */
export function planImport(
  files: readonly ImportFile[],
  profile: NormalizationProfile,
  existingIds: ReadonlySet<string>,
): ImportPlan {
  const rows: PlanRow[] = [];
  const seenHash = new Map<string, string>(); // hash → 首个文件名
  const usedIds = new Set(existingIds);

  files.forEach((f, i) => {
    const base = basename(f.name);
    const { stem, ext } = splitExt(base);
    const extNorm = f.info ? (f.info.format === 'jpeg' ? 'jpg' : f.info.format) : SUPPORTED_EXT[ext];
    const category = categoryFor(f.name, profile);
    const prefix = profile.idPrefix || `${profile.type}/${category}`;

    // ① 格式不支持
    if (!extNorm) {
      rows.push({
        file: f, subject: stem, id: '', targetPath: '', category,
        action: 'skip-unsupported', reason: `不支持的格式 .${ext || '?'}`, transliterated: false,
      });
      return;
    }

    // ② 同内容重复（hash 相同；典型如浏览器重复下载 "x (1).png"）
    const firstOfHash = seenHash.get(f.hash);
    if (firstOfHash !== undefined && profile.duplicatePolicy === 'skip') {
      rows.push({
        file: f, subject: stem, id: '', targetPath: '', category,
        action: 'skip-duplicate', reason: `与「${firstOfHash}」内容相同（hash ${f.hash}）`, transliterated: false,
      });
      return;
    }
    if (firstOfHash === undefined) seenHash.set(f.hash, f.name);

    // ③ 变体拆分 + slug 归一
    const { subject: rawSubject, variant } = splitVariant(stem, profile);
    const { slug, transliterated } = slugify(rawSubject, profile);
    const subject = slug || `asset_${i + 1}`;
    const finalStem = variant !== undefined ? `${subject}_${variant}` : subject;

    // ④ id 冲突（对现有库 + 本批已分配）
    let id = `${prefix}/${finalStem}`;
    let action: PlanAction = 'import';
    let reason = '';
    if (usedIds.has(id)) {
      if (profile.conflictPolicy === 'skip') {
        rows.push({
          file: f, subject, variant, id, targetPath: '', category,
          action: 'skip-conflict', reason: `id 已存在：${id}`, transliterated,
        });
        return;
      }
      const conflicted = id;
      let n = 2;
      while (usedIds.has(`${conflicted}_${n}`)) n++;
      id = `${conflicted}_${n}`;
      action = 'rename';
      reason = `id 冲突 → 自动改名（原 ${conflicted}）`;
    }
    usedIds.add(id);

    if (transliterated && !reason) reason = '非 ASCII 已转写，原名存入描述';
    if (!reason) reason = variant !== undefined ? `变体 ${rawSubject} #${variant}` : '导入';

    const fileStem = id.slice(prefix.length + 1); // 改名后保持 id 与文件名一致
    const targetPath = `assets/${profile.type}/${category}/${fileStem}.${extNorm}`;

    const spec: Record<string, unknown> = {};
    if (f.info) {
      spec.width = f.info.width;
      spec.height = f.info.height;
      spec.format = extNorm;
      if (f.info.alpha !== undefined) spec.transparent = f.info.alpha;
    }

    rows.push({
      file: f, subject, variant, id, targetPath, category, action, reason, transliterated,
      spec: Object.keys(spec).length ? spec : undefined,
    });
  });

  const counts: Record<PlanAction, number> = {
    import: 0, rename: 0, 'skip-duplicate': 0, 'skip-conflict': 0, 'skip-unsupported': 0,
  };
  for (const r of rows) counts[r.action]++;
  return { rows, counts };
}

/** 计划行（仅 import/rename）→ AssetIndexEntry 增量（导入器提交时写进 assets/index.json）。 */
export function planEntries(
  plan: ImportPlan,
  profile: NormalizationProfile,
  opts: { readonly method: string },
): AssetIndexEntry[] {
  return plan.rows
    .filter((r) => r.action === 'import' || r.action === 'rename')
    .map((r) => ({
      id: r.id,
      type: profile.type,
      description: r.transliterated || r.action === 'rename' ? `${r.subject}（原 ${r.file.name}）` : r.subject,
      status: 'filled' as const,
      path: r.targetPath.replace(/^assets\//, ''),
      spec: r.spec,
      category: r.category,
      tags: [...profile.defaultTags, r.category].filter((t, i, a) => t && a.indexOf(t) === i),
      source: 'import',
      provenance: { method: opts.method, originalFile: r.file.name, hash: r.file.hash },
    }));
}
