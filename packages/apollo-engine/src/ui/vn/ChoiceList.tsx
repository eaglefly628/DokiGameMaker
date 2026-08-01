import React from 'react';
import type { GameTheme } from '../themes/theme.types.js';

// 通用选项列表（主题化）。接收**已过滤**的选项（条件门控在上游用 optionAvailable 做完），
// 点击回调把原始下标传回（onChoose(index)）。大圆角柔光按钮，hover 放大（spec）。
export interface ChoiceItem {
  text: string;
  index: number; // 在原始 options 数组里的下标（传给 DialogueChoose）
}
export interface ChoiceListProps {
  theme: GameTheme;
  options: ChoiceItem[];
  onChoose: (index: number) => void;
}

export function ChoiceList({ theme, options, onChoose }: ChoiceListProps): React.ReactElement {
  const t = theme.tokens;
  const b = theme.components.button;
  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((opt) => (
        <button
          key={opt.index}
          onClick={() => onChoose(opt.index)}
          onMouseEnter={(e) => (e.currentTarget.style.transform = `scale(${b.hoverScale})`)}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          style={{
            textAlign: 'left',
            padding: `${b.paddingY} ${b.paddingX}`,
            background: `${t.accent}1f`,
            color: t.text,
            border: `${t.borderWidth} solid ${t.accent}`,
            borderRadius: t.borderRadius,
            boxShadow: `0 2px 12px ${t.shadow}`,
            cursor: 'pointer',
            fontSize: t.fontSizeBase,
            fontFamily: t.fontFamily,
            transition: 'transform 0.12s ease-out',
          }}
        >
          {opt.text}
        </button>
      ))}
    </div>
  );
}
