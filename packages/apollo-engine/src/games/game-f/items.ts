// Game F · 装备道具库（Designer F 装备策划案 §一/§二/§三 程序化版）。
// 宪法合规：基底 / 词缀 / 命名传说 = **扁平数据**（最弱 LLM 可加一行扩库）；
// buildItemLib = **薄确定性展开器**（= Lead 已允的 makeRoundFlow/templatesFor 同款「扁平数据+薄展开」，
// 数据驱动≠零函数）。目标 600+ 件 = 46 基底 ×5 品级(230) + 蓝+ 词缀变体(~414) + 命名传说(36) ≈ 680。
// 零引擎：纯数据 + 纯函数，hp/atk 接战斗（heroes.finalHp/finalAtk），atkSpd/crit/move/effect 暂表现/待读者。

export type Slot = 'weapon' | 'armor' | 'mount' | 'trinket';
export type Rarity = 'white' | 'green' | 'blue' | 'purple' | 'orange';
export interface ItemStats { hp?: number; atk?: number; atkSpd?: number; crit?: number; move?: number }
export interface ItemDef {
  id: string; name: string; slot: Slot; rarity: Rarity;
  stats: ItemStats;
  effect?: string; // 特效文案（v1 仅文案；机制走锦囊式 caster/hitbox 后续片）
  desc: string;    // flavor（tooltip 显示）
  icon?: string;   // 美术 key（缺省按槽位占位）
}

// 品级（WoW 色阶）：color=tooltip/orb 染色；mul=数值倍率（§二）；prefix=程序化变体名前缀。
export const RARITY: Record<Rarity, { label: string; color: number; mul: number; prefix: string }> = {
  white: { label: '白', color: 0xc9c9c9, mul: 1.0, prefix: '破损的' },
  green: { label: '绿', color: 0x4caf50, mul: 1.6, prefix: '精良的' },
  blue: { label: '蓝', color: 0x3a8ee6, mul: 2.4, prefix: '卓越的' },
  purple: { label: '紫', color: 0xa056d6, mul: 3.4, prefix: '史诗的' },
  orange: { label: '橙', color: 0xe8902a, mul: 5.0, prefix: '传说的' },
};
export const RARITIES: Rarity[] = ['white', 'green', 'blue', 'purple', 'orange'];
const SLOT_ICON: Record<Slot, string> = { weapon: '🗡', armor: '🛡', mount: '🐎', trinket: '🔮' };

