import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { Engine } from '../../runtime/engine.js';
import { sakuraOtomeTheme } from '../themes/sakura-otome/theme.js';
import { GameShell, readResource, statDisplay, barFraction, collectButtons, collectDropTargets, imageSrc } from './GameShell.js';
import type { UILayout, ActionEnqueuer } from './types.js';

// 起一个带具名 Resource 的世界（gold=5/99，hp=30/100）。
function worldWith(): Engine {
  const e = new Engine();
  e.world.createEntity('rg');
  e.world.addComponent('rg', { type: 'Resource', id: 'gold', current: 5, min: 0, max: 99 });
  e.world.createEntity('rh');
  e.world.addComponent('rh', { type: 'Resource', id: 'hp', current: 30, min: 0, max: 100 });
  return e;
}

describe('GameShell — 纯绑定助手（数据→投影，确定性）', () => {
  it('readResource 按 id 全局寻址（缺失=undefined）', () => {
    const e = worldWith();
    expect(readResource(e.world, 'gold')!.current).toBe(5);
    expect(readResource(e.world, 'nope')).toBeUndefined();
  });

  it('statDisplay = icon+label+当前值；缺失资源安全归 0', () => {
    const e = worldWith();
    expect(statDisplay(e.world, { bind: 'gold', icon: '💰' })).toBe('💰5');
    expect(statDisplay(e.world, { bind: 'hp', label: '血' })).toBe('血 30');
    expect(statDisplay(e.world, { bind: 'ghost' })).toBe('0');
  });

  it('barFraction = (current-min)/(max-min) 钳 [0,1]', () => {
    const e = worldWith();
    expect(barFraction(e.world, 'hp')).toBeCloseTo(0.3, 5);
    expect(barFraction(e.world, 'ghost')).toBe(0);
  });

  it('collectButtons 递归收集 按钮→信号（与渲染解耦，证布局声明的信号正确）', () => {
    const layout: UILayout = {
      root: {
        kind: 'col',
        children: [
          { kind: 'button', label: '开战', signal: 'ready_btn' },
          { kind: 'tabs', tabs: [{ label: 'A', content: { kind: 'button', label: '刷新', signal: 'reroll_btn' } }] },
          { kind: 'text', text: 'x' },
        ],
      },
    };
    expect(collectButtons(layout.root)).toEqual([
      { label: '开战', signal: 'ready_btn' },
      { label: '刷新', signal: 'reroll_btn' },
    ]);
  });
});

describe('GameShell — 渲染（布局数据 → DOM 壳，扁平数据弱 LLM 可填）', () => {
  const layout: UILayout = {
    root: {
      kind: 'row',
      children: [
        { kind: 'stat', bind: 'gold', icon: '💰' },
        { kind: 'stat', bind: 'hp', label: '血' },
        { kind: 'bar', bind: 'hp', tone: 'hp' },
        { kind: 'button', label: '开战', signal: 'ready_btn', primary: true },
      ],
    },
  };

  it('renderToString 投影资源值 + 条宽 + 按钮标签（不崩、含真值）', () => {
    const html = renderToString(<GameShell engine={worldWith()} layout={layout} theme={sakuraOtomeTheme} />);
    expect(html).toContain('💰5'); // gold 投影
    expect(html).toContain('血 30'); // hp 投影
    expect(html).toContain('30%'); // hp 条 30/100
    expect(html).toContain('开战'); // 按钮
  });

  it('带 input 渲染（按钮接 R3 enqueueAction 接缝）不崩', () => {
    const input: ActionEnqueuer = { enqueueAction: () => {} };
    const html = renderToString(<GameShell engine={worldWith()} layout={layout} theme={sakuraOtomeTheme} input={input} />);
    expect(html).toContain('开战'); // 渲染含按钮；click→signal 接线镜像已验证的 VNStage enqueueAction
  });
});

