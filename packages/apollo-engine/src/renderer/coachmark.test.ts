import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Coachmark, Flag } from '@engine/protocol/components.js';
import { collectActiveCoachmarks, coachmarkGeometry, coachmarkSvg } from './coachmark.js';

const mark = (o: Partial<Coachmark>): Coachmark => ({ type: 'Coachmark', anchor: 'a', text: 't', ...o });

describe('coachmark — collectActiveCoachmarks（visibleWhen Flag 门控）', () => {
  it('无 visibleWhen → 总显示；visibleWhen Flag active → 显示，inactive → 隐藏', () => {
    const w = new World();
    w.createEntity('m1'); w.addComponent('m1', mark({ anchor: 'always' }));
    w.createEntity('m2'); w.addComponent('m2', mark({ anchor: 'on', visibleWhen: 'step1' }));
    w.createEntity('m3'); w.addComponent('m3', mark({ anchor: 'off', visibleWhen: 'step2' }));
    w.createEntity('f1'); w.addComponent('f1', { type: 'Flag', id: 'step1', active: true } as Flag);
    w.createEntity('f2'); w.addComponent('f2', { type: 'Flag', id: 'step2', active: false } as Flag);
    expect(collectActiveCoachmarks(w).map((m) => m.anchor).sort()).toEqual(['always', 'on']);
  });
  it('visibleWhen 引用不存在的 Flag → 隐藏（fail-closed）', () => {
    const w = new World();
    w.createEntity('m'); w.addComponent('m', mark({ visibleWhen: 'ghost' }));
    expect(collectActiveCoachmarks(w)).toHaveLength(0);
  });
});

describe('coachmark — coachmarkGeometry（纯几何，node 可测）', () => {
  const vp = { w: 1000, h: 800 };
  it('rect 镂空按 pad 外扩；auto 下方空间大 → 气泡在下方', () => {
    const g = coachmarkGeometry({ x: 400, y: 100, w: 80, h: 40 }, vp, { pad: 8 });
    expect(g.cutout).toMatchObject({ x: 392, y: 92, w: 96, h: 56, shape: 'rect' });
    expect(g.placement).toBe('bottom');
    expect(g.bubble.y).toBeGreaterThan(g.cutout.y + g.cutout.h); // 气泡在镂空下方
  });
  it('auto 锚点靠下 → 气泡在上方', () => {
    expect(coachmarkGeometry({ x: 400, y: 700, w: 80, h: 40 }, vp, {}).placement).toBe('top');
  });
  it('circle 形 → r=max(边)/2+pad；left 出界气泡夹回视口', () => {
    const g = coachmarkGeometry({ x: 10, y: 10, w: 40, h: 40 }, vp, { shape: 'circle', pad: 5, placement: 'left' });
    expect(g.cutout.shape).toBe('circle');
    expect(g.cutout.r).toBe(25); // (40+2*5)/2
    expect(g.bubble.x).toBeGreaterThanOrEqual(12); // 夹回（GAP）
  });
});

describe('coachmark — coachmarkSvg（出帧）', () => {
  it('全屏遮罩 + 镂空 mask + 气泡文案 + dimAlpha', () => {
    const svg = coachmarkSvg({ w: 800, h: 600 }, [{ mark: mark({ text: '点这里买牌', dimAlpha: 0.7 }), anchor: { x: 100, y: 100, w: 60, h: 30 } }]);
    expect(svg).toContain('<mask id="coach-hole">');
    expect(svg).toContain('mask="url(#coach-hole)"');
    expect(svg).toContain('fill-opacity="0.7"');
    expect(svg).toContain('点这里买牌');
  });
  it('circle 镂空 → svg 含 <circle>；空项 → 空串', () => {
    const svg = coachmarkSvg({ w: 400, h: 300 }, [{ mark: mark({ shape: 'circle' }), anchor: { x: 50, y: 50, w: 40, h: 40 } }]);
    expect(svg).toContain('<circle');
    expect(coachmarkSvg({ w: 100, h: 100 }, [])).toBe('');
  });
});