// —— §3.1 基底 bases（~46；扁平数据，含基础 stats + 三国名）——
interface Base { key: string; name: string; slot: Slot; stats: ItemStats; desc: string }
const WEAPON_BASES: Base[] = [
  { key: 'gudao', name: '古锭刀', slot: 'weapon', stats: { atk: 8 }, desc: '寻常军刀，聊胜于无' },
  { key: 'huanshou', name: '环首刀', slot: 'weapon', stats: { atk: 9 }, desc: '汉军制式，斩马断兵' },
  { key: 'changqiang', name: '长枪', slot: 'weapon', stats: { atk: 10 }, desc: '一寸长一寸强' },
  { key: 'gangqiang', name: '钢枪', slot: 'weapon', stats: { atk: 11 }, desc: '精钢枪头，透甲贯札' },
  { key: 'baojian', name: '宝剑', slot: 'weapon', stats: { atk: 10 }, desc: '君子之兵，锋藏鞘中' },
  { key: 'changjian', name: '长剑', slot: 'weapon', stats: { atk: 11 }, desc: '三尺青锋，临阵生光' },
  { key: 'huaji', name: '画戟', slot: 'weapon', stats: { atk: 13 }, desc: '戟分小枝，钩啄并用' },
  { key: 'fangtianji', name: '方天戟', slot: 'weapon', stats: { atk: 15 }, desc: '双月开刃，威重势沉' },
  { key: 'zhanfu', name: '战斧', slot: 'weapon', stats: { atk: 12 }, desc: '势大力沉，破甲裂盾' },
  { key: 'kaishanfu', name: '开山斧', slot: 'weapon', stats: { atk: 14 }, desc: '力士之兵，开山断石' },
  { key: 'tiechui', name: '铁锤', slot: 'weapon', stats: { atk: 13 }, desc: '钝器破甲，骨断筋折' },
  { key: 'liuxingchui', name: '流星锤', slot: 'weapon', stats: { atk: 12, move: 0.05 }, desc: '出其不意，攻其不备' },
  { key: 'changgong', name: '长弓', slot: 'weapon', stats: { atk: 11, atkSpd: 0.05 }, desc: '百步穿杨，先发制人' },
  { key: 'qiangnu', name: '强弩', slot: 'weapon', stats: { atk: 12, crit: 0.05 }, desc: '机括劲发，破阵摧坚' },
  { key: 'tiebian', name: '铁鞭', slot: 'weapon', stats: { atk: 10 }, desc: '节节生威，硬打硬架' },
  { key: 'shuangjian', name: '双锏', slot: 'weapon', stats: { atk: 11, atkSpd: 0.05 }, desc: '左右开弓，连环不绝' },
  { key: 'shemao', name: '蛇矛', slot: 'weapon', stats: { atk: 14 }, desc: '矛刃如蛇，挑刺难防' },
  { key: 'sanjian', name: '三尖两刃刀', slot: 'weapon', stats: { atk: 16 }, desc: '刃分三尖，势不可挡' },
];
const ARMOR_BASES: Base[] = [
  { key: 'pijia', name: '皮甲', slot: 'armor', stats: { hp: 60 }, desc: '寻常皮护，薄有遮挡' },
  { key: 'zhanpao', name: '锦战袍', slot: 'armor', stats: { hp: 90 }, desc: '御赐战袍，亦护亦威' },
  { key: 'suozi', name: '锁子甲', slot: 'armor', stats: { hp: 110 }, desc: '环环相扣，刀箭难入' },
  { key: 'lianhuan', name: '连环铠', slot: 'armor', stats: { hp: 130 }, desc: '甲叶连缀，刀剑不透' },
  { key: 'bintie', name: '镔铁铠', slot: 'armor', stats: { hp: 150, atk: 4 }, desc: '镔铁锻打，攻守兼备' },
  { key: 'linjia', name: '鳞甲', slot: 'armor', stats: { hp: 140 }, desc: '鱼鳞层叠，护体周全' },
  { key: 'shoumiankai', name: '兽面铠', slot: 'armor', stats: { hp: 160, move: 0.03 }, desc: '兽面狰狞，慑敌夺魄' },
  { key: 'zhongkai', name: '重铠', slot: 'armor', stats: { hp: 180 }, desc: '厚重沉稳，立如山岳' },
  { key: 'ruanwei', name: '软猬甲', slot: 'armor', stats: { hp: 120, crit: 0.03 }, desc: '柔韧贴身，暗藏锋芒' },
  { key: 'tengjia', name: '藤甲', slot: 'armor', stats: { hp: 200 }, desc: '浸油藤编，轻而难破（畏火）' },
];
const MOUNT_BASES: Base[] = [
  { key: 'xiliang', name: '西凉马', slot: 'mount', stats: { move: 0.1 }, desc: '西凉良驹，脚力尚可' },
  { key: 'dawanma', name: '大宛马', slot: 'mount', stats: { move: 0.13, hp: 20 }, desc: '汗血宝马，日行千里' },
  { key: 'wuzhui', name: '乌骓', slot: 'mount', stats: { move: 0.16 }, desc: '通体乌黑，霸王所乘' },
  { key: 'huangbiao', name: '黄骠马', slot: 'mount', stats: { move: 0.15, hp: 20 }, desc: '黄毛白点，神骏不凡' },
  { key: 'bailong', name: '白龙驹', slot: 'mount', stats: { move: 0.2, atkSpd: 0.03 }, desc: '白龙化马，常胜相随' },
  { key: 'taxue', name: '踏雪乌', slot: 'mount', stats: { move: 0.18 }, desc: '四蹄踏雪，疾行无声' },
  { key: 'qingcong', name: '青骢马', slot: 'mount', stats: { move: 0.2 }, desc: '青白相杂，骁腾善走' },
  { key: 'yinzong', name: '银鬃马', slot: 'mount', stats: { move: 0.25 }, desc: '银鬃如雪，奔逸绝尘' },
];
const TRINKET_BASES: Base[] = [
  { key: 'yinshou', name: '印绶', slot: 'trinket', stats: { hp: 20, atk: 3 }, desc: '微末官印，聊壮声势' },
  { key: 'lingpai', name: '督军令牌', slot: 'trinket', stats: { atk: 6 }, desc: '督军之令，鼓行而进' },
  { key: 'bingfu', name: '调兵虎符', slot: 'trinket', stats: { hp: 40, atk: 4 }, desc: '虎符在手，兵从将令' },
  { key: 'bingshu', name: '兵书', slot: 'trinket', stats: { atk: 6, crit: 0.05 }, desc: '兵法韬略，临阵生智' },
  { key: 'zhangu', name: '战鼓', slot: 'trinket', stats: { atkSpd: 0.05 }, desc: '擂鼓助威，士气如虹' },
  { key: 'shuaiqi', name: '帅旗', slot: 'trinket', stats: { hp: 30, atk: 3 }, desc: '帅旗所指，三军用命' },
  { key: 'huxinjing', name: '护心镜', slot: 'trinket', stats: { hp: 50 }, desc: '护住要害，临阵心安' },
  { key: 'yupei', name: '玉佩', slot: 'trinket', stats: { hp: 30 }, desc: '君子佩玉，温润护身' },
  { key: 'jinnang', name: '锦囊', slot: 'trinket', stats: { atkSpd: 0.05 }, desc: '拆之有计，临危不乱' },
  { key: 'fulu', name: '符箓', slot: 'trinket', stats: { crit: 0.05 }, desc: '道家符箓，禳灾趋吉' },
];
const ALL_BASES: Base[] = [...WEAPON_BASES, ...ARMOR_BASES, ...MOUNT_BASES, ...TRINKET_BASES]; // 46

