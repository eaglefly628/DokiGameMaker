import type { AssetManifest } from '@assets/index.js';

// Game F 美术资产清单（R9 TBF）—— 纯数据（声明 key → 占位图）。sim 只引用 textureKey，像素活在资产层、不进 hash。
// 占位 = 内联 SVG 势力色棋子 token（无外部文件即可验证数据驱动管线 + 真穿皮）；真美术走 DCSS 换皮
// （见 docs/game-design/game-f-art-data.md：每个英雄 key → 一张 FreeArtLib DCSS sprite.character，逻辑零改穿皮）。
const svg = (body: string, w: number, h: number): string =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)}`;

// 英雄皮 = 真 DCSS 角色图（assets/FreeArtLib/monster/<name>.png，32×32，CC0；同 game-e 路径加载）。
// 注：DCSS 是奇幻角色图、固定色；势力(蜀魏吴)由头顶名字颜色 + 棋盘半场体现（drawImage 不吃 tint，见 art-data.md §C）。
// 资源前缀：dev/web='/'、烧录(electron file://, base './')='./' —— 让文件路径在两边都解析（同 game-e）。
// 仅作用于真文件(dcss/fx)；下方 svg() 产的是 data: URL，绝不能加前缀。
const ASSET_BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const dcss = (name: string): string => `${ASSET_BASE}assets/FreeArtLib/monster/${name}.png`;
const fx = (name: string): string => `${ASSET_BASE}assets/FreeArtLib/effect/${name}.png`; // 打斗特效图（DCSS effect/，已逐像素验过）

// 英雄 textureKey（每英雄唯一 → 后期 1:1 换 DCSS 皮，见 art-data.md）。
export const F_HERO = {
  guan_yu: 'f.hero.guan_yu',
  zhao_yun: 'f.hero.zhao_yun',
  zhuge_liang: 'f.hero.zhuge_liang',
  zhang_fei: 'f.hero.zhang_fei', // 蜀·张飞（世界观修正：单机纯蜀，替原跨势力周瑜）
  ma_chao: 'f.hero.ma_chao', // 蜀·马超（6 将库扩充，商店专属）
  huang_zhong: 'f.hero.huang_zhong', // 蜀·黄忠（射手）
  cao_ren: 'f.hero.cao_ren', // 魏·曹仁（对称扩充）
  dian_wei: 'f.hero.dian_wei', // 魏·典韦
  zhang_liao: 'f.hero.zhang_liao',
  xu_chu: 'f.hero.xu_chu',
  sima_yi: 'f.hero.sima_yi',
  xiahou_dun: 'f.hero.xiahou_dun', // 魏·夏侯惇（替原跨势力甘宁）
  zhou_yu: 'f.hero.zhou_yu', // 吴（合作模式 孙刘抗曹 用；野怪皮借用）
  gan_ning: 'f.hero.gan_ning', // 吴（野怪皮借用）
  lv_meng: 'f.hero.lv_meng', // 吴·吕蒙（白衣渡江 队长刺客）
  tai_shici: 'f.hero.tai_shici', // 吴·太史慈（远程刺客）
  ling_tong: 'f.hero.ling_tong', // 吴·凌统（刺客）
  sun_ce: 'f.hero.sun_ce', // 吴·孙策（前排坦）
  protag: 'f.hero.protag', // 主公小小英雄 = 独特奇异生物（金龙，非真人/非在册英雄）
} as const;
export const F_FX_STRIKE = 'f.fx.strike'; // 近战斩光（SVG）
export const F_FX_ARROW = 'f.fx.arrow'; // 远程箭
export const F_FX_BOLT = 'f.fx.bolt'; // 法术弹
export const F_FX_FLAME = 'f.fx.flame'; // 火（含 DoT 灼烧）
export const F_FX_FROST = 'f.fx.frost'; // 冰
export const F_FX_DRAIN = 'f.fx.drain'; // 暗/吸取（含 DoT）
export const F_HEX_WARM = 'f.hex.warm'; // 蜀半场暖色六边形格
export const F_HEX_COOL = 'f.hex.cool'; // 魏半场冷色六边形格
export const F_PEDESTAL = 'f.bench.pedestal'; // 备战席石墩台座（朴素香台式，每槽一个）
export const F_THRONE = 'f.protag.throne'; // 主公宝座（金漆，棋盘左下角主公归位处）
// 太阁守军 足轻皮（T1，渡海征日守岛方；DCSS 杂兵图换皮，逻辑零改）。
export const F_TAIKOU = {
  yari: 'f.taikou.yari', // 枪足轻（近战）
  yumi: 'f.taikou.yumi', // 弓足轻（远程）
  teppo: 'f.taikou.teppo', // 铁炮足轻（远程爆发）
  kunoichi: 'f.taikou.kunoichi', // 杂兵忍（近战骚扰）
  // 国人众部将（中盘）
  saito: 'f.taikou.saito', mori: 'f.taikou.mori', hojo: 'f.taikou.hojo',
  imagawa: 'f.taikou.imagawa', akechi: 'f.taikou.akechi', ishida: 'f.taikou.ishida',
  // 天守 Boss（终盘轮换）
  nobunaga: 'f.taikou.nobunaga', hideyoshi: 'f.taikou.hideyoshi', ieyasu: 'f.taikou.ieyasu',
  honganji: 'f.taikou.honganji', shingen: 'f.taikou.shingen', kenshin: 'f.taikou.kenshin',
  yukimura: 'f.taikou.yukimura', masamune: 'f.taikou.masamune', shimazu: 'f.taikou.shimazu',
  tachibana: 'f.taikou.tachibana', hattori: 'f.taikou.hattori',
} as const;

// 一块六边形棋盘格（pointy-top 尖顶，描边镂空；尺寸 40×46 贴合格距 TILE=40/行距30，不重叠）。
// 锦霞（Aurora）重染：半透明让战场底透出（design §3 中战场），描金细线 = --hairline 语言。
const hexTile = (fill: string, stroke: string): string =>
  svg(`<polygon points="20,1 39,12 39,34 20,45 1,34 1,12" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`, 40, 46);

export const GAME_F_ASSETS: AssetManifest = [
  // 蜀（关羽 死亡骑士 / 赵云 深渊精灵骑士 / 诸葛 深渊精灵法师 / 张飞 兽人骑士）
  { kind: 'texture', key: F_HERO.guan_yu, src: dcss('death_knight'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.zhao_yun, src: dcss('deep_elf_knight_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.zhuge_liang, src: dcss('deep_elf_mage'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.zhang_fei, src: dcss('orc_knight_new'), width: 32, height: 32 },
  // 魏（张辽 地狱骑士 / 许褚 深渊精灵兵 / 司马 死灵法师 / 夏侯惇 矮人死亡骑士）
  { kind: 'texture', key: F_HERO.zhang_liao, src: dcss('hell_knight_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.xu_chu, src: dcss('deep_elf_soldier'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.sima_yi, src: dcss('necromancer_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.xiahou_dun, src: dcss('deep_dwarf_death_knight'), width: 32, height: 32 },
  // 吴（合作/野怪皮借用）+ 主公金龙（独特生物）
  { kind: 'texture', key: F_HERO.zhou_yu, src: dcss('deep_elf_sorcerer'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.gan_ning, src: dcss('deep_elf_blademaster'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.lv_meng, src: dcss('deep_elf_annihilator'), width: 32, height: 32 }, // 吕蒙（原 deep_elf_assassin 不存在→404；换现存近战图）
  { kind: 'texture', key: F_HERO.tai_shici, src: dcss('deep_elf_master_archer'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.ling_tong, src: dcss('deep_elf_knight_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.sun_ce, src: dcss('orc_warlord'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.ma_chao, src: dcss('centaur_warrior'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.huang_zhong, src: dcss('deep_elf_master_archer'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.cao_ren, src: dcss('orc_warlord'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.dian_wei, src: dcss('minotaur'), width: 32, height: 32 },
  { kind: 'texture', key: F_HERO.protag, src: dcss('golden_dragon'), width: 32, height: 32 },
  // 太阁守军 足轻（枪=哥布林兵 / 弓=豺狼 / 铁炮=狗头人 / 忍=大哥布林；DCSS 杂兵换皮，逻辑零改）。
  { kind: 'texture', key: F_TAIKOU.yari, src: dcss('goblin_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.yumi, src: dcss('gnoll_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.teppo, src: dcss('kobold_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.kunoichi, src: dcss('hobgoblin_new'), width: 32, height: 32 },
  // 国人众部将（DCSS 占位：蝮=蛇法 / 厚血=铁巨魔 / 弓=蛇射手 / 控=蛇仪祭 / 辅=高阶祭司）
  { kind: 'texture', key: F_TAIKOU.saito, src: dcss('naga_mage'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.mori, src: dcss('ettin_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.hojo, src: dcss('iron_troll'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.imagawa, src: dcss('naga_sharpshooter'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.akechi, src: dcss('naga_ritualist'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.ishida, src: dcss('deep_elf_high_priest'), width: 32, height: 32 },
  // 天守 Boss（DCSS 占位巨怪/恶魔；正式像素三国/战国美术后续换皮）
  { kind: 'texture', key: F_TAIKOU.nobunaga, src: dcss('juggernaut'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.hideyoshi, src: dcss('hill_giant_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.ieyasu, src: dcss('frost_giant_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.honganji, src: dcss('deep_elf_demonologist'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.shingen, src: dcss('cyclops_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.kenshin, src: dcss('demonspawn'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.yukimura, src: dcss('fire_giant_new'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.masamune, src: dcss('naga_warrior_unique'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.shimazu, src: dcss('deep_troll'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.tachibana, src: dcss('deep_troll_berserker'), width: 32, height: 32 },
  { kind: 'texture', key: F_TAIKOU.hattori, src: dcss('naga'), width: 32, height: 32 },
  // 备战席石墩台座（朴素灰石，圆墩 + 浅色顶沿 + 竖纹；像放香炉的台座）。
  { kind: 'texture', key: F_PEDESTAL, src: svg(`<ellipse cx="20" cy="7" rx="13" ry="3.5" fill="#cfc7b8"/><path d="M7 7 L33 7 L30 25 L10 25 Z" fill="#a79e8d"/><path d="M7 7 L33 7 L31.5 10 L8.5 10 Z" fill="#ddd5c6"/><ellipse cx="20" cy="25" rx="11" ry="3.5" fill="#8f8675"/><path d="M14 11 L13 23 M20 11 L20 23 M26 11 L27 23" stroke="#8a8170" stroke-width="0.6" opacity="0.5"/>`, 40, 32), width: 40, height: 32 },
  // 主公宝座（金漆雕座 + 顶宝珠；金铲铲式归位台座感）。
  { kind: 'texture', key: F_THRONE, src: svg(`<circle cx="20" cy="4" r="2.2" fill="#ffcb3d"/><path d="M9 7 Q20 -1 31 7 L31 11 L9 11 Z" fill="#d8a44e"/><rect x="11" y="9" width="18" height="19" rx="2" fill="#caa24e"/><rect x="7" y="19" width="4" height="13" rx="1.5" fill="#caa24e"/><rect x="29" y="19" width="4" height="13" rx="1.5" fill="#caa24e"/><rect x="9" y="24" width="22" height="7" fill="#a8863a"/><rect x="12" y="31" width="16" height="10" fill="#8a6e2e"/>`, 40, 46), width: 40, height: 46 },
  // 普攻打击特效：黄白斩光。
  {
    kind: 'texture',
    key: F_FX_STRIKE,
    src: svg(
      `<path d="M4 19 L20 5" stroke="rgba(255,240,180,0.95)" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<path d="M8 20 L21 9" stroke="rgba(255,200,90,0.65)" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      24,
      24,
    ),
    width: 24,
    height: 24,
  },
  // 打斗特效（DCSS effect/，32×32，逐像素验过）：箭 / 法弹 / 火 / 冰 / 暗。
  { kind: 'texture', key: F_FX_ARROW, src: fx('arrow_2'), width: 32, height: 32 },
  { kind: 'texture', key: F_FX_BOLT, src: fx('magic_bolt_3'), width: 32, height: 32 },
  { kind: 'texture', key: F_FX_FLAME, src: fx('flame_1'), width: 32, height: 32 },
  { kind: 'texture', key: F_FX_FROST, src: fx('frost_0'), width: 32, height: 32 },
  { kind: 'texture', key: F_FX_DRAIN, src: fx('drain_0_new'), width: 32, height: 32 },
  // 六边形棋盘格（蜀半场暖 / 魏半场冷）。
  { kind: 'texture', key: F_HEX_WARM, src: hexTile('rgba(251,238,228,0.62)', 'rgba(216,164,78,0.85)'), width: 40, height: 46 }, // 蜀半场：暖珍珠+描金（半透明让战场透出）
  { kind: 'texture', key: F_HEX_COOL, src: hexTile('rgba(233,236,246,0.62)', 'rgba(138,160,230,0.8)'), width: 40, height: 46 }, // 魏半场：雾青+柔蓝描线（半透明让战场透出）
];
