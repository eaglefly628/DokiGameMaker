import React, { useState, useEffect, useCallback } from 'react';
import { SHELL } from '../ui/shell-theme.js';

// ═══════════════════════════════════════════════════════════════
//  创作台 v1 · M3 设置面板（BYO key）——顶栏状态灯点开
//   provider 列表（千问第一·anthropic/deepseek/openai 兼容随后·ollama 本地免 key·mock 仅测试）：
//   每项可填 API key + 选 model + 「测试连接」。存储走 GET/PUT /api/settings（→ 仓库根
//   .apollo-config.json·已 gitignore）；GET 回**打码** key（前3位***尾4位，绝不回原文），
//   PUT 只在用户改动该项才送 apiKey（未改动=不覆盖）。测试连接 → POST /api/settings/test。
//   本组件是创作台产品壳（非游戏 UI），沿用 M0-M2 既有 React 壳层风格（SHELL 令牌），不走 LayoutNode。
// ═══════════════════════════════════════════════════════════════

const PANEL_W = 'min(560px, 94vw)';

// 右滑进场关键帧（幂等·全局单例）。prefers-reduced-motion 下瞬现。
function ensureSettingsKeyframes(): void {
  if (typeof document === 'undefined') return;
  const id = 'apollo-settings-kf';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
    @keyframes apollo-settings-slidein { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes apollo-settings-spin { to { transform: rotate(360deg); } }
    .apollo-settings-panel { animation: apollo-settings-slidein 0.24s cubic-bezier(0.22,0.61,0.36,1); }
    @media (prefers-reduced-motion: reduce) { .apollo-settings-panel { animation: none; } }
  `;
  document.head.appendChild(s);
}

/** GET /api/settings 的 provider 项（apollo.py `_settings_view`）。apiKeyMasked 打码回显，绝无原文。 */
export interface SettingsProvider {
  id: string;
  name: string;
  models: string[];
  model: string | null;
  isLocal: boolean;
  envKey: string;
  apiKeyMasked: string;
  hasConfigKey: boolean;
  keyAvailable: boolean;
}
export interface SettingsGenKey {
  envKey: string;
  apiKeyMasked: string;
  hasConfigKey: boolean;
  keyAvailable: boolean;
}
export interface SettingsGenOption {
  envKey: string;
  label: string;
  forKey?: string | null; // 归属哪个生成 key（UI 把下拉排在该 key 行下方）
  choices: { value: string; label: string }[];
  value: string; // 当前生效值
  default: string;
}
export interface SettingsView {
  providers: SettingsProvider[];
  default?: string | null;
  genKeys?: SettingsGenKey[];
  genOptions?: SettingsGenOption[];
}

type TestState = { k: 'idle' } | { k: 'testing' } | { k: 'ok' } | { k: 'fail'; error: string };

export function SettingsPanel({ api, onClose, onSaved }: {
  api: string;
  onClose: () => void;
  /** 保存成功 → 通知上层重拉 providers（状态灯随 config key 变化更新）。 */
  onSaved?: () => void;
}) {
  useEffect(ensureSettingsKeyframes, []);

  const [view, setView] = useState<SettingsView | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({}); // 用户新填的明文（仅 dirty 时送后端）
  const [keyDirty, setKeyDirty] = useState<Record<string, boolean>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [defaultId, setDefaultId] = useState<string | undefined>(undefined);
  const [test, setTest] = useState<Record<string, TestState>>({});
  const [genInputs, setGenInputs] = useState<Record<string, string>>({}); // 美术生成 key（DASHSCOPE/TRIPO/MESHY）新填明文
  const [genDirty, setGenDirty] = useState<Record<string, boolean>>({});
  const [genOpts, setGenOpts] = useState<Record<string, string>>({}); // 生成选项当前选值（如 Seedream 模型版本）
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0); // 保存成功一闪提示

  const applyView = useCallback((v: SettingsView) => {
    setView(v);
    setModels(Object.fromEntries(v.providers.map((p) => [p.id, p.model ?? (p.models[0] ?? '')])));
    setDefaultId(v.default ?? undefined);
    setKeyInputs({});
    setKeyDirty({});
    setGenInputs({});
    setGenDirty({});
    setGenOpts(Object.fromEntries((v.genOptions ?? []).map((o) => [o.envKey, o.value])));
  }, []);

  useEffect(() => {
    let dead = false;
    fetch(`${api}/api/settings`)
      .then((r) => r.json())
      .then((v: SettingsView) => { if (!dead && v && Array.isArray(v.providers)) applyView(v); })
      .catch(() => { if (!dead) setView({ providers: [] }); });
    return () => { dead = true; };
  }, [api, applyView]);

  // 组装 PUT 载荷：apiKey 仅 dirty 项送（未改动=不覆盖）；model 随选随送；带 default。
  const buildPayload = useCallback(() => {
    const providers: Record<string, { apiKey?: string; model?: string }> = {};
    for (const p of view?.providers ?? []) {
      const patch: { apiKey?: string; model?: string } = {};
      if (keyDirty[p.id]) patch.apiKey = keyInputs[p.id] ?? '';
      if (models[p.id]) patch.model = models[p.id];
      if (Object.keys(patch).length) providers[p.id] = patch;
    }
    const genKeys: Record<string, string> = {};
    for (const g of view?.genKeys ?? []) if (genDirty[g.envKey]) genKeys[g.envKey] = genInputs[g.envKey] ?? '';
    const genOptions: Record<string, string> = {};
    for (const o of view?.genOptions ?? []) if (genOpts[o.envKey]) genOptions[o.envKey] = genOpts[o.envKey]!;
    return {
      providers, default: defaultId,
      ...(Object.keys(genKeys).length ? { genKeys } : {}),
      ...(Object.keys(genOptions).length ? { genOptions } : {}),
    };
  }, [view, keyDirty, keyInputs, models, defaultId, genDirty, genInputs, genOpts]);

  const persist = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch(`${api}/api/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const v: SettingsView & { success?: boolean; error?: string } = await res.json();
      if (v && Array.isArray(v.providers)) applyView(v);
      setSaving(false);
      return true;
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
      return false;
    }
  }, [api, buildPayload, applyView]);

  const save = useCallback(async () => {
    const ok = await persist();
    if (ok) { setSavedTick((t) => t + 1); onSaved?.(); }
  }, [persist, onSaved]);

  // 测试连接：先落盘该面板当前编辑（key/model 生效），再对该 provider 发探活请求（用当前生效配置）。
  const testConnection = useCallback(async (id: string) => {
    setTest((t) => ({ ...t, [id]: { k: 'testing' } }));
    const ok = await persist();
    if (ok) onSaved?.();
    try {
      const res = await fetch(`${api}/api/settings/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: id }),
      });
      const d: { ok: boolean; error?: string } = await res.json();
      setTest((t) => ({ ...t, [id]: d.ok ? { k: 'ok' } : { k: 'fail', error: d.error ?? '连接失败' } }));
    } catch (e: unknown) {
      setTest((t) => ({ ...t, [id]: { k: 'fail', error: e instanceof Error ? e.message : String(e) } }));
    }
  }, [api, persist, onSaved]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,12,0.6)', display: 'flex', justifyContent: 'flex-end', zIndex: 320 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="apollo-settings-panel"
        style={{
          width: PANEL_W, height: '100%', overflowY: 'auto',
          background: SHELL.bg1, borderLeft: `1px solid ${SHELL.lineStrong}`,
          boxShadow: '-16px 0 48px rgba(0,0,0,0.5)', padding: '22px 24px',
          fontFamily: SHELL.fontUi, color: SHELL.text,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {/* 头 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.6 }}>⚙ AI 设置</span>
          <button onClick={onClose} aria-label="关闭" style={{ background: 'none', border: 'none', color: SHELL.dim, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: SHELL.sub, lineHeight: 1.6 }}>
          填入你自己的 API Key（自带 key·BYO）。key 只存本机（<code style={{ color: SHELL.dim }}>.apollo-config.json</code>），
          绝不上传、绝不入库；回显一律打码。
        </div>

        {view === null ? (
          <div style={{ color: SHELL.dim, fontSize: 13, padding: '20px 0' }}>加载设置…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {view.providers.map((p) => {
              const ts = test[p.id] ?? { k: 'idle' as const };
              const isDefault = defaultId === p.id;
              return (
                <div key={p.id} className="apollo-settings-row" data-provider={p.id} style={{
                  padding: '12px 14px', background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isDefault ? SHELL.jadeLine : SHELL.line}`, borderRadius: 10,
                  display: 'flex', flexDirection: 'column', gap: 9,
                }}>
                  {/* 行头：名 + 状态徽标 + 设为默认 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: SHELL.text }}>{p.name}</span>
                    {p.isLocal && <span style={badge(SHELL.violet, SHELL.violetWash)}>本地 · 免 key</span>}
                    {!p.isLocal && p.keyAvailable && <span style={badge(SHELL.ok, SHELL.okWash)}>已配置</span>}
                    {!p.isLocal && !p.keyAvailable && <span style={badge(SHELL.warn, SHELL.warnWash)}>未配置</span>}
                    <span style={{ flex: 1 }} />
                    <button
                      onClick={() => setDefaultId(isDefault ? undefined : p.id)}
                      title="设为默认 provider"
                      style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', outline: 'none',
                        background: isDefault ? SHELL.jadeWash : 'transparent',
                        color: isDefault ? SHELL.jade : SHELL.dim,
                        border: `1px solid ${isDefault ? SHELL.jadeLine : SHELL.line}`, fontFamily: SHELL.fontUi,
                      }}
                    >
                      {isDefault ? '★ 默认' : '设为默认'}
                    </button>
                  </div>

                  {/* API key 输入（本地 provider 免 key，不显示） */}
                  {!p.isLocal && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={fieldLabel}>API Key</span>
                      <input
                        type="password"
                        aria-label={`${p.name} API Key`}
                        value={keyInputs[p.id] ?? ''}
                        placeholder={p.apiKeyMasked ? `已存：${p.apiKeyMasked}（留空=不改）` : '粘贴你的 API Key'}
                        onChange={(e) => {
                          const v = e.target.value;
                          setKeyInputs((m) => ({ ...m, [p.id]: v }));
                          setKeyDirty((m) => ({ ...m, [p.id]: true }));
                          setTest((t) => ({ ...t, [p.id]: { k: 'idle' } }));
                        }}
                        style={inputStyle}
                      />
                    </label>
                  )}

                  {/* model 下拉 + 测试连接 */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <span style={fieldLabel}>模型</span>
                      <select
                        aria-label={`${p.name} 模型`}
                        value={models[p.id] ?? ''}
                        onChange={(e) => setModels((m) => ({ ...m, [p.id]: e.target.value }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        {p.models.length === 0 && <option value="">（无可选模型）</option>}
                        {p.models.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
                      </select>
                    </label>
                    <button
                      onClick={() => testConnection(p.id)}
                      disabled={ts.k === 'testing'}
                      style={{
                        ...secondaryBtn,
                        opacity: ts.k === 'testing' ? 0.6 : 1,
                        cursor: ts.k === 'testing' ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ts.k === 'testing'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner /> 测试中…</span>
                        : '测试连接'}
                    </button>
                  </div>

                  {/* 测试结果 */}
                  {ts.k === 'ok' && <div style={{ fontSize: 12, color: SHELL.ok }}>✓ 连接成功</div>}
                  {ts.k === 'fail' && <div style={{ fontSize: 12, color: SHELL.danger, lineHeight: 1.5 }}>✕ {ts.error}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* 美术生成 key（R1 ②c·文生图/文生3D·与 LLM 聊天 key 分开）：保存后由服务端注入生成子进程 env。 */}
        {view !== null && (view.genKeys?.length ?? 0) > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: SHELL.violet, marginBottom: 4 }}>🎨 美术生成 API Key</div>
            <div style={{ fontSize: 11.5, color: SHELL.dim, lineHeight: 1.6, marginBottom: 8 }}>
              万相文生图（DASHSCOPE·千问聊天 key 可复用不必重填）/ Tripo / Meshy 文生 3D / Seedream（字节火山方舟·
              key 下方可选模型版本 4.0/4.5/5.0）。没配 key 时生成自动走 mock 占位并附探针说明，绝不静默顶替。
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(view.genKeys ?? []).map((g) => (
                <React.Fragment key={g.envKey}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${SHELL.line}`, borderRadius: 8 }}>
                    <code style={{ fontSize: 11, color: SHELL.sub, minWidth: 160 }}>{g.envKey}</code>
                    <input
                      type="password"
                      value={genInputs[g.envKey] ?? ''}
                      onChange={(e) => { setGenInputs((m) => ({ ...m, [g.envKey]: e.target.value })); setGenDirty((m) => ({ ...m, [g.envKey]: true })); }}
                      placeholder={g.apiKeyMasked ? `已存：${g.apiKeyMasked}（留空=不改）` : (g.keyAvailable ? '已由环境/千问 key 提供（可覆盖）' : '粘贴 API Key')}
                      style={{ flex: 1, padding: '7px 10px', background: SHELL.bg2, color: SHELL.text, border: `1px solid ${SHELL.line}`, borderRadius: 6, fontSize: 12, outline: 'none' }}
                    />
                    <span style={{ fontSize: 11, color: g.keyAvailable ? SHELL.ok : SHELL.dim }}>{g.keyAvailable ? '● 可用' : '○ 未配'}</span>
                  </div>
                  {/* 该 key 关联的生成选项（如 Seedream 模型版本）→ 下拉排在 key 行正下方（owner 2026-07-21） */}
                  {(view.genOptions ?? []).filter((o) => o.forKey === g.envKey).map((o) => (
                    <label key={o.envKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 24px' }}>
                      <span style={{ fontSize: 11.5, color: SHELL.sub, minWidth: 148 }}>{o.label}</span>
                      <select
                        aria-label={o.label}
                        value={genOpts[o.envKey] ?? o.value}
                        onChange={(e) => setGenOpts((m) => ({ ...m, [o.envKey]: e.target.value }))}
                        style={{ flex: 1, padding: '6px 10px', background: SHELL.bg2, color: SHELL.text, border: `1px solid ${SHELL.line}`, borderRadius: 6, fontSize: 12, outline: 'none' }}
                      >
                        {o.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </label>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* 底部：保存 */}
        {view !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? '保存中…' : '保存设置'}
            </button>
            {saveErr && <span style={{ fontSize: 12, color: SHELL.danger }}>保存失败：{saveErr}</span>}
            {!saveErr && savedTick > 0 && !saving && <span style={{ fontSize: 12, color: SHELL.ok }}>✓ 已保存</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function badge(color: string, wash: string): React.CSSProperties {
  return {
    fontSize: 11, padding: '2px 8px', borderRadius: 999,
    background: wash, color, border: `1px solid ${color}44`, fontWeight: 600,
  };
}

function Spinner() {
  return (
    <span style={{
      width: 12, height: 12, borderRadius: '50%',
      border: `2px solid ${SHELL.line}`, borderTopColor: SHELL.jade,
      display: 'inline-block', animation: 'apollo-settings-spin 0.8s linear infinite',
    }} />
  );
}

const fieldLabel: React.CSSProperties = { fontSize: 11, color: SHELL.dim, letterSpacing: 0.5 };

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', boxSizing: 'border-box',
  background: SHELL.bg0, color: SHELL.text,
  border: `1px solid ${SHELL.line}`, borderRadius: 8,
  fontSize: 13, outline: 'none', fontFamily: SHELL.fontUi,
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 22px', borderRadius: 9, border: 'none',
  background: `linear-gradient(135deg, ${SHELL.jade}, ${SHELL.jade}cc)`,
  color: '#0f172a', fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
  cursor: 'pointer', outline: 'none', fontFamily: SHELL.fontUi,
};

const secondaryBtn: React.CSSProperties = {
  padding: '9px 14px', borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${SHELL.line}`,
  color: SHELL.sub, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', outline: 'none', fontFamily: SHELL.fontUi,
};