// —— §3.3 词缀 affixes（~12；蓝及以上挂 1 条，改名 + 加一维属性）——
// delta = 该维基准增量（展开器按品级 mul 缩放数值维，crit/atkSpd/move 为小数维）。effect 词缀 v1 仅文案。
interface Affix { key: string; name: string; delta: ItemStats; effect?: string }
const AFFIXES: Affix[] = [
  { key: 'fengrui', name: '锋锐', delta: { atk: 6 } },
  { key: 'pojun', name: '破军', delta: { crit: 0.06 } },
  { key: 'jifeng', name: '疾风', delta: { atkSpd: 0.08 } },
  { key: 'benlei', name: '奔雷', delta: { move: 0.06 } },
  { key: 'xuanwu', name: '玄武', delta: { hp: 40 } },
  { key: 'jianbi', name: '坚壁', delta: { hp: 90 } },
  { key: 'jinggang', name: '精钢', delta: { hp: 30, atk: 4 } },
  { key: 'taotie', name: '饕餮', delta: {}, effect: '吸血回血' },
  { key: 'chiyan', name: '赤焰', delta: {}, effect: '命中灼烧' },
  { key: 'hanshuang', name: '寒霜', delta: {}, effect: '命中减速' },
  { key: 'bailian', name: '百炼', delta: { hp: 20, atk: 3, crit: 0.03 } },
  { key: 'wushuang', name: '无双', delta: { atk: 8, crit: 0.05, atkSpd: 0.05 } },
];
const AFFIX_RARITIES: Rarity[] = ['blue', 'purple', 'orange']; // 蓝+ 才挂词缀

