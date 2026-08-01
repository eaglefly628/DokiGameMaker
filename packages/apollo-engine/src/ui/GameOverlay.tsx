import React from 'react';
import { useWorldVersion } from './hooks/use-engine.js';
import type { Engine } from '../runtime/engine.js';

interface GameOverlayProps {
  engine: Engine;
}

// Live overlay —— UI binding 读取 world 状态投影为界面，每 tick 刷新。
export function GameOverlay({ engine }: GameOverlayProps) {
  const version = useWorldVersion(engine);
  const entities = engine.world.getAllEntities();
  // 实时确定性指纹：与 lockstep 守卫同一套哈希。联机时两端这一串应逐 tick 相同。
  const hash = engine.hash();

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 10,
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
    }}>
      <div style={{
        marginTop: 12,
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 8,
        color: '#94a3b8',
        fontSize: 13,
        fontFamily: 'monospace',
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        <div>tick {version} · entities {entities.length} · hash <span style={{ color: '#38bdf8' }}>{hash}</span></div>
        <div style={{ color: '#64748b', fontSize: 12 }}>方向键 / WASD 移动白色方块</div>
      </div>
    </div>
  );
}
