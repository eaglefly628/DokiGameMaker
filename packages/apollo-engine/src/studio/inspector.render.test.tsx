import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { StudioInspector } from './StudioInspector.js';
import { AssetBrowser } from './AssetBrowser.js';
import { studioAssets } from './assets-model.js';
import { inspectBlueprint } from './inspect.js';
import { parseManifest } from '../assembly/manifest.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import { buildGameFBlueprint } from '../games/game-f/index.js';
import { demoBlueprint } from '../assembly/demo.assembly.js';

// 回归：透视器曾因一款已删旧游戏蓝图的可选字段 Tween.loops=undefined → kindOf 落 'json' →
// JSON.stringify(undefined)===undefined → 编辑器 buf 为 undefined → buf.length 崩 → 整个透视器白屏。
// （tsc/build/单测都没渲染过该组件，所以全绿却白屏。）两道守卫：
//   ① 真把组件渲染一遍（默认 game-e）。
//   ② 不变式：任何"值缺省(undefined/null)"的字段都不能被判成 'json'（否则 JSON.stringify→undefined）。

const GAMES: Array<[string, () => WorldBlueprint]> = [
  ['game-f', () => buildGameFBlueprint()],
  ['demo', () => demoBlueprint],
];

describe('数据透视器 · 渲染回归', () => {
  it('StudioInspector(默认 game-e) renderToString 不抛异常', () => {
    const html = renderToString(<StudioInspector onBack={() => {}} />);
    expect(html.length).toBeGreaterThan(0);
  });

  it('StudioInspector(注入生成游戏 extraGame) renderToString 不抛异常并选中它', () => {
    const manifest = {
      capabilities: ['a1-transform'],
      entities: { e: { Transform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } } },
    };
    const extraGame = { id: 'gen', title: '生成 · 测试', build: () => parseManifest(manifest) };
    const html = renderToString(<StudioInspector onBack={() => {}} extraGame={extraGame} />);
    expect(html).toContain('生成 · 测试');
  });

  // 资产透视面板对每个游戏(尤其 pb/pc)都要能渲染（原诉求：B/C 也做好）。
  for (const [name, build] of GAMES) {
    it(`${name}: AssetBrowser 渲染不抛异常`, () => {
      const html = renderToString(
        <AssetBrowser assets={studioAssets(name, build(), null)} onLocate={() => false} />,
      );
      expect(html.length).toBeGreaterThan(0);
    });
  }

  for (const [name, build] of GAMES) {
    it(`${name}: 缺省值字段不会被判成 json（白屏崩点不变式）`, () => {
      for (const ent of inspectBlueprint(build())) {
        for (const comp of ent.components) {
          for (const f of comp.fields) {
            const nullish = f.value === undefined || f.value === null;
            expect(
              f.kind === 'json' && nullish,
              `${name} · ${ent.id}.${comp.type}.${f.key} 缺省却被判成 json`,
            ).toBe(false);
          }
        }
      }
    });
  }
});