// —— §3.4 命名传说 uniques（固定，带专属特效；也作展开器 stats 标尺）——
export const NAMED_UNIQUES: Record<string, ItemDef> = {
  w_qinggang: { id: 'w_qinggang', name: '青釭剑', slot: 'weapon', rarity: 'blue', stats: { atk: 22, crit: 0.1 }, desc: '削铁如泥，曹操佩剑' },
  w_gudingdao: { id: 'w_gudingdao', name: '七星宝刀', slot: 'weapon', rarity: 'purple', stats: { atk: 30, crit: 0.15 }, desc: '王允所赠，孟德献刀' },
  w_zhangba: { id: 'w_zhangba', name: '丈八蛇矛', slot: 'weapon', rarity: 'purple', stats: { atk: 28, atkSpd: 0.1 }, desc: '燕人张飞，当阳怒吼' },
  w_fangtian: { id: 'w_fangtian', name: '方天画戟', slot: 'weapon', rarity: 'orange', stats: { atk: 40, crit: 0.2 }, effect: '暴击溅射', desc: '人中吕布，戟指天下' },
  w_qinglong: { id: 'w_qinglong', name: '青龙偃月刀', slot: 'weapon', rarity: 'orange', stats: { atk: 44, atkSpd: 0.1 }, effect: '斩杀残血', desc: '关云长，温酒斩华雄' },
  w_cixiong: { id: 'w_cixiong', name: '雌雄双股剑', slot: 'weapon', rarity: 'blue', stats: { atk: 18, atkSpd: 0.15 }, desc: '刘备双剑，攻守兼备' },
  w_zhanjiang: { id: 'w_zhanjiang', name: '斩将刀', slot: 'weapon', rarity: 'green', stats: { atk: 14 }, desc: '阵前斩将，见血封侯' },
  w_dafu: { id: 'w_dafu', name: '开山大斧', slot: 'weapon', rarity: 'green', stats: { atk: 16 }, desc: '力士之兵，势大力沉' },
  w_liuxing: { id: 'w_liuxing', name: '流星锤·王双', slot: 'weapon', rarity: 'blue', stats: { atk: 20, move: 0.1 }, desc: '王双绝技，出其不意' },
  a_huanjia: { id: 'a_huanjia', name: '连环铠', slot: 'armor', rarity: 'blue', stats: { hp: 180 }, desc: '环环相扣，刀箭难入' },
  a_bintie: { id: 'a_bintie', name: '镔铁宝铠', slot: 'armor', rarity: 'blue', stats: { hp: 170, atk: 6 }, desc: '镔铁锻打，攻守兼备' },
  a_baiyin: { id: 'a_baiyin', name: '白银狮蛮铠', slot: 'armor', rarity: 'purple', stats: { hp: 260 }, desc: '银光夺目，马超之甲' },
  a_huangjin: { id: 'a_huangjin', name: '黄金锁子甲', slot: 'armor', rarity: 'orange', stats: { hp: 360, atk: 10 }, effect: '开战 3s 免控', desc: '黄金织甲，刀枪不入' },
  a_shoumian: { id: 'a_shoumian', name: '兽面吞头铠', slot: 'armor', rarity: 'purple', stats: { hp: 240, move: 0.05 }, desc: '兽面狰狞，慑敌夺魄' },
  a_tongque: { id: 'a_tongque', name: '铜雀重铠', slot: 'armor', rarity: 'blue', stats: { hp: 200 }, desc: '铜雀台造，厚重沉稳' },
  m_dawan: { id: 'm_dawan', name: '大宛宝马', slot: 'mount', rarity: 'green', stats: { move: 0.15, hp: 40 }, desc: '汗血宝马，日行千里' },
  m_jueying: { id: 'm_jueying', name: '绝影', slot: 'mount', rarity: 'blue', stats: { move: 0.2, atkSpd: 0.05 }, desc: '曹操坐骑，快如绝影' },
  m_zhuahuang: { id: 'm_zhuahuang', name: '爪黄飞电', slot: 'mount', rarity: 'blue', stats: { move: 0.2, hp: 60 }, desc: '通体雪白，蹄黄如电' },
  m_dilu: { id: 'm_dilu', name: '的卢', slot: 'mount', rarity: 'purple', stats: { move: 0.25, hp: 80 }, desc: '妨主之马，檀溪一跃' },
  m_chitu: { id: 'm_chitu', name: '赤兔马', slot: 'mount', rarity: 'orange', stats: { move: 0.3, atk: 12, atkSpd: 0.1 }, effect: '冲锋首击暴击', desc: '人中吕布，马中赤兔' },
  t_yinshou: { id: 't_yinshou', name: '金印紫绶', slot: 'trinket', rarity: 'white', stats: { hp: 30, atk: 4 }, desc: '微末官印，聊壮声势' },
  t_lingpai: { id: 't_lingpai', name: '督军令牌', slot: 'trinket', rarity: 'green', stats: { atk: 10, atkSpd: 0.05 }, desc: '督军之令，鼓行而进' },
  t_bingfu: { id: 't_bingfu', name: '调兵虎符', slot: 'trinket', rarity: 'blue', stats: { hp: 90, atk: 8 }, desc: '虎符在手，兵从将令' },
  t_bingshu: { id: 't_bingshu', name: '孟德新书', slot: 'trinket', rarity: 'blue', stats: { atk: 12, crit: 0.1 }, desc: '兵法韬略，临阵生智' },
  t_qimen: { id: 't_qimen', name: '奇门遁甲', slot: 'trinket', rarity: 'purple', stats: { crit: 0.2, atkSpd: 0.1 }, desc: '卧龙所授，鬼神莫测' },
  t_yuxi: { id: 't_yuxi', name: '传国玉玺', slot: 'trinket', rarity: 'orange', stats: { hp: 150, atk: 15 }, effect: '全队 +5% 攻光环', desc: '受命于天，既寿永昌' },
  t_qixing: { id: 't_qixing', name: '七星灯', slot: 'trinket', rarity: 'purple', stats: { hp: 120 }, desc: '续命禳星，五丈原夜' },
  t_jinnang: { id: 't_jinnang', name: '锦囊妙计', slot: 'trinket', rarity: 'green', stats: { atkSpd: 0.1 }, desc: '拆之有计，临危不乱' },
  t_taiping: { id: 't_taiping', name: '太平要术', slot: 'trinket', rarity: 'orange', stats: { hp: 100, atk: 12 }, effect: '开战回血', desc: '南华老仙，呼风唤雨' },
  t_zhumage: { id: 't_zhumage', name: '诸葛连弩图', slot: 'trinket', rarity: 'purple', stats: { atk: 20, atkSpd: 0.15 }, desc: '一弩十矢，机巧无双' },
  t_huxinjing: { id: 't_huxinjing', name: '护心宝镜', slot: 'trinket', rarity: 'green', stats: { hp: 80 }, desc: '护住要害，临阵心安' },
  t_hujiu: { id: 't_hujiu', name: '虎贲腰牌', slot: 'trinket', rarity: 'blue', stats: { hp: 100, atk: 6 }, desc: '虎贲卫士，以一当十' },
  w_gudao_unique: { id: 'w_gudao_unique', name: '古锭刀·孙坚', slot: 'weapon', rarity: 'green', stats: { atk: 16 }, desc: '孙坚旧物，江东之始' },
  a_pijia_unique: { id: 'a_pijia_unique', name: '一身是胆', slot: 'armor', rarity: 'purple', stats: { hp: 220, move: 0.05 }, effect: '残血免伤', desc: '子龙单骑，浑身是胆' },
  t_qiguang: { id: 't_qiguang', name: '七宝刀', slot: 'trinket', rarity: 'purple', stats: { atk: 18, crit: 0.1 }, desc: '七宝镶嵌，光华夺目' },
  // §7.5 补足 14 件凑满 50（特效 v1 仅文案，机制后续锦囊式 caster）。
  w_yitian: { id: 'w_yitian', name: '倚天剑', slot: 'weapon', rarity: 'orange', stats: { atk: 46, crit: 0.18 }, effect: '开战全队 +攻', desc: '曹操配剑，镇军威' },
  w_gulou: { id: 'w_gulou', name: '古锭巨阙', slot: 'weapon', rarity: 'purple', stats: { atk: 32 }, desc: '越王遗兵，断金切玉' },
  w_sanjian: { id: 'w_sanjian', name: '三尖刀', slot: 'weapon', rarity: 'blue', stats: { atk: 24, atkSpd: 0.08 }, desc: '二郎遗制，刃开三锋' },
  a_lianhuanma: { id: 'a_lianhuanma', name: '连环马铠', slot: 'armor', rarity: 'purple', stats: { hp: 250 }, desc: '铁骑连环，势不可当' },
  a_jinsuo: { id: 'a_jinsuo', name: '黄金锁子', slot: 'armor', rarity: 'orange', stats: { hp: 340, atk: 8 }, effect: '开战免控 3s', desc: '刀枪不入，马超之甲' },
  a_tengjiawang: { id: 'a_tengjiawang', name: '藤甲王', slot: 'armor', rarity: 'purple', stats: { hp: 230 }, effect: '受火伤+，余减伤', desc: '刀箭难入，畏火' },
  m_dawanwang: { id: 'm_dawanwang', name: '千里大宛', slot: 'mount', rarity: 'purple', stats: { move: 0.26, hp: 70 }, desc: '汗血神驹，日行千里' },
  m_zhaoyemulan: { id: 'm_zhaoyemulan', name: '照夜玉狮子', slot: 'mount', rarity: 'orange', stats: { move: 0.3, atk: 10 }, effect: '冲锋暴击', desc: '赵云白马，长坂七进出' },
  t_chuanguo: { id: 't_chuanguo', name: '传国玉玺', slot: 'trinket', rarity: 'orange', stats: { hp: 150, atk: 15 }, effect: '全队 +5% 攻光环', desc: '受命于天' },
  t_taipingyaoshu: { id: 't_taipingyaoshu', name: '太平要术', slot: 'trinket', rarity: 'orange', stats: { hp: 100, atk: 12 }, effect: '开战回血', desc: '南华老仙' },
  t_dunjia: { id: 't_dunjia', name: '奇门遁甲', slot: 'trinket', rarity: 'purple', stats: { crit: 0.2, atkSpd: 0.1 }, desc: '卧龙所授，鬼神莫测' },
  t_liannu: { id: 't_liannu', name: '诸葛连弩图', slot: 'trinket', rarity: 'purple', stats: { atk: 20, atkSpd: 0.15 }, desc: '一弩十矢，机巧无双' },
  t_qixingdeng: { id: 't_qixingdeng', name: '七星灯', slot: 'trinket', rarity: 'purple', stats: { hp: 120 }, desc: '续命禳星，五丈原夜' },
  t_dujiang: { id: 't_dujiang', name: '督将虎贲', slot: 'trinket', rarity: 'blue', stats: { hp: 100, atk: 6 }, desc: '虎贲卫士，以一当十' },
  w_shuangji: { id: 'w_shuangji', name: '双铁戟', slot: 'weapon', rarity: 'purple', stats: { atk: 30 }, desc: '古之恶来，典韦护主' },
};

