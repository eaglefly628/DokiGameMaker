import React, { useState } from 'react';
import type { IWorld } from '@engine/core/types.js';
import type { Resource, StringVar } from '@engine/protocol/components.js';
import { findByComponentId } from '@engine/core/query.js';
import { useWorldVersion } from '../hooks/use-engine.js';
import type { GameTheme } from '../themes/theme.types.js';
import type { GameShellProps, UILayout, UINode } from './types.js';

// ═══════════════════════════════════════════════════════════════
//  GameShell —— 通用「页面布局即数据」解释器（Stage 1）。读 UILayout 数据 → DOM 壳层：
//    · 容器(col/row/panel/tabs) 纯布局；
//    · stat/bar 绑 Resource（按 id 全局寻址，随世界版本号重渲）；
//    · button 点击 → input.enqueueAction(信号)（复用 R3 确定性输入接缝，注入 sim）。
//  主题=数据（GameTheme token），换皮只换 token。零游戏专属 React（dialogue/VNStage 的 chrome 版）。
// ═══════════════════════════════════════════════════════════════

// ── 纯绑定助手（可测；确定性：只读 Resource，无副作用）──
export function readResource(world: IWorld, id: string): Resource | undefined {
  const e = findByComponentId(world, 'Resource', 'id', id);
  return e ? world.getComponent<Resource>(e, 'Resource') : undefined;
}

// stat 文案 = icon + label + 当前值（资源缺失=0，不崩）。
export function statDisplay(world: IWorld, node: { bind: string; label?: string; icon?: string }): string {
  const r = readResource(world, node.bind);
  const v = r ? r.current : 0;
  return `${node.icon ?? ''}${node.label ? node.label + ' ' : ''}${v}`;
}

