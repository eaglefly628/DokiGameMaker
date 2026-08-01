// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Flag, Coachmark } from '@engine/protocol/components.js';
import { mountOnboardingOverlay } from './onboarding-overlay.js';

// live DOM 解释器冒烟测（happy-dom）：激活 Coachmark + data-anchor 元素 → 渲出遮罩层 + 气泡；flag 关→灭；destroy→卸。
describe('OnboardingOverlay · live DOM 渲染（happy-dom 冒烟）', () => {
  it('激活 Coachmark + data-anchor 元素 → 渲遮罩+气泡；flag 关→灭；destroy→卸', () => {
    const target = document.createElement('button'); // 手写 DOM 屏：元素加 data-anchor（零重构）
    target.setAttribute('data-anchor', 'buy_btn');
    document.body.appendChild(target);
    const host = document.createElement('div');
    document.body.appendChild(host);

    const w = new World();
    w.createEntity('f'); w.addComponent('f', { type: 'Flag', id: 'coach_buy', active: true } as Flag);
    w.createEntity('m'); w.addComponent('m', { type: 'Coachmark', anchor: 'buy_btn', text: '点这里改造', visibleWhen: 'coach_buy' } as Coachmark);

    const ov = mountOnboardingOverlay(host, w, document);
    expect(host.querySelector('div')).not.toBeNull();    // overlay 层
    expect(host.textContent).toContain('点这里改造');     // 气泡文案
    expect(host.innerHTML).toContain('box-shadow');       // spotlight 镂空块

    w.getComponent<Flag>('f', 'Flag')!.active = false;    // 流程结束 → coach_buy 关
    ov.update();
    expect(host.textContent).not.toContain('点这里改造');  // 高亮灭

    ov.destroy();
    expect(host.querySelector('div')).toBeNull();         // 卸载干净
  });

  it('锚点元素不存在 → 本帧不渲（不抛）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const w = new World();
    w.createEntity('m'); w.addComponent('m', { type: 'Coachmark', anchor: 'ghost', text: 'x' } as Coachmark);
    const ov = mountOnboardingOverlay(host, w, document);
    expect(host.textContent).toBe(''); // 锚点找不到 → 不渲内容（layer 在但空、不抛）
    ov.destroy();
  });
});
