import React, { useCallback, useEffect, useState } from 'react';
import { SHELL, sBtn, sBadge, sChecker } from '../ui/shell-theme.js';

// ═══════════════════════════════════════════════════════════════
//  待审区 —— AI 生成产物的人审门（M2.5·REQ-ART）。
//  列 /api/assets/pending（共享货架 + 各游戏本地聚合）→ 每项预览 + provenance →
//    ✓ 入库(approve·provenance 硬校验过才登记 index) / ✕ 弃置(reject·删文件)。
//  宪法「无自动入库」：这里是生成产物进资源库的**唯一门**。
//  API 走 apollo.py（CORS *）；预览图走相对 /assets|/games（vite 服务盘上待审文件）。
// ═══════════════════════════════════════════════════════════════

const API = 'http://localhost:4000';

interface Provenance {
  readonly generator?: string;
  readonly prompt?: string;
  readonly model?: string;
  readonly mock?: boolean;
  readonly generatedAt?: string;
}
export interface PendingItem {
  readonly id: string;
  readonly type: string;
  readonly description?: string;
  readonly previewPath?: string;
  readonly scope?: string; // 'shelf' | 'game:<g>'
  readonly license?: string;
  readonly provenance?: Provenance;
}

// provenance 四硬字段（model/prompt/date/license）缺失清单——本地预判，让用户知道 approve 会否被拒。
function missingProvenance(it: PendingItem): string[] {
  const p = it.provenance ?? {};
  const miss: string[] = [];
  if (!p.model) miss.push('model');
  if (!p.prompt) miss.push('prompt');
  if (!p.generatedAt) miss.push('date');
  if (!it.license) miss.push('license');
  return miss;
}

const rowKey = (it: PendingItem) => `${it.scope ?? ''}:${it.id}`;

export function AssetPendingReview({ onBack, onReviewed }: { onBack: () => void; onReviewed: () => void }) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/assets/pending`)
      .then((r) => r.json())
      .then((j) => setItems((j?.pending ?? []) as PendingItem[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const review = useCallback(async (it: PendingItem, action: 'approve' | 'reject') => {
    if (busyKey) return;
    setBusyKey(rowKey(it));
    const game = it.scope && it.scope.startsWith('game:') ? it.scope.slice(5) : undefined;
    try {
      const res = await fetch(`${API}/api/assets/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: it.id, action, game }),
      }).then((r) => r.json() as Promise<{ success?: boolean; error?: string }>);
      if (res.success) {
        setItems((xs) => xs.filter((x) => rowKey(x) !== rowKey(it)));
        setToast({ ok: true, msg: action === 'approve' ? `✓ 已入库 ${it.id}` : `🗑 已弃置 ${it.id}` });
        onReviewed(); // 父层：刷 index + 待审计数
      } else {
        setToast({ ok: false, msg: `✕ ${res.error ?? '审核失败'}` });
      }
    } catch (e) {
      setToast({ ok: false, msg: `✕ ${String(e)}` });
    } finally {
      setBusyKey(null);
      window.setTimeout(() => setToast(null), 3200);
    }
  }, [busyKey, onReviewed]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: SHELL.appBg, color: SHELL.text, display: 'flex', flexDirection: 'column', fontFamily: SHELL.fontUi }}>
      {/* ── 头 ── */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${SHELL.line}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: SHELL.violet }}>🕒 待审区</span>
        <span style={{ fontSize: 12, color: SHELL.dim }}>AI 生成产物在此人审——点「入库」才登记进资源库（人审门·带 provenance）</span>
        <span style={{ ...sBadge(items.length ? 'warn' : 'dim'), marginLeft: 4 }}>{items.length} 待审</span>
        <button onClick={load} style={{ ...sBtn('quiet'), marginLeft: 'auto' }}>↻ 刷新</button>
        <button onClick={onBack} style={sBtn('ghost')}>← 返回资源库</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ color: SHELL.dim, fontSize: 13 }}>加载待审区…</div>
        ) : items.length === 0 ? (
          <div style={{ color: SHELL.dim, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
            待审区空 —— 去「✨ AI 生成」产一个，它会先落在这里等你审。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860 }}>
            {items.map((it) => {
              const miss = missingProvenance(it);
              const p = it.provenance ?? {};
              const busy = busyKey === rowKey(it);
              return (
                <div key={rowKey(it)} style={{ display: 'flex', gap: 16, padding: 14, background: SHELL.bg1, border: `1px solid ${SHELL.line}`, borderRadius: 10 }}>
                  {/* 预览 */}
                  <div style={{ ...sChecker, width: 96, height: 96, flex: 'none', borderRadius: 8, border: `1px solid ${SHELL.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {it.type === 'texture' && it.previewPath ? (
                      <img src={it.previewPath} alt={it.id} style={{ maxWidth: '92%', maxHeight: '92%', imageRendering: 'pixelated' }} />
                    ) : (
                      <span style={{ fontSize: 34, opacity: 0.5 }}>{it.type === 'mesh' ? '🧊' : '❓'}</span>
                    )}
                  </div>
                  {/* 详情 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SHELL.fontMono, fontSize: 12, color: SHELL.jade, wordBreak: 'break-all', marginBottom: 3 }}>{it.id}</div>
                    <div style={{ fontSize: 11, color: SHELL.dim, marginBottom: 8 }}>
                      {it.type} · {it.scope === 'shelf' || !it.scope ? '共享货架' : it.scope}
                      {p.mock ? ' · mock 占位' : ''}
                    </div>
                    <div style={{ fontSize: 11, color: SHELL.sub, lineHeight: 1.6 }}>
                      <div><span style={{ color: SHELL.dim }}>prompt：</span>{p.prompt || <em style={{ color: SHELL.warn }}>缺</em>}</div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span><span style={{ color: SHELL.dim }}>model：</span>{p.model || <em style={{ color: SHELL.warn }}>缺</em>}</span>
                        <span><span style={{ color: SHELL.dim }}>date：</span>{p.generatedAt ? p.generatedAt.slice(0, 10) : <em style={{ color: SHELL.warn }}>缺</em>}</span>
                        <span><span style={{ color: SHELL.dim }}>license：</span>{it.license || <em style={{ color: SHELL.warn }}>缺</em>}</span>
                      </div>
                    </div>
                    {miss.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 11, color: SHELL.danger }}>
                        ⚠ provenance 缺 {miss.join('/')} —— 入库会被硬校验拒绝（宪法）；请弃置或修数据源重生成。
                      </div>
                    )}
                  </div>
                  {/* 双按钮 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', flex: 'none' }}>
                    <button
                      onClick={() => review(it, 'approve')}
                      disabled={busy || miss.length > 0}
                      title={miss.length > 0 ? 'provenance 不全，入库会被拒' : '登记进资源库'}
                      style={{ ...sBtn('primary'), opacity: busy || miss.length > 0 ? 0.45 : 1, cursor: busy || miss.length > 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {busy ? '⏳…' : '✓ 入库'}
                    </button>
                    <button
                      onClick={() => review(it, 'reject')}
                      disabled={busy}
                      style={{ ...sBtn('ghost'), color: SHELL.danger, opacity: busy ? 0.45 : 1, cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                    >
                      ✕ 弃置
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 轻提示 ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '9px 18px', borderRadius: 8, fontSize: 13, background: SHELL.bg2, border: `1px solid ${toast.ok ? SHELL.jadeLine : SHELL.danger}`, color: toast.ok ? SHELL.ok : SHELL.danger, boxShadow: SHELL.shadow }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
