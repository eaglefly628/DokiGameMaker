import { describe, it, expect } from 'vitest';
import { planImport, planEntries, slugify, splitVariant, type ImportFile } from './normalize.js';
import { DEFAULT_PROFILE, type NormalizationProfile } from './profile.js';
import type { ImageInfo } from './sniff.js';

const png32: ImageInfo = { format: 'png', width: 32, height: 32, alpha: true };

function f(name: string, hash: string, info: ImageInfo | undefined = png32): ImportFile {
  return { name, size: 100, hash, info };
}

const P: NormalizationProfile = { ...DEFAULT_PROFILE, category: 'icon.item' };

describe('slugify / splitVariant', () => {
  it('大小写/空格/非法字符归一', () => {
    expect(slugify('Sword Of FIRE!', P).slug).toBe('sword_of_fire');
  });
  it('非 ASCII 丢弃并标记转写', () => {
    const r = slugify('角色立绘 v2 最终版', P);
    expect(r.slug).toBe('v2');
    expect(r.transliterated).toBe(true);
  });
  it('变体模式：_n / (n) / -n', () => {
    expect(splitVariant('sword_3', P)).toEqual({ subject: 'sword', variant: 3 });
    expect(splitVariant('sword (2)', P)).toEqual({ subject: 'sword', variant: 2 });
    expect(splitVariant('sword-7', P)).toEqual({ subject: 'sword', variant: 7 });
    expect(splitVariant('sword', P)).toEqual({ subject: 'sword' });
  });
});

describe('planImport — 散图归一化', () => {
  it('变体同主题不同 id；规格写入 spec', () => {
    const plan = planImport([f('Sword_1.png', 'h1'), f('Sword_2.png', 'h2')], P, new Set());
    expect(plan.rows.map((r) => r.id)).toEqual(['texture/icon.item/sword_1', 'texture/icon.item/sword_2']);
    expect(plan.rows[0].subject).toBe('sword');
    expect(plan.rows[0].targetPath).toBe('assets/texture/icon.item/sword_1.png');
    expect(plan.rows[0].spec).toMatchObject({ width: 32, height: 32, format: 'png', transparent: true });
    expect(plan.counts.import).toBe(2);
  });

  it('同内容 hash → 跳过（浏览器重复下载场景）', () => {
    const plan = planImport([f('x.png', 'same'), f('x (1).png', 'same')], P, new Set());
    expect(plan.rows[1].action).toBe('skip-duplicate');
    expect(plan.rows[1].reason).toContain('x.png');
    expect(plan.counts['skip-duplicate']).toBe(1);
  });

  it('同名 (n) 但内容不同 → 当变体导入', () => {
    const plan = planImport([f('x.png', 'a'), f('x (2).png', 'b')], P, new Set());
    expect(plan.rows[1].action).toBe('import');
    expect(plan.rows[1].id).toBe('texture/icon.item/x_2');
  });

  it('全非 ASCII 文件名 → asset_<n> 兜底 + 转写标记', () => {
    const plan = planImport([f('立绘.png', 'h1')], P, new Set());
    expect(plan.rows[0].id).toBe('texture/icon.item/asset_1');
    expect(plan.rows[0].transliterated).toBe(true);
  });

  it('id 冲突：suffix 自动改名 / skip 跳过', () => {
    const existing = new Set(['texture/icon.item/sword']);
    const renamed = planImport([f('sword.png', 'h1')], P, existing);
    expect(renamed.rows[0].action).toBe('rename');
    expect(renamed.rows[0].id).toBe('texture/icon.item/sword_2');
    expect(renamed.rows[0].targetPath).toBe('assets/texture/icon.item/sword_2.png');

    const skipped = planImport([f('sword.png', 'h1')], { ...P, conflictPolicy: 'skip' }, existing);
    expect(skipped.rows[0].action).toBe('skip-conflict');
  });

  it('本批内部撞 id 也会改名', () => {
    // 同内容不跳过（keep）时，x.png 与 sub/x.png 归一成同 id。
    const plan = planImport(
      [f('x.png', 'h1'), f('sub/x.png', 'h2')],
      P,
      new Set(),
    );
    expect(plan.rows[0].id).toBe('texture/icon.item/x');
    expect(plan.rows[1].action).toBe('rename');
    expect(plan.rows[1].id).toBe('texture/icon.item/x_2');
  });

  it('不支持的格式（无嗅探结果 + 未知扩展名）→ skip-unsupported', () => {
    const plan = planImport([{ name: 'readme.txt', size: 100, hash: 'h1' }], P, new Set());
    expect(plan.rows[0].action).toBe('skip-unsupported');
  });

  it('categoryRules：路径关键词改分类（乱目录归一）', () => {
    const prof: NormalizationProfile = {
      ...P,
      categoryRules: [{ match: 'bg/', category: 'background' }],
    };
    const plan = planImport(
      [f('bg/BG_Office-Final.jpg', 'h1', { format: 'jpeg', width: 1280, height: 720, alpha: false }), f('loose.png', 'h2')],
      prof,
      new Set(),
    );
    expect(plan.rows[0].id).toBe('texture/background/bg_office-final');
    expect(plan.rows[0].targetPath).toBe('assets/texture/background/bg_office-final.jpg');
    expect(plan.rows[1].category).toBe('icon.item'); // 未命中规则走默认
  });
});

describe('planEntries — 计划 → 索引增量', () => {
  it('仅 import/rename 成条目；path 去 assets/ 前缀；带溯源', () => {
    const plan = planImport([f('Sword.png', 'h1'), f('dup.png', 'h1')], P, new Set());
    const entries = planEntries(plan, P, { method: 'import-loose' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'texture/icon.item/sword',
      type: 'texture',
      status: 'filled',
      path: 'texture/icon.item/sword.png',
      category: 'icon.item',
      source: 'import',
    });
    expect(entries[0].tags).toContain('icon.item');
    expect(entries[0].provenance).toMatchObject({ method: 'import-loose', originalFile: 'Sword.png', hash: 'h1' });
  });
});
