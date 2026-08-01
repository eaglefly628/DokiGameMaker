import React, { useState, useMemo, useCallback } from 'react';
import { groupByType, filterAssets, type StudioAsset, type StudioAssetStatus } from './assets-model.js';

// 资产透视面板（商业引擎风）：按类型分组(可收缩) + tag/文本搜索 + 双击定位用处。
// 纯展示，数据来自 assets-model；定位动作交给父级(onLocate，跳右侧数据树对应实体)。

const C = {
  border: 'rgba(255,255,255,0.08)',
  text: '#e2e8f0',
  dim: '#64748b',
  dim2: '#94a3b8',
  accent: '#38bdf8',
  purple: '#a78bfa',
  green: '#22c55e',
  amber: '#fbbf24',
  red: '#ef4444',
};

const STATUS: Record<StudioAssetStatus, { color: string; label: string }> = {
  filled: { color: C.green, label: '已填充' },
  tbf: { color: C.amber, label: 'TBF 待填充' },
  placeholder: { color: C.accent, label: '占位' },
  missing: { color: C.red, label: '缺失' },
};

const TYPE_LABEL: Record<string, string> = {
  texture: '贴图',
  background: '背景',
  character_portrait: '立绘',
  bgm: 'BGM',
  sound: '音效',
  material: '材料',
  garment: '服装',
  accessory: '配饰',
};
const typeLabel = (t: string): string => TYPE_LABEL[t] ?? t;

function Chip({ children, color = C.dim2, onClick, title }: {
  children: React.ReactNode; color?: string; onClick?: () => void; title?: string;
}) {
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        fontSize: 10,
        fontFamily: 'monospace',
        color,
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        padding: '1px 5px',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function AssetRow({ asset, onLocate }: { asset: StudioAsset; onLocate: (usedBy: string[]) => boolean }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[asset.status];
  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <div
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={() => {
          setOpen(true);
          onLocate(asset.usedBy);
        }}
        title="单击展开 · 双击定位到使用它的实体"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 8px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ color: st.color, fontSize: 10 }} title={st.label}>●</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.text }}>{asset.id}</span>
        {asset.name && asset.name !== asset.id && (
          <span style={{ fontSize: 11, color: C.dim2 }}>{asset.name}</span>
        )}
        <div style={{ flex: 1 }} />
        {asset.usedBy.length > 0 && (
          <span style={{ fontSize: 10, color: C.dim }} title={`被 ${asset.usedBy.length} 处引用`}>
            ⛓ {asset.usedBy.length}
          </span>
        )}
        <span style={{ color: C.dim, fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 8px 8px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {asset.description && (
            <div style={{ fontSize: 11, color: C.dim2, lineHeight: 1.5 }}>{asset.description}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: st.color }}>{st.label}</span>
            {asset.variants && asset.variants.length > 0 && (
              <>
                <span style={{ fontSize: 10, color: C.dim }}>· 差分</span>
                {asset.variants.map((v) => (
                  <Chip key={v} color={C.purple}>{v}</Chip>
                ))}
              </>
            )}
          </div>
          {asset.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {asset.tags.map((t, i) => (
                <Chip key={i}>#{t}</Chip>
              ))}
            </div>
          )}
          {asset.usedBy.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: C.dim }}>用于：</span>
              {asset.usedBy.map((u) => (
                <Chip key={u} color={C.accent} onClick={() => onLocate([u])} title="点击定位">
                  {u}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AssetBrowser({
  assets,
  onLocate,
}: {
  assets: StudioAsset[];
  onLocate: (usedBy: string[]) => boolean;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => filterAssets(assets, query), [assets, query]);
  const groups = useMemo(() => groupByType(filtered), [filtered]);
  const tbfCount = useMemo(() => assets.filter((a) => a.status === 'tbf').length, [assets]);

  const toggleGroup = useCallback((type: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.type));
  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.type)));
  }, [allCollapsed, groups]);

  return (
    <div>
      {/* 工具条：搜索 + 统计 + 全展开/收起 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索 id / 名称 / tag / 用处…"
          style={{
            flex: 1,
            minWidth: 160,
            background: 'rgba(0,0,0,0.35)',
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: 12,
            padding: '5px 8px',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: C.dim }}>
          {filtered.length}/{assets.length}
          {tbfCount > 0 && <span style={{ color: C.amber }}> · {tbfCount} 待填充</span>}
        </span>
        {groups.length > 0 && (
          <button
            onClick={toggleAll}
            style={{
              padding: '4px 10px',
              background: 'rgba(255,255,255,0.06)',
              color: C.dim2,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {allCollapsed ? '全部展开' : '全部收起'}
          </button>
        )}
      </div>

      {assets.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 11 }}>（此游戏数据未声明任何美术/音频资产）</div>
      ) : groups.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 11 }}>无匹配「{query}」的资产</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.map((g) => {
            // 搜索时强制展开，便于看到命中项。
            const isCollapsed = query.trim() === '' && collapsed.has(g.type);
            return (
              <div
                key={g.type}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}
              >
                <div
                  onClick={() => toggleGroup(g.type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <span style={{ color: C.dim, fontSize: 10 }}>{isCollapsed ? '▸' : '▾'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.purple }}>{typeLabel(g.type)}</span>
                  <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{g.type}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: C.dim }}>{g.assets.length}</span>
                </div>
                {!isCollapsed && (
                  <div>
                    {g.assets.map((a) => (
                      <AssetRow key={a.id} asset={a} onLocate={onLocate} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
