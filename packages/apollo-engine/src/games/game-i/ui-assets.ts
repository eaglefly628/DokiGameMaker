// game-i · 贴图 UI 资产（贴图按钮皮 sample「入库」·owner 2026-07-07）。
//
// 走**统一 Asset 数据路线**（资产手册 §6）：贴图皮 = 登记进本地索引的正规资产，游戏侧按 **key** 引用，
// 解析成站点绝对 URL 后喂 `Button.skin`（已解析 URL·同 Image.src 约定）。**不再内联 data-URI 硬编码**（旧 sample 的临时凑合）。
// 真相文件：`public/games/game-i/art/index.json`（同一份·供站点服务 + vendor 自检测试）；此处 inline 一份供构建期消费。
import { parseAssetIndex, type AssetIndex } from '@assets/index.js';

// 自产程序化 SVG 皮（零外部素材·"游戏=数据"路径）
export const SKIN_METAL = 'tex/skin-metal';
export const SKIN_WOOD = 'tex/skin-wood';
export const SKIN_STONE = 'tex/skin-stone';
export const SKIN_SCROLL = 'tex/skin-scroll';
// vendored 真美术素材（Kenney UI Pack·CC0·经 scripts/vendor-asset.mjs 从共享货架 copy 进本地·带 vendoredFrom 溯源）
export const BTN_BLUE = 'tex/btn-blue';
export const BTN_GREEN = 'tex/btn-green';
export const BTN_RED = 'tex/btn-red';
export const BTN_YELLOW = 'tex/btn-yellow';
export const BTN_GREY = 'tex/btn-grey';
// 卡通按钮款式变体（同 Kenney UI 包·不同款式：圆润/高光/描边幽灵）
export const BTN_ROUND = 'tex/btn-round';
export const BTN_GLOSSY = 'tex/btn-glossy';
export const BTN_GHOST = 'tex/btn-ghost';
// vendored 卡通插画（undraw·MIT·内容丰富的彩色卡通场景·经 Image 控件展示）
export const CARTOON = ['astronaut', 'cat', 'dog', 'camping', 'gaming', 'music', 'birthday', 'robot', 'travel'] as const;
export type CartoonKey = `tex/cartoon-${(typeof CARTOON)[number]}`;
// vendored 卡牌贴图（fluentui·MIT·彩色卡通牌面·贴到 Button.skin 上=贴图按钮=一张卡）
export const CARD_JOKER = 'tex/card-joker';
export const CARD_FLOWER = 'tex/card-flower';

const kenneyBtn = (id: string, file: string): Record<string, unknown> => ({
  id, type: 'texture', status: 'filled', path: `/games/game-i/art/kenney-ui/${file}.png`,
  description: `${file} · kenney-ui`, spec: { usage: 'sprite', width: 190, height: 48 },
  category: 'icon.ui', license: 'CC0-1.0', source: 'kenney-ui',
  provenance: { repo: 'ereborstudios/kenney-ui-pack', ref: 'main', vendoredFrom: `kenney-ui/${file}` },
});
const CARTOON_FILE: Record<string, string> = {
  astronaut: 'Astronaut_0o7w', cat: 'playful_cat_ql3n', dog: 'good_doggy_4wfq', camping: 'camping_j8s0',
  gaming: 'gaming_6oy3', music: 'music_r1se', birthday: 'happy_birthday_s72n', robot: 'robotics_kep0', travel: 'travel_pb6m',
};
const cartoon = (key: string): Record<string, unknown> => ({
  id: `tex/cartoon-${key}`, type: 'texture', status: 'filled', path: `/games/game-i/art/undraw/${CARTOON_FILE[key]}.svg`,
  description: `${key} · undraw 卡通插画`, spec: { usage: 'sprite' }, category: 'illustration', license: 'MIT', source: 'undraw',
  provenance: { repo: 'cuuupid/undraw-illustrations', ref: 'master', vendoredFrom: `undraw/${CARTOON_FILE[key]}` },
});

/** game-i 本地贴图 UI 索引（与 public/games/game-i/art/index.json 同源·闭集 spec 校验通过）。 */
export const GAME_I_UI_INDEX: AssetIndex = parseAssetIndex({
  version: 1,
  assets: [
    { id: SKIN_METAL, type: 'texture', status: 'filled', path: '/games/game-i/art/textures/skin-metal.svg', description: '金属铆钉板按钮皮', spec: { usage: 'sprite', width: 220, height: 88 }, category: 'ui.button-skin', license: 'CC0', source: 'src/games/game-i (自产)' },
    { id: SKIN_WOOD, type: 'texture', status: 'filled', path: '/games/game-i/art/textures/skin-wood.svg', description: '木纹板按钮皮', spec: { usage: 'sprite', width: 220, height: 88 }, category: 'ui.button-skin', license: 'CC0', source: 'src/games/game-i (自产)' },
    { id: SKIN_STONE, type: 'texture', status: 'filled', path: '/games/game-i/art/textures/skin-stone.svg', description: '花岗岩石纹按钮皮', spec: { usage: 'sprite', width: 220, height: 88 }, category: 'ui.button-skin', license: 'CC0', source: 'src/games/game-i (自产)' },
    { id: SKIN_SCROLL, type: 'texture', status: 'filled', path: '/games/game-i/art/textures/skin-scroll.svg', description: '卷轴羊皮按钮皮', spec: { usage: 'sprite', width: 220, height: 88 }, category: 'ui.button-skin', license: 'CC0', source: 'src/games/game-i (自产)' },
    kenneyBtn(BTN_BLUE, 'blue-button05'),
    kenneyBtn(BTN_GREEN, 'green-button05'),
    kenneyBtn(BTN_RED, 'red-button01'),
    kenneyBtn(BTN_YELLOW, 'yellow-button05'),
    kenneyBtn(BTN_GREY, 'grey-button05'),
    kenneyBtn(BTN_ROUND, 'blue-button00'),
    kenneyBtn(BTN_GLOSSY, 'green-button03'),
    kenneyBtn(BTN_GHOST, 'yellow-button13'),
    ...CARTOON.map((k) => cartoon(k)),
    { id: CARD_JOKER, type: 'texture', status: 'filled', path: '/games/game-i/art/fluentui/joker_flat.svg', description: '小丑牌·fluentui', spec: { usage: 'sprite', width: 32, height: 32 }, category: 'icon.ui', license: 'MIT', source: 'fluentui', provenance: { repo: 'microsoft/fluentui-emoji', ref: 'main', vendoredFrom: 'fluentui/joker_flat' } },
    { id: CARD_FLOWER, type: 'texture', status: 'filled', path: '/games/game-i/art/fluentui/flower_playing_cards_flat.svg', description: '花札牌·fluentui', spec: { usage: 'sprite', width: 32, height: 32 }, category: 'icon.ui', license: 'MIT', source: 'fluentui', provenance: { repo: 'microsoft/fluentui-emoji', ref: 'main', vendoredFrom: 'fluentui/flower_playing_cards_flat' } },
  ],
});

// key → 站点绝对 URL 映射（path 已是绝对路径·baseUrl ''）。这就是 DOM UI 侧的 resolveAsset：sim/数据持 key，渲染前解析成 URL。
const URL_BY_ID = new Map(GAME_I_UI_INDEX.assets.map((a) => [a.id, a.path ?? '']));

/** 贴图皮资产 key → 已解析 URL（喂 Button.skin）。未登记/未 filled → 空串（fail-soft·渲染层退化无皮·不炸）。 */
export function uiTextureUrl(id: string): string {
  return URL_BY_ID.get(id) ?? '';
}
