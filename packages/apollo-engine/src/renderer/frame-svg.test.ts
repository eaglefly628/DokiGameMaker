import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { frameSvg } from './frame-svg.js';
import type { Transform, Shape, Color, Text } from '@engine/protocol/components.js';

function demoWorld(): World {
  const w = new World();
  w.createEntity('box');
  w.addComponent('box', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('box', { type: 'Shape', kind: 'box', width: 8, height: 8 } as Shape);
  w.addComponent('box', { type: 'Color', tint: 0xff0000, alpha: 1 } as Color);
  w.createEntity('lbl');
  w.addComponent('lbl', { type: 'Transform', x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('lbl', { type: 'Text', content: '关羽<x>', fontSize: 12, fontFamily: 'sans', anchor: 'center' } as Text);
  return w;
}

describe('frame-svg · 世界 → SVG 一帧（无头截图）', () => {
  it('含 svg 根 / box rect(势力色) / text / 标题', () => {
    const svg = frameSvg(demoWorld(), { title: 'T' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('fill="#ff0000"'); // box 取 Color.tint
    expect(svg).toContain('关羽'); // 文本
    expect(svg).toContain('&lt;x&gt;'); // XML 转义
    expect(svg).toContain('>T<'); // 标题
  });

  it('确定性：同世界两次渲染逐字符一致', () => {
    expect(frameSvg(demoWorld())).toBe(frameSvg(demoWorld()));
  });

  it('坐标取 2 位小数（吸收跨端浮点漂移）', () => {
    const w = new World();
    w.createEntity('c');
    w.addComponent('c', { type: 'Transform', x: 1.23456789, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('c', { type: 'Shape', kind: 'circle', radius: 2 } as Shape);
    expect(frameSvg(w)).toContain('cx="1.23"');
  });
});
