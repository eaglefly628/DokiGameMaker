// 生产流程板面板（owner 2026-07-10「N 步拆分·每步 review·把工作流放进 UI 治 LLM 漂移」）——
// 八阶段看板：状态全部由服务端 scripts/game-pipeline.mjs 从工件推导（机器门证据带游戏内容指纹·
// 文件一动证据自动标过期），本面板零新真相，只展示 + 触发 gate（真跑机器门）+ signoff（人门落账）。
// S6 美术关的人门已内嵌美术平台逐行复核——本板只指路，不重复签。
import React, { useCallback, useEffect, useState } from 'react';
import { SHELL, sBtn, sInput, sLabel } from '../ui/shell-theme.js';

const API = 'http://localhost:4000';

interface Gatey { state: string; detail: string }
interface Stage { id: string; title: string; handbook: string; gate: string | null; machine: Gatey; review: Gatey; human: Gatey; status: 'ok' | 'warn' | 'fail' | 'dim'; outOfOrder?: { at?: string; by?: string; note?: string } | null }
interface Board { success?: boolean; error?: string; slug?: string; form?: string; concept?: { name?: string; pitch?: string }; stages?: Stage[]; next?: string | null }

const DOT: Record<Stage['status'], string> = { ok: SHELL.ok, warn: SHELL.warn, fail: SHELL.danger, dim: SHELL.faint };
// 门状态配色（复查门/评分卡·REQ-QC-UI）：ok=绿·fail=红·warn/stale=黄·其余(dim/未复查)=灰。
const gateColor = (st: string): string => st === 'ok' ? SHELL.ok : st === 'fail' ? SHELL.danger : (st === 'warn' || st === 'stale') ? SHELL.warn : SHELL.dim;
// 复查门紧凑标记字形（板行一眼看三门）。
const reviewGlyph = (st: string): string => st === 'ok' ? '复✓' : st === 'fail' ? '复✗' : st === 'dim' ? '复—' : '复⚠';