// 数值缩放（hp/atk 整数；crit/atkSpd/move 小数维 3 位定点，避免浮点噪声；皆不入战斗 hash）。
const scaleStats = (s: ItemStats, mul: number): ItemStats => {
  const out: ItemStats = {};
  if (s.hp) out.hp = Math.round(s.hp * mul);
  if (s.atk) out.atk = Math.round(s.atk * mul);
  if (s.atkSpd) out.atkSpd = Math.round(s.atkSpd * mul * 1000) / 1000;
  if (s.crit) out.crit = Math.round(s.crit * mul * 1000) / 1000;
  if (s.move) out.move = Math.round(s.move * mul * 1000) / 1000;
  return out;
};
const addStats = (a: ItemStats, b: ItemStats): ItemStats => {
  const out: ItemStats = { ...a };
  for (const k of ['hp', 'atk', 'atkSpd', 'crit', 'move'] as (keyof ItemStats)[]) {
    if (b[k]) out[k] = Math.round(((out[k] ?? 0) + b[k]!) * 1000) / 1000;
  }
  return out;
};

// —— 薄确定性展开器：基底×品级(230) + 蓝+×3词缀(~414) + 命名传说(36) → 600+ 件 ——
export function buildItemLib(): Record<string, ItemDef> {
  const lib: Record<string, ItemDef> = {};
  ALL_BASES.forEach((base, bi) => {
    for (const rarity of RARITIES) {
      const r = RARITY[rarity];
      const baseStats = scaleStats(base.stats, r.mul);
      const id = `${base.key}__${rarity}`;
      lib[id] = { id, name: `${r.prefix}${base.name}`, slot: base.slot, rarity, stats: baseStats, desc: base.desc };
      // 词缀变体：蓝+ 才挂；每件挂 3 条确定性词缀（按基底序号散列，覆盖 12 词缀池）。
      if (AFFIX_RARITIES.includes(rarity)) {
        for (const off of [0, 4, 8]) {
          const affix = AFFIXES[(bi + off) % AFFIXES.length];
          const aid = `${id}__${affix.key}`;
          lib[aid] = {
            id: aid, name: `${affix.name}·${r.prefix}${base.name}`, slot: base.slot, rarity,
            stats: addStats(baseStats, scaleStats(affix.delta, r.mul)),
            ...(affix.effect ? { effect: affix.effect } : {}),
            desc: base.desc,
          };
        }
      }
    }
  });
  // 命名传说覆盖在最上（固定 id，不被程序化变体覆盖）。
  Object.assign(lib, NAMED_UNIQUES);
  return lib;
}

