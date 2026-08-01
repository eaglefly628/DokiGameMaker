// Game F · 常量与底层助手（从 blueprint.ts 拆出；位/色/节奏/字体/几何助手）。
// 叶子模块：位/色/节奏/字体 + xf/sprite/zlift 几何助手，被 heroes/combat/blueprint 复用。

// 阵营（Tag.flags）。蜀=TEAM_A，魏=TEAM_B。ZONE_FLAG(=1<<0) 由 trigger-zone 约定，留给打击区。
export const TEAM_A = 1 << 1; // 蜀
export const TEAM_B = 1 << 2; // 魏
// 势力色（Color.tint；drawImage 不吃 tint，由头顶名字 Text 承担分色）。
export const SHU_RED = 0xd8504e; // 蜀红
export const WEI_BLUE = 0x3a86d4; // 魏蓝
export const WU_GREEN = 0x3fae6e; // 吴绿
// 职业位（Tag.flags，特色/羁绊基础；与队伍位独立）。
export const WARRIOR = 1 << 6; // 武将
export const TACTICIAN = 1 << 7; // 谋士
export const ASSASSIN = 1 << 8; // 刺客
// 势力位（羁绊基础；与队伍/职业位独立）。
export const FACT_SHU = 1 << 3; // 蜀
export const FACT_WEI = 1 << 4; // 魏
export const FACT_WU = 1 << 5; // 吴
// CC 状态位（写在 Status.flags）。
export const FROZEN = 1 << 10; // 冰冻定身（REQ-F-030）
export const PROTAG = 1 << 11; // 主角（小小英雄）
export const LOOT = 1 << 12; // 法球/掉落
export const BAG = 1 << 21; // 主公行囊（收集装备 orb）；⚠ 不可用 1<<19——与 MARKER_VIS 撞位会让隐形收集框在备战期被 marker_show 点亮、糊住整盘六角格（实测回归）
export const EQUIP = 1 << 20; // 装备 orb（战中敌死掉落）
export const SHOPSLOT_BITS = [1 << 13, 1 << 14, 1 << 15]; // 三大框
export const RUNE = 1 << 18; // 开局符文卡
export const SHOPSLOT_ALL = SHOPSLOT_BITS.reduce((a, b) => a | b, 0);
export const BENCH_OCC = 1 << 25; // 席位 marker 位（不含 TEAM → 不参战）
export const MARKER_VIS = 1 << 19; // marker 显隐位（战斗期隐藏）；独占此位——勿与任何「带 Visibility 的常驻实体」标位撞（撞位会被相位 set-visible-tagged 误翻）
export const PROJ = 1 << 26; // 在飞弹道（庆祝拍清扫）
export const RESULT = 1 << 27; // 战果面板行
export const BUSHO = 1 << 28; // 太阁部将位（国人众/天守 Boss）：毛利·三矢「部将≥3 全军 buff」group-count 用
export const BOW = 1 << 29; // 太阁弓兵位（远程 mob）：今川·弓阵「弓≥3 全军 buff」group-count 用
export const ENCHANT_MUL = 0.2; // 附魔：assembleDeck 时该卡 CardSpec 数值 ×(1 + ENCHANT_MUL×级)（Balatro modifier；designer #22）

// 战斗节奏（数据）。
export const MOVE_PERIOD = 48; // 每 48 tick 走一格 ≈ 0.8s
export const ATK_CD = 45; // 普攻间隔 45 tick ≈ 0.75s
export const MANA_REGEN = { period: 9, amount: 4 }; // 时基回蓝
export const HP_SCALE = 18; // 全局血量倍率（调战斗时长）

// 字体槽（design_handoff §Typography；字体文件由 game-f.tsx 加载，canvas 仅引用族名）。
export const FONT_DISPLAY = "'Ma Shan Zheng','Noto Serif SC',serif"; // 大标题/横幅
export const FONT_BODY = "'Noto Serif SC',serif"; // 正文/名牌
export const FONT_NUM = "'Silkscreen','Noto Serif SC',monospace"; // 数字（像素风）

export const xf = (x: number, y: number): Record<string, unknown> => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
export const sprite = (textureKey: string, zOrder: number): Record<string, unknown> => ({ textureKey, anchorX: 0.5, anchorY: 0.5, zOrder });
// Shape 抬层 hack：永不注册的贴图 key → spriteReady 恒 false → 退化画 Shape，但 zOrder 取自 Sprite。
export const zlift = (zOrder: number): Record<string, unknown> => ({ textureKey: '__zlift__', anchorX: 0.5, anchorY: 0.5, zOrder });
// （chrome 底盘工厂已去腐：调用点展平为字面 edge+bg 双 Shape，见 blueprint.ts）
