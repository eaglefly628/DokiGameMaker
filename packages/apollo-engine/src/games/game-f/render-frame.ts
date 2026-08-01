// 一次性离线渲染：复用纯函数 collectRenderables（无需 DOM canvas）把 game-f 世界投影成 SVG 一帧。
// 用途：无浏览器环境里"看一帧"——确定性、可截图。SVG 走 stdout：
//   npx vite-node src/games/game-f/render-frame.ts > game-f-frame.svg
import { Engine } from '../../runtime/engine.js';
import { collectRenderables, getCameraView } from '../../renderer/renderable.js';
import { buildGameFBlueprint, GAME_F_ASSETS } from './index.js';

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;
const PREFIX = 'data:image/svg+xml,';
const innerSvg = (src: string): string => decodeURIComponent(src.slice(PREFIX.length));
const hex = (tint: number): string => `#${(tint & 0xffffff).toString(16).padStart(6, '0')}`;

const e = new Engine({ tickRate: 60 });
e.load(buildGameFBlueprint());
// 跑到两军交火中段（已走位贴近、普攻打击区在场、有人掉血）。
for (let i = 0; i < 70; i++) e.world.tick();

const assetSrc = new Map(GAME_F_ASSETS.map((d) => [d.key, d]));
const cam = getCameraView(e.world);
const cx = cam?.centerX ?? 0;
const cy = cam?.centerY ?? 0;
const zoom = cam?.zoom ?? 1;

let body = '';
for (const r of collectRenderables(e.world)) {
  const asset = r.sprite ? assetSrc.get(r.sprite.textureKey) : undefined;
  if (asset && asset.kind === 'texture') {
    const aw = asset.width ?? 16;
    const ah = asset.height ?? 16;
    if (asset.src.startsWith('data:image/svg')) {
      body += `<g transform="translate(${r.x - aw / 2},${r.y - ah / 2})">${innerSvg(asset.src)}</g>`;
    } else {
      // 真 DCSS png 离屏嵌不了（二进制），退化成方块占位；实机浏览器画真图。
      body += `<rect x="${r.x - aw / 2}" y="${r.y - ah / 2}" width="${aw}" height="${ah}" rx="5" fill="#566" stroke="#9ab"/>`;
    }
  } else if (r.text) {
    // 头顶名字（势力色 = Color.tint）；多行按 \n 拆。
    const fill = r.color ? hex(r.color.tint) : '#e2e8f0';
    const tx = r.text;
    tx.content.split('\n').forEach((ln, i) => {
      body += `<text x="${r.x}" y="${r.y + i * (tx.fontSize + 1)}" font-family="sans-serif" font-size="${tx.fontSize}" fill="${fill}" text-anchor="middle">${ln}</text>`;
    });
  } else if (r.shape?.kind === 'box') {
    const w = r.shape.width ?? 8;
    const h = r.shape.height ?? 8;
    body += `<rect x="${r.x - w / 2}" y="${r.y - h / 2}" width="${w}" height="${h}" fill="#e2e8f0"/>`;
  }
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_W}" height="${VIEWPORT_H}">` +
  `<rect width="${VIEWPORT_W}" height="${VIEWPORT_H}" fill="#0c0a08"/>` +
  `<g transform="translate(${VIEWPORT_W / 2},${VIEWPORT_H / 2}) scale(${zoom}) translate(${-cx},${-cy})">${body}</g>` +
  `<text x="12" y="24" font-family="system-ui" font-size="13" fill="#cbd5e1">Game F · 像素三分天下自走棋 —— 蜀(红) vs 魏(蓝) 全自动对战（纯数据涌现）</text>` +
  `</svg>`;

console.log(svg);
console.error(`game-f frame: ${collectRenderables(e.world).length} renderables, cam@${cx.toFixed(1)},${cy.toFixed(1)} zoom ${zoom}`);