export function GamePipelinePanel({ slug, title, onBack, onOpenArt }: {
  slug: string;
  title?: string;
  onBack: () => void;
  onOpenArt?: () => void;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [by, setBy] = useState('owner');
  const [busy, setBusy] = useState<string | null>(null); // 正在跑的 gate 阶段 id
  const [msg, setMsg] = useState('');
  // S1 立项卡编辑（REQ-WORKSHOP C1：concept 从此有 UI 通道·随 board 预填）
  const [cName, setCName] = useState('');
  const [cPitch, setCPitch] = useState('');

  const load = useCallback(() => {
    fetch(`${API}/api/pipeline?slug=${encodeURIComponent(slug)}`).then((r) => r.json() as Promise<Board>)
      .then((b) => { setBoard(b); setCName(b.concept?.name ?? ''); setCPitch(b.concept?.pitch ?? ''); })
      .catch((e) => setBoard({ success: false, error: String(e) }));
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const saveConcept = useCallback(async () => {
    if (busy || (!cName.trim() && !cPitch.trim())) return;
    setBusy('S1');
    try {
      const r = await fetch(`${API}/api/pipeline/concept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, name: cName.trim(), pitch: cPitch.trim() }) }).then((x) => x.json() as Promise<{ success?: boolean; error?: string }>);
      setMsg(r.success ? '✓ 立项卡已落账' : `✕ ${r.error ?? '立项卡保存失败'}`);
    } catch (e) { setMsg(`✕ ${String(e)}`); }
    finally { setBusy(null); load(); }
  }, [busy, slug, cName, cPitch, load]);

  const doGate = useCallback(async (stage: string) => {
    if (busy) return;
    setBusy(stage); setMsg(stage === 'S8' ? '⏳ 终检=tsc+vitest+build 真跑（可能要几分钟）…' : '⏳ 机器门真跑中…');
    try {
      const r = await fetch(`${API}/api/pipeline/gate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, stage }) }).then((x) => x.json() as Promise<{ success?: boolean; summary?: string; error?: string }>);
      setMsg(r.success ? `✓ ${stage} 机器门过：${r.summary ?? ''}` : `✕ ${stage} 未过：${r.summary ?? r.error ?? ''}`);
    } catch (e) { setMsg(`✕ ${String(e)}`); }
    finally { setBusy(null); load(); }
  }, [busy, slug, load]);

  const doSignoff = useCallback(async (stage: string) => {
    if (busy || !note.trim()) return;
    setBusy(stage);
    try {
      const r = await fetch(`${API}/api/pipeline/signoff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, stage, note: note.trim(), by: by.trim() || 'owner' }) }).then((x) => x.json() as Promise<{ success?: boolean; error?: string }>);
      setMsg(r.success ? `✓ ${stage} 人门落账` : `✕ ${r.error ?? '签核失败'}`);
      if (r.success) setNote('');
    } catch (e) { setMsg(`✕ ${String(e)}`); }
    finally { setBusy(null); load(); }
  }, [busy, slug, note, by, load]);

  const stages = board?.stages ?? [];
  const selStage = stages.find((s) => s.id === sel) ?? null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: SHELL.appBg, color: SHELL.text, fontFamily: SHELL.fontUi, zIndex: 400, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${SHELL.line}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: SHELL.violet }}>🏭 生产流程板</span>
        <span style={{ fontSize: 13, color: SHELL.sub }}>{title || slug}{board?.form ? ` ·（${board.form}）` : ''}</span>
        <span style={{ fontSize: 11, color: SHELL.dim }}>每步三门：机器门（真跑·证据带内容指纹·文件一动自动过期）+ 复查门（另一 session 对抗性复核落账·S7=评分卡）+ 人门（owner 签）</span>
        <button onClick={load} style={{ ...sBtn('ghost'), marginLeft: 'auto' }} title="重新推导看板">↻</button>
        <button onClick={onBack} style={sBtn('ghost')}>← 返回</button>
      </div>
      {msg && <div style={{ padding: '6px 20px', fontSize: 12, color: msg.startsWith('✓') ? SHELL.ok : msg.startsWith('⏳') ? SHELL.warn : SHELL.danger, borderBottom: `1px solid ${SHELL.line}` }}>{msg}</div>}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {!board ? <div style={{ color: SHELL.dim }}>加载看板…</div>
            : board.success === false ? <div style={{ color: SHELL.danger, fontSize: 13 }}>✕ {board.error}</div>
              : (
                <>
                  {board.next
                    ? <div style={{ marginBottom: 14, fontSize: 13, color: SHELL.warn }}>→ 下一步：<b>{board.next}</b>——只做这一步，做完过机器门+人门再往前走（防 LLM 长流程漂移）。</div>
                    : <div style={{ marginBottom: 14, fontSize: 13, color: SHELL.ok }}>✔ 八关全绿——可推进发布 / 换皮量产。</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stages.map((s) => (
                      <div key={s.id} onClick={() => setSel(s.id)} style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: sel === s.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${sel === s.id ? SHELL.violet : board.next === s.id ? SHELL.warn : SHELL.line}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: DOT[s.status], flex: 'none' }} />
                        <span style={{ fontFamily: SHELL.fontMono, fontSize: 12, color: SHELL.jade, width: 26, flex: 'none' }}>{s.id}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, width: 72, flex: 'none' }}>{s.title}</span>
                        <span style={{ fontSize: 11, color: SHELL.sub, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${s.id === 'S7' ? '评分卡' : '机器门'}：${s.machine.detail}`}>{s.machine.detail}</span>
                        <span style={{ fontFamily: SHELL.fontMono, fontSize: 11, color: gateColor(s.review.state), flex: 'none', width: 40, textAlign: 'center' }} title={`复查门：${s.review.detail}`}>{reviewGlyph(s.review.state)}</span>
                        <span style={{ fontSize: 11, color: s.human.state === 'ok' ? SHELL.ok : SHELL.dim, flex: 'none', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.human.detail}>{s.human.detail}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
        </div>
        <div style={{ width: 330, flex: 'none', borderLeft: `1px solid ${SHELL.line}`, background: SHELL.bg1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selStage ? <div style={{ color: SHELL.dim, fontSize: 12, marginTop: 20, textAlign: 'center' }}>点左侧阶段行 → 跑机器门 / 人门签核</div> : (
            <>
              <div style={{ fontFamily: SHELL.fontMono, fontSize: 13, color: SHELL.jade }}>{selStage.id} {selStage.title}</div>
              <div style={{ fontSize: 11, color: SHELL.sub, lineHeight: 1.5 }}>📖 本步唯一必读手册：<span style={{ fontFamily: SHELL.fontMono, color: SHELL.text }}>{selStage.handbook}</span></div>
              <div style={{ fontSize: 11, color: selStage.id === 'S7' ? gateColor(selStage.machine.state) : SHELL.sub, lineHeight: 1.5 }}>{selStage.id === 'S7' ? '评分卡' : '机器门'}：{selStage.machine.detail}</div>
              <div style={{ fontSize: 11, color: gateColor(selStage.review.state), lineHeight: 1.5 }}>复查门：{selStage.review.detail}</div>
              <div style={{ fontSize: 11, color: SHELL.sub, lineHeight: 1.5 }}>人　门：{selStage.human.detail}</div>
              {selStage.outOfOrder && <div style={{ fontSize: 11, color: SHELL.warn, lineHeight: 1.5 }}>⚠ 乱序放行：{selStage.outOfOrder.by || '?'} @ {(selStage.outOfOrder.at || '').slice(0, 10)}{selStage.outOfOrder.note ? ' · ' + String(selStage.outOfOrder.note).slice(0, 60) : ''}</div>}
              {selStage.id === 'S1' && (
                <>
                  <div style={sLabel}>立项卡（机器门=名字+一句话玩法·创作台建库自动带）</div>
                  <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="游戏名" maxLength={80} style={sInput()} />
                  <textarea value={cPitch} onChange={(e) => setCPitch(e.target.value)} placeholder="一句话玩法（pitch）" rows={3} maxLength={300} style={{ ...sInput(), resize: 'vertical', fontFamily: 'inherit' }} />
                  <button onClick={saveConcept} disabled={!!busy || (!cName.trim() && !cPitch.trim())} style={{ ...sBtn('primary'), opacity: busy || (!cName.trim() && !cPitch.trim()) ? 0.5 : 1 }}>💾 保存立项卡</button>
                </>
              )}
              {selStage.gate && (
                <button onClick={() => doGate(selStage.id)} disabled={!!busy} style={{ ...sBtn('primary'), opacity: busy ? 0.5 : 1 }}>
                  {busy === selStage.id ? '⏳ 跑门中…' : `▶ 跑机器门（${selStage.gate}）`}
                </button>
              )}
              {selStage.id === 'S6' ? (
                onOpenArt && <button onClick={onOpenArt} style={sBtn('ghost')}>🎨 进美术平台完成本关（逐行复核=人门）</button>
              ) : (
                <>
                  <div style={sLabel}>人门签核（review 内容必填·落账进 pipeline.json）</div>
                  <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="签核人" style={sInput()} />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="review 了什么、结论是什么（S7 记评分卡得分；S8 记手册缺口回填/提单/无）" rows={4} style={{ ...sInput(), resize: 'vertical', fontFamily: 'inherit' }} />
                  <button onClick={() => doSignoff(selStage.id)} disabled={!!busy || !note.trim()} style={{ ...sBtn('primary'), opacity: busy || !note.trim() ? 0.5 : 1 }}>☑ 人门通过</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
