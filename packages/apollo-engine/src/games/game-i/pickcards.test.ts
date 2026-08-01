// Game I · 组合演示「选牌计分」测试——证伪「多选是缺口」+ 验证新能力进了数据。
import { describe, it, expect } from 'vitest';
import { renderNode } from '@ui/components/index.js';
import { onyx } from './themes.js';
import { buildPickHand, applyPick, evalHand, HAND, MAX_PICK, INITIAL_PICK, type PickState } from './pickcards.js';

const P = (selected: string[] = []): PickState => ({ selected });

describe('Game I 组合演示·选牌（多选≤5·纯重组）', () => {
  it('evalHand 纯函数：识别同花顺/葫芦/对子/高牌', () => {
    // h0..h4 = 10♠ J♠ Q♠ K♠ A♠ → 同花顺
    expect(evalHand(HAND.slice(0, 5)).name).toBe('同花顺');
    // A♠ A♥ A♦ K♠ K♣ = 三条+对子 → 葫芦
    expect(evalHand([HAND[4]!, HAND[5]!, HAND[6]!, HAND[3]!, HAND[7]!]).name).toBe('葫芦');
    expect(evalHand([HAND[4]!, HAND[5]!]).name).toBe('对子');        // A♠ A♥
    expect(evalHand([HAND[0]!, HAND[7]!]).name).toBe('高牌');         // 10♠ K♣
    expect(evalHand([]).name).toBe('—');
  });

  it('多选联动：点选切换、上限 5 张（第 6 张被挡 + warn）', () => {
    let s = P();
    s = applyPick(s, 'toggle', 'h0').state;
    s = applyPick(s, 'toggle', 'h1').state;
    expect(s.selected).toEqual(['h0', 'h1']);
    s = applyPick(s, 'toggle', 'h0').state;          // 再点取消
    expect(s.selected).toEqual(['h1']);
    // 选满 5 张
    s = P(['h0', 'h1', 'h2', 'h3', 'h4']);
    const r = applyPick(s, 'toggle', 'h5');          // 第 6 张
    expect(r.state.selected.length).toBe(MAX_PICK);  // 仍 5 张
    expect(r.toast?.tone).toBe('warn');
  });

  it('拖入联动：drop 只增不减，满 5 张挡住', () => {
    expect(applyPick(P(), 'drop', 'h2').state.selected).toEqual(['h2']);
    expect(applyPick(P(['h2']), 'drop', 'h2').state.selected).toEqual(['h2']); // 重复拖不变
    expect(applyPick(P(['h0', 'h1', 'h2', 'h3', 'h4']), 'drop', 'h5').toast?.tone).toBe('warn');
  });

  it('出牌结算：算牌型分 + 清空 + ok toast', () => {
    const r = applyPick(P(['h0', 'h1', 'h2', 'h3', 'h4']), 'play');
    expect(r.state.selected).toEqual([]);
    expect(r.toast?.tone).toBe('ok');
    expect(r.toast?.text).toContain('同花顺');
  });

  it('视图：选中牌进 accent + 放大 scale + 拉正 rotate(0)；牌都可拖拽·非选中扇形', () => {
    const html = renderNode(buildPickHand(P(['h4'])), onyx);
    expect(html).toContain('data-drag="h4"');                 // 可拖拽
    expect(html).toContain('scale(1.12)');                    // 选中放大
    expect(html).toContain('data-drop="dropPick"');           // 选入区 dropZone
    expect(html).toContain('transform:rotate(');              // 扇形手牌（非选中牌斜摆）
  });
});