describe('GameShell — image 节点（静态 src / 绑 StringVar 动态 src）', () => {
  it('imageSrc：静态优先；否则取 StringVar.value；缺失=空串', () => {
    const e = new Engine();
    e.world.createEntity('sv');
    e.world.addComponent('sv', { type: 'StringVar', id: 'card_face', value: 'guan_yu.png' });
    expect(imageSrc(e.world, { src: 'static.png' })).toBe('static.png');
    expect(imageSrc(e.world, { bind: 'card_face' })).toBe('guan_yu.png');
    expect(imageSrc(e.world, { bind: 'ghost' })).toBe('');
  });

  it('renderToString：动态 src 投影进 <img>；缺失 src 不渲（不破图）', () => {
    const e = new Engine();
    e.world.createEntity('sv');
    e.world.addComponent('sv', { type: 'StringVar', id: 'card_face', value: 'guan_yu.png' });
    const layout: UILayout = { root: { kind: 'row', children: [
      { kind: 'image', bind: 'card_face', width: 58, height: 68 },
      { kind: 'image', bind: 'missing' }, // 缺失 → 不渲
    ] } };
    const html = renderToString(<GameShell engine={e} layout={layout} theme={sakuraOtomeTheme} />);
    expect(html).toContain('guan_yu.png'); // 动态卡面投影
    expect((html.match(/<img/g) ?? []).length).toBe(1); // 仅 1 张（缺失那张不渲）
  });

  it('resolveAsset：sim 持资产 key → resolve 成可绘制 src（保 sim 纯）；无 resolver 回落原 key', () => {
    const e = new Engine();
    e.world.createEntity('sv');
    e.world.addComponent('sv', { type: 'StringVar', id: 'card_face', value: 'guan_yu' }); // sim 只持 key
    const resolve = (k: string): string => `/assets/${k}.webp`;
    expect(imageSrc(e.world, { bind: 'card_face' }, resolve)).toBe('/assets/guan_yu.webp');
    expect(imageSrc(e.world, { bind: 'card_face' })).toBe('guan_yu'); // 无 resolver → 回落原 key
  });

  it('renderToString + resolveAsset prop：<img src> = 解析后的 url（key 不进画面）', () => {
    const e = new Engine();
    e.world.createEntity('sv');
    e.world.addComponent('sv', { type: 'StringVar', id: 'card_face', value: 'guan_yu' });
    const layout: UILayout = { root: { kind: 'image', bind: 'card_face' } };
    const html = renderToString(<GameShell engine={e} layout={layout} theme={sakuraOtomeTheme} resolveAsset={(k) => `/a/${k}.webp`} />);
    expect(html).toContain('/a/guan_yu.webp');
  });
});

describe('GameShell — 拖放控件 draggable/dropzone（UI 拖拽 · 守红线：事件=信号名）', () => {
  it('collectDropTargets：收集 dropzone 信号 + draggable dragId（嵌套递归）', () => {
    const layout: UILayout = { root: { kind: 'col', children: [
      { kind: 'draggable', dragId: 'card_3', children: [{ kind: 'text', text: '♣3' }] },
      { kind: 'dropzone', signal: 'drop_slot', children: [{ kind: 'text', text: '空槽' }] },
      { kind: 'panel', children: [{ kind: 'draggable', dragId: 'tian_gang_1', children: [{ kind: 'text', text: 'T' }] }] },
    ] } };
    expect(collectDropTargets(layout.root)).toEqual({ zones: ['drop_slot'], drags: ['card_3', 'tian_gang_1'] });
  });

  it('collectButtons 递归进 draggable/dropzone 子节点（嵌套按钮不漏）', () => {
    const layout: UILayout = { root: { kind: 'dropzone', signal: 'z', children: [
      { kind: 'draggable', dragId: 'd', children: [{ kind: 'button', label: '移除', signal: 'remove_btn' }] },
    ] } };
    expect(collectButtons(layout.root)).toEqual([{ label: '移除', signal: 'remove_btn' }]);
  });

  it('renderToString：draggable 出可拖属性、dropzone 渲染子节点（不崩）', () => {
    const layout: UILayout = { root: { kind: 'row', children: [
      { kind: 'draggable', dragId: 'card_3', children: [{ kind: 'text', text: '♣3' }] },
      { kind: 'dropzone', signal: 'drop_slot', children: [{ kind: 'text', text: '空槽' }] },
    ] } };
    const html = renderToString(<GameShell engine={worldWith()} layout={layout} theme={sakuraOtomeTheme} />);
    expect(html).toContain('draggable'); // 可拖属性
    expect(html).toContain('♣3');
    expect(html).toContain('空槽');
  });
});
