import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SHELL, sBtn, sInput, sLabel, sChip } from '../ui/shell-theme.js';

// ═══════════════════════════════════════════════════════════════
//  AI 生成面板 —— 资源库的「文本→资产」入口（与「导入」向导并排）。
//  一句 prompt + 选适配器（tripo 文本→3D · qwen 文本→2D）+ 落点 → 生成到**待审区** → 预览 →
//    人点「✓ 入库 / ✕ 弃置」（人审门·M2.5）→ approve 才登记入库并刷库。
//  生成"大脑"在 PA 车道的 scripts/ai-gen.mjs；本组件只做交互，走
//    POST /api/assets/generate（落待审区 pending.json，不进 index）+ POST /api/assets/review（审核）。
//  哲学同 src/services/aigp：外部非确定性 AI 走旁路，产物=带 provenance 的固定资产，不碰 sim/hash。
//  本环境 GitHub-only → 真调 API 被挡，缺 key 或默认走 mock（产合法占位·prompt 播种）。
// ═══════════════════════════════════════════════════════════════

const API = 'http://localhost:4000';

interface Provider {
  readonly id: string;
  readonly kind: string;
  readonly license: string;
  readonly envKey: string;
  readonly keyConfigured: boolean;
  readonly apiKeyMasked: string;
}
interface GenResult {
  readonly ok?: boolean;
  readonly success?: boolean;
  readonly error?: string;
  readonly id?: string;
  readonly type?: string;
  readonly pending?: boolean;
  /** 待审文件的可预览 URL（站点绝对路径·共享货架 /assets/ai/pending/… 或游戏 /games/<g>/art/ai/pending/…）。 */
  readonly previewPath?: string;
  readonly mock?: boolean;
  readonly scope?: string;
}
/** 人审结果（approve 入库 / reject 弃置）。 */
type Reviewed = { action: 'approve' | 'reject'; ok: boolean; error?: string };

type AdapterId = 'tripo' | 'meshy' | 'qwen' | 'seedream';
const ADAPTER_META: Record<AdapterId, { label: string; hint: string }> = {
  tripo: { label: '🧊 Tripo · 文本→3D', hint: '生成 .glb 网格（可 vendor 进游戏 models/）' },
  meshy: { label: '🗿 Meshy · 文本→3D', hint: '生成 .glb 网格（外链 Meshy·可 vendor 进游戏 models/）' },
  qwen: { label: '🖼 千问万相 · 文本→2D', hint: '生成 .png 贴图/图标（DashScope 万相）' },
  seedream: { label: '🎨 Seedream · 文本→2D', hint: '生成 .png 美术图（字节火山方舟·美术主力·下方选模型版本）' },
};
const ADAPTER_ORDER: readonly AdapterId[] = ['seedream', 'qwen', 'tripo', 'meshy'];

/** 生成选项（下拉·如 Seedream 模型版本）——/api/settings genOptions·forKey 匹配当前适配器 envKey 时渲染。 */
interface GenOption {
  readonly envKey: string;
  readonly label: string;
  readonly forKey?: string | null;
  readonly choices: { value: string; label: string }[];
  readonly value: string;
  readonly default: string;
}

