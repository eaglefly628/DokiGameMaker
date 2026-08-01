import React from 'react';
import type { Resource, Flag } from '@engine/protocol/components.js';
import type { Engine } from '../../runtime/engine.js';
import type { GameTheme } from '../themes/theme.types.js';
import { useComponent } from '../hooks/use-component.js';
import type { VNStatBinding, VNFlagBinding } from './types.js';

// 通用属性面板（主题化）：一组资源进度条 + 指示灯。布局中立（不自带定位），由调用方放置。
// A/B/C 共用：任何要展示「Resource 当前值/上限 + Flag 状态」的 HUD 都可用。

function StatRow({ engine, theme, stat }: { engine: Engine; theme: GameTheme; stat: VNStatBinding }) {
  const r = useComponent<Resource>(engine, stat.id, 'Resource');
  const t = theme.tokens;
  const hb = theme.components.healthBar;
  const pct = r && r.max > 0 ? Math.max(0, Math.min(100, (r.current / r.max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: t.fontSizeSm, color: t.textSecondary }}>
        <span>{stat.label}</span>
        <span>{r?.current ?? 0}</span>
      </div>
      <div style={{ height: hb.height, background: hb.depletedColor, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: hb.fillColor, transition: `width ${hb.animationDuration} ease-out` }} />
      </div>
    </div>
  );
}

function FlagRow({ engine, theme, flag }: { engine: Engine; theme: GameTheme; flag: VNFlagBinding }) {
  const f = useComponent<Flag>(engine, flag.id, 'Flag');
  const active = f?.active ?? false;
  const label = active ? flag.activeLabel : flag.inactiveLabel;
  if (!label) return null;
  return <div style={{ marginTop: 6, fontSize: theme.tokens.fontSizeSm, color: active ? theme.tokens.success : theme.tokens.textSecondary }}>{label}</div>;
}

export interface StatPanelProps {
  engine: Engine;
  theme: GameTheme;
  title?: string;
  stats: VNStatBinding[];
  flags?: VNFlagBinding[];
}

export function StatPanel({ engine, theme, title, stats, flags }: StatPanelProps): React.ReactElement {
  const t = theme.tokens;
  const p = theme.components.panel;
  return (
    <div style={{ width: p.maxWidth, padding: p.padding, background: t.bgSecondary, borderRadius: t.borderRadius, boxShadow: `0 4px 20px ${t.shadow}`, color: t.text }}>
      {title && <div style={{ marginBottom: 8, color: t.accent, fontSize: t.fontSizeSm, fontWeight: 600 }}>{title}</div>}
      {stats.map((s) => (
        <StatRow key={s.id} engine={engine} theme={theme} stat={s} />
      ))}
      {flags?.map((f) => (
        <FlagRow key={f.id} engine={engine} theme={theme} flag={f} />
      ))}
    </div>
  );
}
