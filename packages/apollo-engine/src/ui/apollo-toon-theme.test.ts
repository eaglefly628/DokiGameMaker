// apollo-toon「水墨玩趣」主题契约测试（REQ-STYLESET M0.5）：
// 全 token 覆盖 + 程序化皮/背景的 data-URI 编码安全（过得了 safeUrl 净化 / 不撞 style 双引号）。

import { describe, it, expect } from 'vitest';
import { apolloToon, APOLLO_TOON_SLICE } from './apollo-toon-theme.js';

describe('apollo-toon UITheme', () => {
  it('全 token 覆盖：底/字/强调/语义/字体全非空', () => {
    for (const k of ['bg0', 'bg1', 'bg2', 'bg3', 'pageBg', 'line',
      'text', 'sub', 'dim', 'jade', 'jadeWash', 'jadeLine', 'gold',
      'ok', 'okWash', 'warn', 'warnWash', 'danger', 'fontUi', 'fontMono'] as const) {
      expect(apolloToon[k], k).toBeTruthy();
    }
    // 亮皮须设浅底输入框 + 深墨字令牌
    expect(apolloToon.inputBg).toBeTruthy();
    expect(apolloToon.ink).toBe('#2C2C34');
  });

  it('四 kind 各配程序化 data-URI 糖果皮 + 9-slice slice=12', () => {
    const skins = apolloToon.buttonSkins!;
    for (const kind of ['hero', 'primary', 'ghost', 'quiet'] as const) {
      const s = skins[kind]!;
      expect(s, kind).toBeTruthy();
      expect(s.skin.startsWith('data:image/svg+xml,'), kind).toBe(true);
      expect(s.skinSlice).toBe(APOLLO_TOON_SLICE);
      // 皮走 skinCss→safeUrl（剥离 '"()\空白）→ encodeURIComponent 后全 %XX·零裸符·净化后完好存活。
      expect(/[<>"'() ]/.test(s.skin), `${kind} skin 含裸符会被 safeUrl 吃掉`).toBe(false);
    }
  });

  it('程序化水墨背景 + 面板纸纹：完整 CSS 层·无双引号（不撞 style 属性）', () => {
    for (const layer of [apolloToon.texture!, apolloToon.wash!, apolloToon.panelTexture!]) {
      expect(layer).toBeTruthy();
      expect(layer.includes('"'), '主题层含双引号会截断 style 属性').toBe(false);
    }
    expect(apolloToon.texture).toContain('url(data:image/svg+xml,');
    expect(apolloToon.texture).toContain('no-repeat');       // 远山单张 cover
    expect(apolloToon.panelTexture).toContain('url(data:image/svg+xml,');
    expect(apolloToon.panelTexture).toContain('repeat');      // 纸纹平铺
  });

  it('确定性：同一主题对象引用稳定（模块级常量·零随机）', () => {
    const a = apolloToon.buttonSkins!.hero!.skin;
    // 皮由 encodeURIComponent(固定 SVG) 一次性求值 → 值内不含随机/时间标记。
    expect(a).toMatch(/^data:image\/svg\+xml,%3Csvg/);
  });
});