// 全库（模块加载一次展开；600+ 件）。
export const ITEM_LIB: Record<string, ItemDef> = buildItemLib();

// tooltip 图标：道具自带 icon 优先，否则按槽位占位；非库 id→📦。
export const itemIcon = (id: string): string => {
  const it = ITEM_LIB[id];
  return it?.icon ?? (it ? SLOT_ICON[it.slot] : '📦');
};

// —— §四 表现层助手（tooltip / 拾取掉落；纯表现/meta，不入战斗 hash）——
export const SLOT_LABEL: Record<Slot, string> = { weapon: '武器', armor: '盔甲', mount: '坐骑', trinket: '饰品' };
// 掉落品级权重（太阁越深越好为后续；v1 固定：白多橙极稀）。
export const RARITY_WEIGHT: Record<Rarity, number> = { white: 50, green: 28, blue: 15, purple: 6, orange: 1 };
// 按品级分桶（展开一次）。
const BY_RARITY: Record<Rarity, string[]> = (() => {
  const m: Record<Rarity, string[]> = { white: [], green: [], blue: [], purple: [], orange: [] };
  for (const it of Object.values(ITEM_LIB)) m[it.rarity].push(it.id);
  return m;
})();
// 掉落一件：先按权重选品级，再在该品级内均匀取一件（rnd 注入便于测试；meta 层，非确定性 hash）。
// depth（=关卡阶段-1，太阁越深越大）越高，蓝/紫/橙权重逐级放大 → 越深掉得越好（spec §二「掉率·太阁越深越好」）。
export function rollItemId(rnd: () => number = Math.random, depth = 0): string {
  const boost = 1 + Math.max(0, depth) * 0.5;
  const w: Record<Rarity, number> = {
    white: RARITY_WEIGHT.white,
    green: RARITY_WEIGHT.green,
    blue: RARITY_WEIGHT.blue * boost,
    purple: RARITY_WEIGHT.purple * boost * boost,
    orange: RARITY_WEIGHT.orange * boost * boost * boost,
  };
  let total = 0;
  for (const r of RARITIES) total += w[r];
  let x = rnd() * total;
  let pick: Rarity = 'white';
  for (const r of RARITIES) { x -= w[r]; if (x < 0) { pick = r; break; } }
  const pool = BY_RARITY[pick].length ? BY_RARITY[pick] : BY_RARITY.white;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}
