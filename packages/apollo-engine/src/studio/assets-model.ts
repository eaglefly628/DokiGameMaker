import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import type { AssetIndex } from '@assets/index.js';
import { JOKER_ART_FILES, JOKER_ART_MISSING, jokerArtKey } from '../games/game-e/assets.js';
import { JOKER_CATALOG } from '../games/game-e/index.js';

// ═══════════════════════════════════════════════════════════════
//  资产透视 · 统一模型 (Asset Browser model — pure, no DOM/React)
//
//  把每个游戏"这局要哪些美术、填了没、谁在用"摊成一份统一 StudioAsset[]：
//   · game-e → 小丑牌(JOKER_CATALOG)真美术切图 + 额外参考素材。
//   · 其它   → 通用扫描 textureKey/clipId。
//  再和 assets/index.json 对照，让 tbf/filled 状态权威。供 UI 做分类/收缩/搜索/双击定位。
// ═══════════════════════════════════════════════════════════════

export type StudioAssetStatus = 'filled' | 'tbf' | 'placeholder' | 'missing';

export interface StudioAsset {
  id: string;
  /** 分类用（按此分组）：texture/background/character_portrait/bgm/material/garment/accessory… */
  type: string;
  name: string;
  description: string;
  status: StudioAssetStatus;
  /** 搜索 + 过滤用关键词。 */
  tags: string[];
  /** 双击定位目标：实体 id（可跳数据树）或场景 id（game-b，仅展示）。 */
  usedBy: string[];
  variants?: string[];
}

const CARD_DIR = 'assets/FreeArtLib/cardgame/card';

/** 小丑牌额外素材（花色图标 / 参考图 / 灵魂牌 / 塔罗牌 / 星球牌）。 */
const GAME_E_EXTRA: ReadonlyArray<{ id: string; file: string; sub: string; name: string }> = [
  { id: 'je.suit.spades',        file: 'Spade_suit_icon.webp',     sub: 'suit-icon',  name: '♠ Spades' },
  { id: 'je.suit.hearts',        file: 'Heart_suit_icon.webp',     sub: 'suit-icon',  name: '♥ Hearts' },
  { id: 'je.suit.diamonds',      file: 'Diamond_suit_icon.webp',   sub: 'suit-icon',  name: '♦ Diamonds' },
  { id: 'je.suit.clubs',         file: 'Club_suit_icon.webp',      sub: 'suit-icon',  name: '♣ Clubs' },
  { id: 'je.ref.hands',          file: 'BalatroHands.webp',        sub: 'reference',  name: 'Hand Rankings' },
  { id: 'je.ref.blinds',         file: 'Blinds.webp',              sub: 'reference',  name: 'Blinds' },
  { id: 'je.ref.editions',       file: 'Editions.webp',            sub: 'reference',  name: 'Editions' },
  { id: 'je.ref.enhanced_cards', file: 'Enhanced_Cards.webp',      sub: 'reference',  name: 'Enhanced Cards' },
  { id: 'je.ref.vouchers',       file: 'Vouchers.webp',            sub: 'reference',  name: 'Vouchers' },
  { id: 'je.spectral.cryptid',   file: 'Spectral_Cryptid.webp',    sub: 'spectral',   name: 'Spectral: Cryptid' },
  { id: 'je.spectral.grim',      file: 'Spectral_Grim.webp',       sub: 'spectral',   name: 'Spectral: Grim' },
  { id: 'je.tarot.judgement',    file: 'Tarot_Judgement.webp',     sub: 'tarot',      name: 'Tarot: Judgement' },
  { id: 'je.tarot.the_fool',     file: 'Tarot_The_Fool.webp',      sub: 'tarot',      name: 'Tarot: The Fool' },
  { id: 'je.planet.eris',        file: 'Planet_Eris.webp',         sub: 'planet',     name: 'Planet: Eris' },
];

