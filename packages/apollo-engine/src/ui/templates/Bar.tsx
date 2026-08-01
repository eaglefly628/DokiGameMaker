import React from 'react';

interface BarProps {
  current: number;
  max: number;
  color: string;
  label?: string;
}

export function Bar({ current, max, color, label }: BarProps) {
  const percentage = max > 0 ? (current / max) * 100 : 0;

  return (
    <div style={{
      width: '100%',
      pointerEvents: 'auto',
    }}>
      {label && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 14,
          color: '#e2e8f0',
          fontWeight: 600,
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}>
          <span>{label}</span>
          <span>{current} / {max}</span>
        </div>
      )}
      <div style={{
        width: '100%',
        height: 20,
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          background: color,
          borderRadius: 10,
          transition: 'width 0.15s ease-out, background-color 0.3s ease',
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
    </div>
  );
}
