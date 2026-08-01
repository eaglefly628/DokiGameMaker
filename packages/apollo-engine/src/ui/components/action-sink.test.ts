// @vitest-environment happy-dom
// mountUI 动作 sink（铁律·写路径收紧成信号）：无本地 handler 的 data-action → input.enqueueAction(信号,{arg})，
// 经 InputQueue → keybind → Signal{name,arg} 落到 sim 能力层（UI 只发信号·逻辑不在 UI 回调里）。
//   · 有 handler 则 handler 优先（迁移期并存·删了回调即落到信号）；
//   · 无 sink + 无 handler → 啥也不发（旧 4 参调用方行为不变·非破坏）；
//   · 这条 sink 同时就是 AI 玩家的动作接口（另一个推同样具名动作的 InputSource）。
import { describe, it, expect } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode, ActionSink } from './types.js';

type Spy = ActionSink & { calls: Array<{ name: string; arg?: string }> };
function spySink(): Spy {
  const calls: Array<{ name: string; arg?: string }> = [];
  return { calls, enqueueAction(name, value) { calls.push({ name, arg: value?.arg }); } };
}
function mountInBody(tree: LayoutNode, handlers = {}, sink?: ActionSink) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const teardown = mountUI(host, tree, handlers, undefined, sink);
  return { host, teardown, done: () => { teardown(); host.remove(); } };
}

describe('UI Components · mountUI 动作 sink（UI 只发信号·逻辑入 sim）', () => {
  it('无本地 handler + 有 sink → 点 data-action 发 enqueueAction(信号,{arg})', () => {
    const tree: LayoutNode = { type: 'Button', id: 'buy', props: { label: '买', action: 'buy', actionArg: 'card_42' } };
    const s = spySink();
    const { host, done } = mountInBody(tree, {}, s);
    (host.querySelector('#buy') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(s.calls).toEqual([{ name: 'buy', arg: 'card_42' }]);
    done();
  });

  it('本地 handler 优先：有 handler 则调 handler、不走 sink（迁移期并存）', () => {
    const tree: LayoutNode = { type: 'Button', id: 'go', props: { label: 'Go', action: 'go' } };
    const s = spySink();
    let local = 0;
    const { host, done } = mountInBody(tree, { go: () => { local++; } }, s);
    (host.querySelector('#go') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }));
    expect(local).toBe(1);
    expect(s.calls).toEqual([]); // sink 未被调用
    done();
  });

  it('无 sink + 无 handler → 点击是 no-op、不抛（旧 4 参调用方行为不变·非破坏）', () => {
    const tree: LayoutNode = { type: 'Button', id: 'x', props: { label: 'X', action: 'x' } };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree, {}); // 旧 4 参签名
    expect(() => (host.querySelector('#x') as HTMLElement).dispatchEvent(new Event('click', { bubbles: true }))).not.toThrow();
    teardown(); host.remove();
  });

  it('change 动作（select 所选 value 作 arg）也走 sink', () => {
    const tree: LayoutNode = { type: 'Dropdown', id: 'dd', props: { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], action: 'pick' } };
    const s = spySink();
    const { host, done } = mountInBody(tree, {}, s);
    const sel = host.querySelector('#dd') as HTMLSelectElement;
    sel.value = 'b';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(s.calls).toEqual([{ name: 'pick', arg: 'b' }]);
    done();
  });

  it('拖放落点 → 信号 + 被拖 id 作 arg（带参动作走 sink·之前 GameShell 路径丢失的 drag id 这里接通）', () => {
    const tree: LayoutNode = {
      type: 'Panel', id: 'root', props: {}, layout: { direction: 'row' },
      children: [
        { type: 'Card', id: 'card_3', props: { title: '♣3' }, layout: { draggable: true } },
        { type: 'Panel', id: 'slot', props: { title: '槽' }, layout: { dropZone: 'drop_slot' }, children: [] },
      ],
    };
    const s = spySink();
    const { host, done } = mountInBody(tree, {}, s);
    (host.querySelector('[data-drag="card_3"]') as HTMLElement).dispatchEvent(new Event('dragstart', { bubbles: true }));
    (host.querySelector('[data-drop="drop_slot"]') as HTMLElement).dispatchEvent(new Event('drop', { bubbles: true }));
    expect(s.calls).toEqual([{ name: 'drop_slot', arg: 'card_3' }]);
    done();
  });
});