export function AssetGenPanel({ onClose, onCommitted }: { onClose: () => void; onCommitted: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [adapter, setAdapter] = useState<AdapterId>('seedream');
  const [prompt, setPrompt] = useState('');
  const [game, setGame] = useState(''); // 空=共享货架 assets/ai/；填=游戏本地 public/games/<g>/art/ai/
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [genOptions, setGenOptions] = useState<GenOption[]>([]); // 生成选项（Seedream 模型版本等·/api/settings）
  const [optVals, setOptVals] = useState<Record<string, string>>({}); // 各选项当前选值
  const [optSaved, setOptSaved] = useState(false); // 模型选择已存盘一闪提示

  useEffect(() => {
    fetch(`${API}/api/assets/generate/providers`)
      .then((r) => r.json())
      .then((j) => setProviders((j?.providers ?? []) as Provider[]))
      .catch(() => setProviders([]));
    fetch(`${API}/api/settings`)
      .then((r) => r.json())
      .then((v) => {
        const opts = (v?.genOptions ?? []) as GenOption[];
        setGenOptions(opts);
        setOptVals(Object.fromEntries(opts.map((o) => [o.envKey, o.value])));
      })
      .catch(() => setGenOptions([]));
  }, []);

  const active = useMemo(() => providers.find((p) => p.id === adapter), [providers, adapter]);
  // 当前适配器关联的生成选项（forKey 匹配其 envKey）——如 Seedream→模型版本下拉。
  const activeOpts = useMemo(
    () => genOptions.filter((o) => active && o.forKey === active.envKey),
    [genOptions, active],
  );

  // 改模型版本 → PUT /api/settings 持久化到本地（生成时经 _gen_env 注入·"存盘存本地"）。
  const saveOption = useCallback(async (envKey: string, value: string) => {
    setOptVals((m) => ({ ...m, [envKey]: value }));
    setOptSaved(false);
    try {
      await fetch(`${API}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genOptions: { [envKey]: value } }),
      });
      setOptSaved(true);
    } catch { /* 存盘失败静默·下次生成回退默认 */ }
  }, []);

  const generate = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setReviewed(null);
    try {
      const res = await fetch(`${API}/api/assets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter, prompt: prompt.trim(), game: game.trim() || undefined }),
      }).then((r) => r.json() as Promise<GenResult>);
      setResult(res);
      // 人审门：生成只落待审区，**不**刷库（尚未登记）。人点「入库」approve 后才 onCommitted。
    } catch (e) {
      setResult({ success: false, error: String(e) });
    } finally {
      setBusy(false);
    }
  }, [adapter, prompt, game, busy]);

  // 人审：✓ 入库(approve) / ✕ 弃置(reject)。approve 登记入库 → 刷库；两者都清掉待审预览。
  const review = useCallback(async (action: 'approve' | 'reject') => {
    if (!result?.id || reviewBusy) return;
    setReviewBusy(true);
    try {
      const res = await fetch(`${API}/api/assets/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, action, game: game.trim() || undefined }),
      }).then((r) => r.json() as Promise<{ success?: boolean; error?: string }>);
      if (res.success) {
        setReviewed({ action, ok: true });
        if (action === 'approve') onCommitted(); // 登记入 index → 刷库让新资产立现
      } else {
        setReviewed({ action, ok: false, error: res.error });
      }
    } catch (e) {
      setReviewed({ action, ok: false, error: String(e) });
    } finally {
      setReviewBusy(false);
    }
  }, [result, game, reviewBusy, onCommitted]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: SHELL.appBg, color: SHELL.text, display: 'flex', flexDirection: 'column', fontFamily: SHELL.fontUi }}>
      {/* ── 头 ── */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${SHELL.line}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: SHELL.violet }}>✨ AI 生成资产</span>
        <span style={{ fontSize: 12, color: SHELL.dim }}>文本 → 资产 → 待审区（人点入库才登记·带 provenance·可审计）</span>
        <button onClick={onClose} style={{ ...sBtn('quiet'), marginLeft: 'auto' }}>✕ 关闭</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', maxWidth: 720 }}>
        {/* ① 适配器 */}
        <div style={sLabel}>① 选生成方式</div>
        <div style={{ display: 'flex', gap: 10, margin: '8px 0 18px', flexWrap: 'wrap' }}>
          {ADAPTER_ORDER.map((a) => (
            <button
              key={a}
              onClick={() => setAdapter(a)}
              style={{
                ...sBtn(adapter === a ? 'primary' : 'ghost'),
                padding: '10px 16px', textAlign: 'left', lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600 }}>{ADAPTER_META[a].label}</div>
              <div style={{ fontSize: 11, color: SHELL.dim }}>{ADAPTER_META[a].hint}</div>
            </button>
          ))}
        </div>

        {/* key 状态（开放设置：env key 是否已配·打码不回明文） */}
        {active && (
          <div style={{ margin: '0 0 18px', fontSize: 12, color: SHELL.sub, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ ...sChip(active.keyConfigured), background: active.keyConfigured ? SHELL.okWash : SHELL.warnWash, color: active.keyConfigured ? SHELL.ok : SHELL.warn, border: `1px solid ${active.keyConfigured ? SHELL.jadeLine : SHELL.warnWash}` }}>
              {active.keyConfigured ? `● key 已配 ${active.apiKeyMasked}` : '○ 未配 key → 走 mock'}
            </span>
            <span style={{ color: SHELL.dim }}>
              设置 <code style={{ color: SHELL.violet }}>{active.envKey}</code> 环境变量启用真调（本环境 GitHub-only·默认 mock）· {active.license}
            </span>
          </div>
        )}

        {/* 当前适配器的生成选项（如 Seedream 模型版本）→ 下拉·改选即存本地（owner 2026-07-21） */}
        {activeOpts.map((o) => (
          <div key={o.envKey} style={{ margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: SHELL.sub }}>{o.label}</span>
            <select
              aria-label={o.label}
              value={optVals[o.envKey] ?? o.value}
              onChange={(e) => saveOption(o.envKey, e.target.value)}
              style={{ padding: '7px 10px', background: SHELL.bg2, color: SHELL.text, border: `1px solid ${SHELL.line}`, borderRadius: 6, fontSize: 12, outline: 'none', minWidth: 260 }}
            >
              {o.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {optSaved && <span style={{ fontSize: 11, color: SHELL.ok }}>✓ 已存</span>}
          </div>
        ))}

        {/* ② prompt */}
        <div style={sLabel}>② 描述你要的资产</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={(adapter === 'qwen' || adapter === 'seedream') ? '例：pixel fire sword icon, transparent background' : '例：a wooden treasure chest with iron bands'}
          rows={3}
          style={{ ...sInput(), width: '100%', margin: '8px 0 18px', resize: 'vertical', fontFamily: SHELL.fontMono }}
        />

        {/* ③ 落点 */}
        <div style={sLabel}>③ 落点（空=共享货架 assets/ai/；填游戏名=该游戏本地 art/ai/）</div>
        <input
          value={game}
          onChange={(e) => setGame(e.target.value.toLowerCase())}
          placeholder="共享货架（留空）· 或填 game-z / game-d …"
          style={{ ...sInput(), width: 280, margin: '8px 0 22px' }}
        />

        <div>
          <button onClick={generate} disabled={!prompt.trim() || busy} style={{ ...sBtn('primary'), padding: '9px 22px', opacity: !prompt.trim() || busy ? 0.5 : 1, cursor: !prompt.trim() || busy ? 'default' : 'pointer' }}>
            {busy ? '⏳ 生成中…' : '✨ 生成到待审区'}
          </button>
        </div>

        {/* ④ 结果 —— 人审门：生成落待审区 → 预览 → ✓ 入库 / ✕ 弃置 */}
        {result && (
          <div style={{ marginTop: 22, padding: 16, background: SHELL.bg1, border: `1px solid ${SHELL.line}`, borderRadius: 10 }}>
            {!(result.success && result.id) ? (
              <div style={{ fontSize: 13, color: SHELL.danger }}>✕ {result.error ?? '生成失败'}</div>
            ) : reviewed ? (
              // 审后态：入库成功 / 已弃置 / 审核失败
              <>
                <div style={{ fontSize: 14, color: reviewed.ok ? (reviewed.action === 'approve' ? SHELL.ok : SHELL.sub) : SHELL.danger, marginBottom: 10 }}>
                  {!reviewed.ok
                    ? `✕ 审核失败：${reviewed.error ?? ''}`
                    : reviewed.action === 'approve'
                      ? '✓ 已入库（已登记进资源库·带 provenance）'
                      : '🗑 已弃置（待审文件与清单项已删）'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setResult(null); setReviewed(null); setPrompt(''); }} style={sBtn('ghost')}>再生成一个</button>
                  {reviewed.ok && reviewed.action === 'approve' && (
                    <button onClick={onClose} style={sBtn('primary')}>回到资源库看它</button>
                  )}
                </div>
              </>
            ) : (
              // 待审态：预览 + 双按钮
              <>
                <div style={{ fontSize: 14, color: SHELL.violet, marginBottom: 8 }}>
                  🕒 已生成·待审 {result.mock ? '（mock 占位）' : ''}——人审门：点「入库」才登记
                </div>
                <div style={{ fontSize: 12, color: SHELL.sub, fontFamily: SHELL.fontMono, marginBottom: 4 }}>id: {result.id}</div>
                <div style={{ fontSize: 12, color: SHELL.dim, marginBottom: 12 }}>{result.type} · {result.scope}</div>
                {result.type === 'texture' && result.previewPath && (
                  <img
                    src={result.previewPath}
                    alt={result.id}
                    style={{ width: 128, height: 128, imageRendering: 'pixelated', border: `1px solid ${SHELL.line}`, borderRadius: 6, background: '#000' }}
                  />
                )}
                {result.type === 'mesh' && (
                  <div style={{ fontSize: 12, color: SHELL.sub }}>🧊 已生成 .glb 网格（待审·入库后在资源库网格类下可见·可 vendor 进游戏）</div>
                )}
                <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => review('approve')}
                    disabled={reviewBusy}
                    style={{ ...sBtn('primary'), opacity: reviewBusy ? 0.5 : 1, cursor: reviewBusy ? 'default' : 'pointer' }}
                  >
                    {reviewBusy ? '⏳…' : '✓ 入库'}
                  </button>
                  <button
                    onClick={() => review('reject')}
                    disabled={reviewBusy}
                    style={{ ...sBtn('ghost'), color: SHELL.danger, opacity: reviewBusy ? 0.5 : 1, cursor: reviewBusy ? 'default' : 'pointer' }}
                  >
                    ✕ 弃置
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
