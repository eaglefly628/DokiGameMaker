// @vitest-environment happy-dom
// 引擎新控件验收（下沉自 game-g bespoke 牌面/掷币/对决·owner 2026-06-25 批准·验证后推广）：
// PlayingCard（扑克牌原语）/ CoinFlip（掷币）/ Versus（对决特写）—— 纯数据 → 引擎渲染，最弱 LLM 也能填数据。
import { describe, it, expect, vi } from 'vitest';
import { renderNode, mountUI } from './index.js';
import type { LayoutNode } from './index.js';

describe('UI Components · PlayingCard 扑克牌原语', () => {
  it('正面：渲染点数 + 花色（双角镜像 + 中央大花色）', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'pc', props: { rank: 'A', suit: '♠', faceUp: true } });
    expect(html).toContain('id="pc"');
    expect(html).toContain('A'); expect(html).toContain('♠');
  });
  it('红黑自动判色：♥ 用 danger(红)·♠ 用 text(黑/墨)', () => {
    const red = renderNode({ type: 'PlayingCard', id: 'r', props: { rank: 'K', suit: '♥' } });
    const blk = renderNode({ type: 'PlayingCard', id: 'b', props: { rank: 'K', suit: '♠' } });
    expect(red).not.toBe(blk); // 颜色不同（红牌走 danger 令牌）
  });
  it('背面：faceUp=false 显牌背纹样·不露点数花色中心', () => {
    const back = renderNode({ type: 'PlayingCard', id: 'bk', props: { rank: 'A', suit: '♠', faceUp: false, back: '❖' } });
    expect(back).toContain('❖');
  });
  it('牌背贴图 backArt（REQ-UI-PlayingCard-back·批29）：faceUp:false 整面 cover·替代纹样字符', () => {
    const back = renderNode({ type: 'PlayingCard', id: 'ba', props: { rank: 'A', suit: '♠', faceUp: false, back: '❖', backPattern: 'checker', backArt: '/art/back.png' } });
    expect(back).toContain('src="/art/back.png"'); expect(back).toContain('object-fit:cover');
    expect(back).not.toContain('❖'); expect(back).not.toContain('repeating-conic-gradient'); // 贴图替代字符+程序化纹理
    const face = renderNode({ type: 'PlayingCard', id: 'fa', props: { rank: 'A', suit: '♠', faceUp: true, backArt: '/art/back.png' } });
    expect(face).not.toContain('/art/back.png'); // 正面不受牌背贴图影响
  });
  it('整牌面贴图 faceArt（A-024①·backArt 正面版）：faceUp 整面 cover·角标/花色全隐·label 覆盖仍在', () => {
    const html = renderNode({ type: 'PlayingCard', id: 'fc', props: { rank: 'A', suit: '♥', faceUp: true, faceArt: '/art/card-dragon.png', label: '青龙' } });
    expect(html).toContain('src="/art/card-dragon.png"'); expect(html).toContain('object-fit:cover');
    expect(html).not.toContain('<br>'); // 角标 pip（rank<br>suit）没了=整面被插画替
    expect(html).toContain('青龙'); // label 覆盖层仍在
    // faceArtSlice → 9-slice border-image 画框
    const framed = renderNode({ type: 'PlayingCard', id: 'fc2', props: { rank: 'K', suit: '♠', faceArt: '/art/frame.png', faceArtSlice: 16 } });
    expect(framed).toContain('border-image:url(/art/frame.png)');
    // 不填 faceArt → 原程序化牌面（角标 pip 在·零回归）
    const plain = renderNode({ type: 'PlayingCard', id: 'fc3', props: { rank: 'Q', suit: '♦' } });
    expect(plain).toContain('<br>'); expect(plain).not.toContain('object-fit:cover');
    // 牌背时 faceArt 不生效（走 backArt/程序化背）
    const back = renderNode({ type: 'PlayingCard', id: 'fc4', props: { rank: 'A', suit: '♠', faceUp: false, faceArt: '/art/card-dragon.png' } });
    expect(back).not.toContain('/art/card-dragon.png');
  });
  it('选中态 selected → 金边发光；label/value 显示', () => {
    const html = renderNode({ type: 'PlayingCard', id: 's', props: { rank: '10', suit: '♦', selected: true, label: '孙武', value: '66' } });
    expect(html).toContain('box-shadow'); expect(html).toContain('孙武'); expect(html).toContain('66');
  });
  it('可点：action → data-action/data-arg；mountUI 点击触发 handler', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const pick = vi.fn();
    const tree: LayoutNode = { type: 'PlayingCard', id: 'p', props: { rank: 'A', suit: '♠', action: 'pick', actionArg: 'AS' } };
    const ui = mountUI(host, tree, { pick });
    const el = host.querySelector('[data-action="pick"][data-arg="AS"]') as HTMLElement;
    expect(el).toBeTruthy();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pick).toHaveBeenCalledWith('AS');
    ui();
  });
});

describe('UI Components · CoinFlip 掷币', () => {
  it('静态：outcome=heads → 定到正面(rotateX 0)；tails → rotateX 180', () => {
    const heads = renderNode({ type: 'CoinFlip', id: 'h', props: { outcome: 'heads' } });
    const tails = renderNode({ type: 'CoinFlip', id: 't', props: { outcome: 'tails' } });
    expect(heads).toContain('rotateX(0deg)');
    expect(tails).toContain('rotateX(180deg)');
  });
  it('spinning=true → 用白名单关键帧 apollo-coin-* 落定到结果', () => {
    const html = renderNode({ type: 'CoinFlip', id: 'c', props: { outcome: 'tails', spinning: true, durationMs: 900 } });
    expect(html).toContain('apollo-coin-tails 900ms');
  });
  it('两面文字可定制（headsLabel/tailsLabel）', () => {
    const html = renderNode({ type: 'CoinFlip', id: 'c2', props: { outcome: 'heads', headsLabel: '正·活', tailsLabel: '反·亡' } });
    expect(html).toContain('正·活'); expect(html).toContain('反·亡');
  });
  it('面贴图 headsArt/tailsArt（批30 硬币也可换）：面底=图 cover+白字投影；无 art=原底不回归', () => {
    const html = renderNode({ type: 'CoinFlip', id: 'c3', props: { outcome: 'heads', headsArt: '/a/coin.png', headsLabel: '掷' } });
    expect(html).toContain("url('/a/coin.png') center/cover no-repeat");
    expect(html).toContain('text-shadow'); expect(html).toContain('掷');
    const plain = renderNode({ type: 'CoinFlip', id: 'c4', props: { outcome: 'heads' } });
    expect(plain).not.toContain('url('); expect(plain).not.toContain('text-shadow');
  });
});

describe('UI Components · Versus 对决特写', () => {
  it('渲染左右两张牌 + 中央 ⚔/胜率 + 火花', () => {
    const html = renderNode({ type: 'Versus', id: 'v', props: { left: { rank: 'A', suit: '♠' }, right: { rank: 'K', suit: '♥' }, label: '76 : 24', spark: true } });
    expect(html).toContain('id="v-left"'); expect(html).toContain('id="v-right"');
    expect(html).toContain('⚔'); expect(html).toContain('76 : 24');
    expect(html).toContain('apollo-spark');
  });
  it('winner=left → 左牌选中(金边)·右牌暗', () => {
    const html = renderNode({ type: 'Versus', id: 'v2', props: { left: { rank: 'A', suit: '♠' }, right: { rank: '2', suit: '♣' }, winner: 'left' } });
    expect(html).toContain('box-shadow'); // 胜方金边发光
    expect(html).toContain('opacity:.5'); // 败方暗
  });
});
