import React from 'react';
import type { GameTheme } from '../themes/theme.types.js';

// 通用对话框（主题化）：角色名牌（缎带标签）+ 打字机文本（CSS 原生换行，规避 R2）+ 继续指示 + 选项插槽。
// 打字进度由上游算好（typedText 为已显示的切片）；本组件纯演示，不持状态。
export interface DialogBoxProps {
  theme: GameTheme;
  speaker?: string; // 角色名（空则不显示名牌）
  typedText: string; // 已打字出的文本切片
  clickable?: boolean; // 点击是否推进（line 节点且打字完成时）
  onAdvance?: () => void;
  continueHint?: string; // 右下角提示（如 "▼ 点击继续" / "（完）"）
  children?: React.ReactNode; // 选项列表（ChoiceList）
}

export function DialogBox({ theme, speaker, typedText, clickable, onAdvance, continueHint, children }: DialogBoxProps): React.ReactElement {
  const t = theme.tokens;
  return (
    <div
      onClick={() => clickable && onAdvance?.()}
      style={{
        position: 'relative',
        minHeight: 130,
        padding: 18,
        paddingTop: speaker ? 26 : 18,
        background: t.bg,
        borderRadius: t.borderRadius,
        border: `${t.borderWidth} solid ${t.border}`,
        boxShadow: `0 4px 20px ${t.shadow}`,
        color: t.text,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      {speaker && (
        <div
          style={{
            position: 'absolute',
            top: -14,
            left: 18,
            padding: '4px 14px',
            background: t.accent,
            color: '#fff',
            borderRadius: 999,
            fontSize: t.fontSizeSm,
            fontWeight: 600,
            boxShadow: `0 2px 10px ${t.shadow}`,
          }}
        >
          {speaker}
        </div>
      )}
      <div style={{ fontSize: t.fontSizeLg, lineHeight: t.lineHeight, whiteSpace: 'pre-wrap' }}>{typedText}</div>
      {children}
      {continueHint && (
        <div style={{ position: 'absolute', right: 16, bottom: 10, fontSize: t.fontSizeSm, color: t.accentHover }}>{continueHint}</div>
      )}
    </div>
  );
}