// 属性格式化为 tooltip 行：hp/atk 整数，atkSpd/crit/move 百分比。
export function formatItemStats(stats: ItemStats): string[] {
  const out: string[] = [];
  if (stats.hp) out.push(`生命 +${stats.hp}`);
  if (stats.atk) out.push(`攻击 +${stats.atk}`);
  if (stats.atkSpd) out.push(`攻速 +${Math.round(stats.atkSpd * 100)}%`);
  if (stats.crit) out.push(`暴击 +${Math.round(stats.crit * 100)}%`);
  if (stats.move) out.push(`移速 +${Math.round(stats.move * 100)}%`);
  return out;
}
// tooltip 结构（名 + 品级色 + 槽位 + 属性行 + 功效 + 描述）；非库 id→null。
export function itemTip(id: string): { name: string; color: string; rarityLabel: string; slotLabel: string; stats: string[]; effect?: string; desc: string } | null {
  const it = ITEM_LIB[id];
  if (!it) return null;
  const r = RARITY[it.rarity];
  return {
    name: it.name, color: `#${r.color.toString(16).padStart(6, '0')}`, rarityLabel: r.label,
    slotLabel: SLOT_LABEL[it.slot], stats: formatItemStats(it.stats), effect: it.effect, desc: it.desc,
  };
}