// bar 充满比例 = (current-min)/(max-min) 钳 [0,1]（资源缺失/退化=0）。
export function barFraction(world: IWorld, id: string): number {
  const r = readResource(world, id);
  if (!r || r.max <= r.min) return 0;
  const f = (r.current - r.min) / (r.max - r.min);
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// image src：静态 node.src（布局层字面 presentation，非 sim）原样用；否则 bind=StringVar → 取 value 当**资产 key**
// 经 resolve 成可绘制 src（sim 只持 key 保纯/确定；无 resolve 回落原值供测试/简单场景）。缺失=空串=不渲。
export function imageSrc(world: IWorld, node: { src?: string; bind?: string }, resolve?: (key: string) => string | undefined): string {
  if (node.src) return node.src;
  if (node.bind) {
    const e = findByComponentId(world, 'StringVar', 'id', node.bind);
    const sv = e ? world.getComponent<StringVar>(e, 'StringVar') : undefined;
    if (!sv) return '';
    return (resolve ? resolve(sv.value) : undefined) ?? sv.value;
  }
  return '';
}

// 收集布局里全部 按钮→信号 映射（可测：证明布局数据声明了正确的信号；与渲染解耦）。
export function collectButtons(node: UINode): Array<{ label: string; signal: string }> {
  switch (node.kind) {
    case 'button':
      return [{ label: node.label, signal: node.signal }];
    case 'col':
    case 'row':
    case 'panel':
    case 'draggable':
    case 'dropzone':
      return node.children.flatMap(collectButtons);
    case 'tabs':
      return node.tabs.flatMap((t) => collectButtons(t.content));
    default:
      return [];
  }
}

// 收集布局里的拖放声明（dropzone 信号 + draggable dragId）：证布局声明正确、与渲染解耦（同 collectButtons）。
export function collectDropTargets(node: UINode): { zones: string[]; drags: string[] } {
  const zones: string[] = [];
  const drags: string[] = [];
  const walk = (n: UINode): void => {
    if (n.kind === 'dropzone') zones.push(n.signal);
    if (n.kind === 'draggable') drags.push(n.dragId);
    if (n.kind === 'col' || n.kind === 'row' || n.kind === 'panel' || n.kind === 'draggable' || n.kind === 'dropzone') n.children.forEach(walk);
    else if (n.kind === 'tabs') n.tabs.forEach((t) => walk(t.content));
  };
  walk(node);
  return { zones, drags };
}

const FONT_SIZE = { sm: 11, md: 14, lg: 22 } as const;
const barTone = (t: GameTheme, tone?: string): string =>
  tone === 'mp' ? t.tokens.info : tone === 'xp' || tone === 'accent' ? t.tokens.accent : t.tokens.success;

export function GameShell({ engine, layout, theme, input, resolveAsset }: GameShellProps): React.ReactElement {
  useWorldVersion(engine); // 世界变 → 重渲（stat/bar 投影最新值）
  const world = engine.world;
  const t = theme.tokens;
  const [tab, setTab] = useState(0);
  const dragRef = React.useRef<string | null>(null); // 当前被拖元素 dragId（dragstart 记 / drop 取，同 shell 内拖放）

  const render = (node: UINode, key?: React.Key): React.ReactNode => {
    switch (node.kind) {
      case 'col':
      case 'row':
        return (
          <div key={key} style={{ display: 'flex', flexDirection: node.kind === 'col' ? 'column' : 'row', gap: node.gap ?? 8, alignItems: node.kind === 'row' ? 'center' : 'stretch' }}>
            {node.children.map((c, i) => render(c, i))}
          </div>
        );
      case 'panel':
        return (
          <div key={key} data-anchor={node.anchor} style={{ border: `${t.borderWidth} solid ${t.border}`, borderRadius: t.borderRadius, background: t.bgSecondary, padding: t.spacing }}>
            {node.title && <div style={{ color: t.accent, fontWeight: 700, marginBottom: 6 }}>{node.title}</div>}
            {node.children.map((c, i) => render(c, i))}
          </div>
        );
      case 'tabs':
        return (
          <div key={key}>
            <div style={{ display: 'flex', gap: 6 }}>
              {node.tabs.map((tb, i) => (
                <button key={i} onClick={() => setTab(i)} style={{ padding: '6px 16px', borderRadius: 999, border: `1px solid ${t.border}`, background: i === tab ? t.accent : 'transparent', color: i === tab ? '#fff' : t.text, cursor: 'pointer' }}>
                  {tb.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>{node.tabs[tab] && render(node.tabs[tab].content)}</div>
          </div>
        );
      case 'text':
        return (
          <div key={key} style={{ fontSize: FONT_SIZE[node.size ?? 'md'], color: node.tone === 'dim' ? t.textSecondary : node.tone === 'accent' ? t.accent : t.text }}>
            {node.text}
          </div>
        );
      case 'stat':
        return (
          <div key={key} style={{ fontSize: 13, color: t.text, fontFamily: t.fontFamily }}>
            {statDisplay(world, node)}
          </div>
        );
      case 'bar': {
        const f = barFraction(world, node.bind);
        return (
          <div key={key} style={{ height: 8, minWidth: 60, background: t.border, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(f * 100)}%`, height: '100%', background: barTone(theme, node.tone) }} />
          </div>
        );
      }
      case 'image': {
        const src = imageSrc(world, node, resolveAsset);
        if (!src) return null; // 无 src（绑定缺失）→ 不渲，避免破图
        return <img key={key} src={src} alt={node.alt ?? ''} width={node.width} height={node.height} style={{ objectFit: 'contain', borderRadius: t.borderRadius }} />;
      }
      case 'button':
        return (
          <button key={key} data-anchor={node.anchor} onClick={() => input?.enqueueAction(node.signal)} style={{ padding: '8px 18px', borderRadius: t.borderRadius, border: node.primary ? 'none' : `1px solid ${t.border}`, background: node.primary ? t.accent : t.bg, color: node.primary ? '#fff' : t.text, cursor: 'pointer' }}>
            {node.label}
          </button>
        );
      case 'draggable':
        return (
          <div key={key} draggable
            onDragStart={(e) => { dragRef.current = node.dragId; e.dataTransfer?.setData('text/plain', node.dragId); }}
            onDragEnd={() => { dragRef.current = null; }}
            style={{ cursor: 'grab' }}>
            {node.children.map((c, i) => render(c, i))}
          </div>
        );
      case 'dropzone':
        return (
          <div key={key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const d = dragRef.current ?? (e.dataTransfer?.getData('text/plain') || null);
              if (d) input?.enqueueAction(node.signal, { drag: d }); // 落点 → 信号 + 被拖 dragId（守红线：事件=信号名）
              dragRef.current = null;
            }}>
            {node.children.map((c, i) => render(c, i))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.fontFamily, padding: t.spacing }}>
      {render(layout.root)}
    </div>
  );
}

export type { UILayout, UINode, GameShellProps } from './types.js';
