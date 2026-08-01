// 展示台接入 apollo-toon 契约测试（REQ-STYLESET M0.5）：
// 注册 + 换皮下拉置顶 + 选单收敛到 3；同一棵 gallery 数据在新主题下换皮生效（糖果皮 9-slice + 纸纹面 + 水墨背景）。

import { describe, it, expect } from 'vitest';
import { renderNode } from '@ui/components/index.js';
import { buildGallery } from './gallery.js';
import { THEMES, THEME_OPTIONS, apolloToon } from './themes.js';

describe('game-i · apollo-toon 接入', () => {
  it('主题已注册进 THEMES', () => {
    expect(THEMES['apollo-toon']).toBe(apolloToon);
  });

  it('换皮下拉：apollo-toon 置顶 + 收敛到 3（含默认青瓷·墨蓝）', () => {
    expect(THEME_OPTIONS[0]).toEqual({ value: 'apollo-toon', label: '水墨玩趣' });
    expect(THEME_OPTIONS).toHaveLength(3);
    expect(THEME_OPTIONS.map((o) => o.value)).toContain('onyx'); // 默认保留
  });

  it('糖果厚底唇钮：gallery 各 kind 按钮走主题皮 9-slice（buttonSkins 生效）', () => {
    const html = renderNode(buildGallery('apollo-toon', 'mod-ui', true, true), apolloToon);
    expect(html).toContain('data-apollo-skin');   // 按钮挂了皮标记
    expect(html).toContain('border-image:url(');  // 9-slice 无损缩放（skinSlice=12）
  });

  it('水墨背景 + 纸纹面：主题层原样合成进渲染串', () => {
    const html = renderNode(buildGallery('apollo-toon', 'mod-ui'), apolloToon);
    expect(html).toContain(apolloToon.texture!);      // 远山淡墨背景进 Screen
    expect(html).toContain(apolloToon.panelTexture!); // 纸纹底进面板
  });

  it('换皮=数据驱动：同一棵数据换令牌 → 结构一致仅观感变', () => {
    const a = renderNode(buildGallery('apollo-toon', 'mod-ui'), THEMES['apollo-toon']!);
    const b = renderNode(buildGallery('apollo-toon', 'mod-ui'), THEMES['onyx']!);
    expect(a).toContain('data-tabs="gallery-tabs"');
    expect(b).toContain('data-tabs="gallery-tabs"');
    expect(a).not.toBe(b);
  });
});
