import React from 'react';
import type { GameTheme } from '../themes/theme.types.js';

// 通用立绘槽（主题化占位）。真贴图走资产流程（R9）后，这里换成 <img>/atlas frame；
// 当前渲染一个带情绪标签的占位框。布局中立，由调用方定位（VN 一般放画面左/右下）。
export interface PortraitSlotProps {
  theme: GameTheme;
  label?: string; // 槽位文案（如"立绘占位"）
  emotion?: string; // 当前表情（line/choice 节点的 emotion）
  width?: number;
  height?: number;
}

export function PortraitSlot({ theme, label = '立绘', emotion = 'neutral', width = 180, height = 290 }: PortraitSlotProps): React.ReactElement {
  const t = theme.tokens;
  return (
    <div
      style={{
        width,
        height,
        background: `${t.accent}1f`,
        border: `2px solid ${t.accent}`,
        borderRadius: t.borderRadius,
        boxShadow: `0 4px 20px ${t.shadow}`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 8,
        fontSize: t.fontSizeSm,
        color: t.accent,
      }}
    >
      {label} · {emotion}
    </div>
  );
}
