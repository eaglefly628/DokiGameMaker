// 复查门 + 评分卡（REQ-QC-三门）语义门禁：evalReview/evalScorecard/boardFor 三门合成。
// 临时目录建 fixture 游戏（boardFor 吃 root 参数·不碰真仓库）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalReview, evalScorecard, boardFor, SCORECARD_DIMS, REVIEW_STAGES } from './game-pipeline.mjs';

const H = 'hash-fresh';
const dims = (v) => Object.fromEntries(SCORECARD_DIMS.map((d) => [d, v]));

describe('evalReview — 复查门语义', () => {
  it('未复查=dim；PASS=ok；CONCERNS=有条件过(ok·⚠)；FAIL=fail', () => {
    expect(evalReview(undefined, H).state).toBe('dim');
    expect(evalReview({ verdict: 'PASS', note: 'n', by: 'r', at: '', gameHash: H }, H).state).toBe('ok');
    const c = evalReview({ verdict: 'CONCERNS', note: 'n', by: 'r', at: '', gameHash: H }, H);
    expect(c.state).toBe('ok');
    expect(c.detail).toContain('CONCERNS');
    expect(evalReview({ verdict: 'FAIL', note: 'n', by: 'r', at: '', gameHash: H }, H).state).toBe('fail');
  });
  it('内容指纹变了 → 复查过期（绿不是永久绿）', () => {
    expect(evalReview({ verdict: 'PASS', note: 'n', by: 'r', at: '', gameHash: 'old' }, H).state).toBe('stale');
  });
});

describe('evalScorecard — S7 评分卡语义', () => {
  it('未打=dim；全维≥2=ok(PREMIUM YES)；有维<2 无 0=warn；任一维 0=fail', () => {
    expect(evalScorecard(undefined, H).state).toBe('dim');
    const good = evalScorecard({ scores: dims(2), by: 'r', at: '', gameHash: H }, H);
    expect(good.state).toBe('ok');
    expect(good.detail).toContain('PREMIUM: YES');
    const low = evalScorecard({ scores: { ...dims(2), 材质: 1 }, by: 'r', at: '', gameHash: H }, H);
    expect(low.state).toBe('warn');
    expect(low.detail).toContain('PREMIUM: NO');
    const zero = evalScorecard({ scores: { ...dims(2), VFX: 0 }, by: 'r', at: '', gameHash: H }, H);
    expect(zero.state).toBe('fail');
    expect(zero.detail).toContain('VFX');
  });
  it('指纹变了 → 评分过期', () => {
    expect(evalScorecard({ scores: dims(3), by: 'r', at: '', gameHash: 'old' }, H).state).toBe('stale');
  });
});

describe('boardFor — 三门合成（fixture 游戏）', () => {
  let root;
  const slug = 'fx-game';
  const pfPath = () => join(root, 'public', 'games', slug, 'pipeline.json');
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tri-gate-'));
    mkdirSync(join(root, 'public', 'games', slug), { recursive: true });
    writeFileSync(join(root, 'public', 'games', slug, 'manifest.json'), JSON.stringify({ capabilities: [], entities: {} }));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('复查 FAIL → 该关整体红（机器绿也压不住）', () => {
    // 伪造 S3 机器证据绿（gameHash 对上真指纹要调 gameHash——直接不带 gameHash 字段=不做过期判定）
    writeFileSync(pfPath(), JSON.stringify({
      version: 1, slug, concept: { name: 'x', pitch: 'y' }, signoffs: {},
      evidence: { S3: { exit: 0, summary: 'ok', at: '2026-07-15T00:00:00Z' } },
      reviews: { S3: { verdict: 'FAIL', note: '数据表无解释器', by: 'reviewer', at: '2026-07-15T00:00:00Z' } },
    }));
    const b = boardFor(root, slug);
    const s3 = b.stages.find((s) => s.id === 'S3');
    expect(s3.machine.state).toBe('ok');
    expect(s3.review.state).toBe('fail');
    expect(s3.status).toBe('fail');
  });

  it('机器绿+复查 PASS+人签 → 关才算 ok；缺复查=warn 卡住', () => {
    writeFileSync(pfPath(), JSON.stringify({
      version: 1, slug, concept: { name: 'x', pitch: 'y' }, signoffs: { S3: { by: 'owner', note: 'ok', at: '2026-07-15T00:00:00Z' } },
      evidence: { S3: { exit: 0, summary: 'ok', at: '2026-07-15T00:00:00Z' } },
    }));
    let s3 = boardFor(root, slug).stages.find((s) => s.id === 'S3');
    expect(s3.status).toBe('warn'); // 机器绿+人签·但没复查 → 不算 ok
    writeFileSync(pfPath(), JSON.stringify({
      version: 1, slug, concept: { name: 'x', pitch: 'y' }, signoffs: { S3: { by: 'owner', note: 'ok', at: '2026-07-15T00:00:00Z' } },
      evidence: { S3: { exit: 0, summary: 'ok', at: '2026-07-15T00:00:00Z' } },
      reviews: { S3: { verdict: 'PASS', note: '逐条核过', by: 'reviewer', at: '2026-07-15T00:00:00Z' } },
    }));
    s3 = boardFor(root, slug).stages.find((s) => s.id === 'S3');
    expect(s3.status).toBe('ok');
  });

  it('S7 评分卡任一维 0 → 品质关红灯（丑写在板上）', () => {
    writeFileSync(pfPath(), JSON.stringify({
      version: 1, slug, concept: { name: 'x', pitch: 'y' }, signoffs: {}, evidence: {},
      scorecard: { scores: { ...dims(2), VFX: 0 }, by: 'reviewer', note: '无任何反馈特效', at: '2026-07-15T00:00:00Z' },
    }));
    const s7 = boardFor(root, slug).stages.find((s) => s.id === 'S7');
    expect(s7.machine.state).toBe('fail');
    expect(s7.status).toBe('fail');
  });

  it('豁免关（S1/S6）不因复查门额外变灰/变黄', () => {
    writeFileSync(pfPath(), JSON.stringify({ version: 1, slug, concept: {}, signoffs: {}, evidence: {} }));
    const b = boardFor(root, slug);
    expect(b.stages.find((s) => s.id === 'S1').status).toBe('dim'); // 未填卡=灰（不受复查门影响）
    expect(REVIEW_STAGES).toEqual(['S2', 'S3', 'S4', 'S5', 'S8']); // 复查覆盖面钉死
  });
});