function gameEAssets(): StudioAsset[] {
  const rarityMap = new Map(JOKER_CATALOG.map((j) => [j.id, j.rarity]));
  const out: StudioAsset[] = [];

  for (const { id, file } of JOKER_ART_FILES) {
    const rarity = rarityMap.get(id) ?? 'common';
    out.push({
      id: jokerArtKey(id),
      type: 'texture',
      name: id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: `${CARD_DIR}/${file}`,
      status: 'filled',
      tags: ['小丑牌', 'joker', rarity],
      usedBy: [],
    });
  }

  for (const id of JOKER_ART_MISSING) {
    const rarity = rarityMap.get(id) ?? 'common';
    out.push({
      id: jokerArtKey(id),
      type: 'texture',
      name: id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: '暂缺图片',
      status: 'tbf',
      tags: ['小丑牌', 'joker', rarity],
      usedBy: [],
    });
  }

  for (const { id, file, sub, name } of GAME_E_EXTRA) {
    out.push({
      id,
      type: 'texture',
      name,
      description: `${CARD_DIR}/${file}`,
      status: 'filled',
      tags: ['小丑牌', sub],
      usedBy: [],
    });
  }

  return out;
}

// 通用扫描（无声明清单的游戏，如 demo）：从实体里扒 textureKey/clipId。
function scanBlueprintAssets(bp: WorldBlueprint): StudioAsset[] {
  const fields: Array<[string, string]> = [
    ['textureKey', 'texture'],
    ['clipId', 'sound'],
  ];
  const map = new Map<string, { type: string; usedBy: Set<string> }>();
  for (const [eid, comps] of Object.entries(bp.entities)) {
    for (const data of Object.values(comps as Record<string, unknown>)) {
      const d = data as Record<string, unknown>;
      for (const [f, type] of fields) {
        const v = d[f];
        if (typeof v === 'string' && v.length > 0) {
          let e = map.get(v);
          if (!e) map.set(v, (e = { type, usedBy: new Set() }));
          e.usedBy.add(eid);
        }
      }
    }
  }
  return [...map.entries()].map(([id, v]) => ({
    id,
    type: v.type,
    name: id,
    description: '',
    status: 'placeholder' as StudioAssetStatus,
    tags: [v.type],
    usedBy: [...v.usedBy].sort(),
  }));
}

// 和 assets/index.json 对照：命中则 index 的 tbf/filled 状态权威，补描述。
function crossRef(list: StudioAsset[], index: AssetIndex | null): StudioAsset[] {
  if (!index) return list;
  const byId = new Map(index.assets.map((a) => [a.id, a]));
  return list.map((a) => {
    const hit = byId.get(a.id);
    if (!hit) return a;
    return {
      ...a,
      status: hit.status,
      description: a.description || hit.description,
      tags: a.tags.includes(hit.type) ? a.tags : [...a.tags, hit.type],
    };
  });
}

export function studioAssets(
  gameId: string,
  bp: WorldBlueprint,
  index: AssetIndex | null,
): StudioAsset[] {
  let list: StudioAsset[];
  switch (gameId) {
    case 'game-e':
      list = gameEAssets();
      break;
    default:
      list = scanBlueprintAssets(bp);
  }
  return crossRef(list, index);
}

export interface AssetGroup {
  type: string;
  assets: StudioAsset[];
}

/** 按类型分组（组内按 id 排序，组按类型名排序）。供 UI 收缩排列。 */
export function groupByType(assets: readonly StudioAsset[]): AssetGroup[] {
  const map = new Map<string, StudioAsset[]>();
  for (const a of assets) {
    let g = map.get(a.type);
    if (!g) map.set(a.type, (g = []));
    g.push(a);
  }
  return [...map.entries()]
    .map(([type, as]) => ({ type, assets: as.slice().sort((x, y) => x.id.localeCompare(y.id)) }))
    .sort((x, y) => x.type.localeCompare(y.type));
}

/** tag/文本搜索：命中 id/name/description/type/tags/usedBy 任一即保留。 */
export function filterAssets(assets: readonly StudioAsset[], query: string): StudioAsset[] {
  const q = query.trim().toLowerCase();
  if (!q) return assets.slice();
  return assets.filter((a) =>
    [a.id, a.name, a.description, a.type, ...a.tags, ...a.usedBy].some((s) =>
      s.toLowerCase().includes(q),
    ),
  );
}
