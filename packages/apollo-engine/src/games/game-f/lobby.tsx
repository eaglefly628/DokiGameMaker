// Game F · 局外大厅 Lobby（按 docs/design/game-f-lobby-brief.md 7 屏 IA 实装）。
// 与确定性引擎解耦：纯前端 + 假数据；只在「开始攻岛」那刻产出一份「出战牌组+势力+队伍配置」交给 onStart。
// 局内对局由 game-f.tsx 的 startMatch 接手。视觉基调=绢帛暖米+水墨黑（brief §二），class 前缀 gfl- 防与局内 gfx- 撞。
import { type Deck, type Faction, HUBAO_DECK, DECK_REGISTRY } from './index.js';
import { getWarfunds, gachaPull, gachaPull10, getCollection, GACHA_COST, GACHA10_COST, getLP, rankFor, saveCustomDeck, getDust, getEnchantLevels, enchantCard, disenchant, ENCHANT_MAX, enchantCost } from './account.js';
import { CARD_CATALOG, assembleDeck } from './decks.js';
import TUTORIAL_HTML from '../../../docs/game-design/game-f-tutorial.html?raw'; // P2：新手教程页内联进弹层 iframe

export interface RunConfig {
  deck: Deck;
  faction: Faction;
  allies?: Faction[]; // 组队房 2 席盟友阵营（slice3；缺省 吴/魏 AI 补位）
}

const LOBBY_CSS = `
.gfl{--paper:#f3e9d6;--paper-2:#ece0c8;--paper-3:#e3d4b6;--ink:#23262d;--ink-dim:#6a6256;--hairline:#cdbb98;
  --shu:#2f9e7e;--wei:#3a6ea5;--wu:#c0432f;--qun:#6b6e76;--r-green:#5fae6e;--r-blue:#4a86d4;--r-purple:#9b6dd8;--r-orange:#e08a3c;
  --seal:#b5402f;--gold:#c9a24e;--shadow:0 10px 30px rgba(80,55,30,.18);
  width:1180px;background:var(--paper);border:1px solid var(--hairline);border-radius:16px;box-shadow:var(--shadow);
  overflow:hidden;display:flex;flex-direction:column;min-height:760px;font-family:"PingFang SC","Noto Serif SC",serif;color:var(--ink);}
.gfl-top{display:flex;align-items:center;gap:14px;padding:12px 18px;background:linear-gradient(180deg,#2b2f37,#23262d);color:#f3e9d6;border-bottom:3px solid var(--gold);}
.gfl-av{width:40px;height:40px;border-radius:10px;background:var(--shu);display:flex;align-items:center;justify-content:center;font-size:22px;border:2px solid var(--gold);}
.gfl-rank{margin-left:6px;padding:4px 10px;border-radius:999px;background:rgba(201,162,78,.18);border:1px solid var(--gold);font-size:12px;color:#f0d99a;white-space:nowrap;}
.gfl-cur{margin-left:auto;display:flex;gap:8px;}
.gfl-chip{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 11px;font-size:12.5px;}
.gfl-tabs{display:flex;gap:4px;padding:8px 16px 0;background:var(--paper-2);border-bottom:1px solid var(--hairline);}
.gfl-tab{padding:9px 16px;border:1px solid transparent;border-bottom:none;border-radius:10px 10px 0 0;cursor:pointer;font-weight:700;font-size:13.5px;color:var(--ink-dim);}
.gfl-tab:hover{color:var(--ink);}
.gfl-tab.on{background:var(--paper);color:var(--ink);border-color:var(--hairline);box-shadow:0 -2px 0 var(--seal) inset;}
.gfl-body{display:flex;flex:1;}
.gfl-screen{flex:1;padding:18px;display:none;}
.gfl-screen.on{display:block;}
.gfl-friends{width:228px;border-left:1px solid var(--hairline);background:var(--paper-2);padding:14px;flex:none;}
.gfl h2{margin:0 0 4px;font-size:18px;letter-spacing:1px;}
.gfl-sub{color:var(--ink-dim);font-size:12.5px;margin-bottom:14px;}
.gfl-tag{display:inline-block;background:var(--seal);color:#fbe7d8;font-size:11px;border-radius:4px;padding:2px 7px;margin-left:8px;}
.gfl-island{position:relative;height:300px;border-radius:14px;overflow:hidden;border:1px solid var(--hairline);
  background:radial-gradient(120% 80% at 50% 110%,#b9d6c0 0%,#9fc4ab 30%,transparent 60%),radial-gradient(60% 50% at 70% 40%,#d8e3c2 0%,transparent 70%),linear-gradient(180deg,#bcd3e0,#a9c3d4 45%,#86a2b3);}
.gfl-island .lbl{position:absolute;left:16px;top:14px;background:rgba(35,38,45,.72);color:#f3e9d6;font-size:12px;padding:5px 12px;border-radius:999px;border:1px solid var(--gold);}
.gfl-castle{position:absolute;font-size:20px;}.gfl-fleet{position:absolute;font-size:22px;}
.gfl-cta-wrap{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);text-align:center;width:84%;}
.gfl-cta{display:block;width:100%;padding:15px;border:none;border-radius:12px;cursor:pointer;background:linear-gradient(180deg,#c75a3f,#a8402c);color:#fff5ec;font-size:18px;font-weight:800;letter-spacing:3px;box-shadow:0 6px 16px rgba(150,50,30,.4);border:1px solid #e08a6f;}
.gfl-cta:hover{filter:brightness(1.06);}
.gfl-cta-row{display:flex;gap:10px;margin-top:10px;}
.gfl-btn{flex:1;padding:11px;border:1px solid var(--hairline);background:var(--paper);border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;color:var(--ink);}
.gfl-btn:hover{background:var(--paper-3);}
.gfl-banner{margin-top:14px;background:var(--paper-2);border:1px solid var(--hairline);border-left:4px solid var(--gold);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--ink-dim);}
.gfl-quick{display:flex;gap:10px;margin-top:14px;}
.gfl-qcard{flex:1;background:var(--paper-2);border:1px solid var(--hairline);border-radius:10px;padding:12px;cursor:pointer;font-size:13px;}
.gfl-qcard:hover{background:var(--paper-3);}
.gfl-frow{display:flex;align-items:center;gap:8px;padding:8px 6px;border-radius:8px;font-size:13px;}
.gfl-fdot{width:9px;height:9px;border-radius:50%;flex:none;}
.gfl-on{background:var(--shu);}.gfl-off{background:#b3a98f;}
.gfl-fstat{margin-left:auto;font-size:11px;color:var(--ink-dim);}
.gfl-seats{display:flex;gap:16px;margin:8px 0 18px;}
.gfl-seat{flex:1;border:1px solid var(--hairline);border-radius:14px;padding:16px;background:var(--paper-2);min-height:190px;display:flex;flex-direction:column;gap:8px;}
.gfl-seat.host{border-color:var(--gold);box-shadow:0 0 0 2px rgba(201,162,78,.25) inset;}
.gfl-seat.empty{border-style:dashed;align-items:center;justify-content:center;color:var(--ink-dim);text-align:center;cursor:pointer;}
.gfl-seat.empty:hover{background:var(--paper-3);}
.gfl-face{width:54px;height:54px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;border:2px solid var(--gold);}
.gfl-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;color:#fff;}
.gfl-ready{color:var(--shu);font-weight:700;font-size:12.5px;}.gfl-pending{color:var(--ink-dim);font-size:12.5px;}
.gfl-config{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--paper-2);border:1px solid var(--hairline);border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;}
.gfl-fac{padding:5px 12px;border-radius:8px;border:1px solid var(--hairline);cursor:pointer;font-weight:700;font-size:12.5px;background:var(--paper);}
.gfl-fac.sel{color:#fff;border-color:transparent;}
.gfl-start-row{display:flex;gap:12px;justify-content:flex-end;align-items:center;}
.gfl-grid{display:flex;gap:14px;flex-wrap:wrap;}
.gfl-deck{width:178px;border:1px solid var(--hairline);border-radius:12px;background:var(--paper-2);padding:13px;cursor:pointer;}
.gfl-deck:hover{background:var(--paper-3);box-shadow:var(--shadow);}
.gfl-deck.sel{border-color:var(--seal);box-shadow:0 0 0 2px rgba(181,64,47,.25) inset;}
.gfl-dn{font-weight:800;font-size:15px;}.gfl-ds{font-size:12px;color:var(--ink-dim);margin:3px 0 8px;}
.gfl-cmpl{font-size:11.5px;color:var(--ink-dim);margin-top:8px;}
.gfl-prev{margin-top:16px;border:1px solid var(--hairline);border-radius:12px;background:var(--paper-2);padding:16px;}
.gfl-slots{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
.gfl-slot{width:96px;height:58px;border:1px solid var(--hairline);border-radius:8px;background:var(--paper);display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;padding:4px;}
.gfl-slot.key{border-color:var(--gold);box-shadow:0 0 0 2px rgba(201,162,78,.3) inset;font-weight:800;}
.gfl-slot.empty{border-style:dashed;color:var(--ink-dim);}
.gfl-cards{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;}
.gfl-card{border:2px solid #c4c7cc;border-radius:10px;background:var(--paper-2);padding:10px;text-align:center;cursor:pointer;position:relative;}
.gfl-card:hover{background:var(--paper-3);}
.gfl-card .ic{font-size:26px;}.gfl-card .cn{font-size:12px;font-weight:700;margin-top:4px;}
.gfl-card .own{position:absolute;right:6px;top:4px;font-size:10px;color:var(--ink-dim);}
.gfl-card.locked{opacity:.5;}
.gfl-rg{border-color:var(--r-green);}.gfl-rb{border-color:var(--r-blue);}.gfl-rp{border-color:var(--r-purple);}.gfl-ro{border-color:var(--r-orange);}
.gfl table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;}
.gfl th,.gfl td{padding:9px 12px;border-bottom:1px solid var(--hairline);text-align:left;}
.gfl th{color:var(--ink-dim);font-weight:700;font-size:12px;}
.gfl-up{color:var(--shu);}.gfl-down{color:var(--wu);}
.gfl-mini{padding:4px 12px;border:1px solid var(--hairline);background:var(--paper);border-radius:7px;cursor:pointer;font-size:12px;}
.gfl-filters{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.gfl-fbtn{padding:5px 12px;border:1px solid var(--hairline);background:var(--paper-2);border-radius:999px;font-size:12px;cursor:pointer;}
.gfl-toast{position:absolute;right:30px;bottom:26px;background:#23262d;color:#f3e9d6;border:1px solid var(--gold);border-radius:12px;padding:13px 16px;font-size:13px;box-shadow:var(--shadow);display:flex;gap:12px;align-items:center;max-width:330px;}
.gfl-toast button{padding:4px 12px;border-radius:7px;border:none;cursor:pointer;font-weight:700;font-size:12px;}
.gfl-acc{background:var(--shu);color:#fff;}.gfl-dec{background:rgba(255,255,255,.12);color:#f3e9d6;}
`;

// 假数据（对齐 deck-spec.md / lobby-brief 假数据形）。
interface DeckCardView { id: string; name: string; icon: string; style: string; key: string; cards: string[]; complete: string; counter: string; power: string; locked?: boolean }
const DECKS: DeckCardView[] = [
  { id: 'hubao', name: '虎豹铁骑', icon: '⚔️', style: '魏·速攻', key: '虎豹骑令', cards: ['虎豹骑令', '速攻令', '募兵', '铁骑突阵', '星球·魏'], complete: '5/5（已实装）', counter: '克→经济 · 被克→控制', power: '★★★☆' },
  { id: 'hanshi', name: '兴复汉室', icon: '🛡️', style: '蜀·连携', key: '桃园誓', cards: ['桃园誓', '章武', '募贤'], complete: '3/3（已实装）', counter: '克→中期肥 · 被克→速攻', power: '★★★' },
  { id: 'chibi', name: '赤壁火攻', icon: '🔥', style: '吴·灼烧', key: '东南风', cards: ['东南风', '连营', '苦肉计', '火油', '星球·火'], complete: '5/5', counter: '克→人海 · 被克→护盾', power: '★★★☆' },
  { id: 'wolong', name: '卧龙八阵', icon: '❄️', style: '谋士·控制', key: '八阵图', cards: ['八阵图', '锁定', '空城计', '借东风', '星球·谋'], complete: '5/5', counter: '克→慢耗 · 被克→刺客绕后', power: '★★★★' },
  { id: 'baiyi', name: '白衣渡江', icon: '🗡️', style: '吴·刺客斩首', key: '白衣', cards: ['白衣', '锦帆', '募刺'], complete: '3/3（已实装·单机吴）', counter: '克→单核厚血 · 被克→低血海', power: '★★★★' },
  { id: 'tuntian', name: '屯田积粟', icon: '🌾', style: '经济·Greed', key: '屯田', cards: ['屯田', '重农', '募农'], complete: '3/3（已实装）', counter: '克→长局对耗 · 被克→速攻', power: '★★★' },
  { id: 'yizhan', name: '以战养战', icon: '🪤', style: '降将·混血', key: '招降令', cards: ['招降令', '以战养战', '质子为质', '以夷制夷', '养寇自重'], complete: '5/5', counter: '克→密集杂兵 · 被克→精英Boss', power: '★★★' },
];
const CARDS: [string, string, string, number][] = [
  ['虎豹骑令', '⚔️', 'rb', 3], ['桃园三义', '🛡️', 'rp', 1], ['东南风', '🔥', 'rb', 2], ['八阵图', '❄️', 'rp', 1],
  ['白衣', '🗡️', 'ro', 0], ['招降令', '🪤', 'rg', 2], ['速攻令', '🏇', 'rg', 4], ['募兵', '🪙', '', 6],
  ['苦肉计', '🩸', 'rb', 1], ['空城计', '🏯', 'rp', 1], ['断粮', '🌾', 'rb', 0], ['锦帆', '⛵', 'rb', 1],
];

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// 构建大厅；onStart 在「开始攻岛」时收到出战配置（v1 只实装「虎豹铁骑」→ 一律发 HUBAO_DECK）。
export function buildLobby(onStart: (cfg: RunConfig) => void): HTMLElement {
  if (!document.getElementById('gfl-style')) {
    const st = document.createElement('style');
    st.id = 'gfl-style';
    st.textContent = LOBBY_CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'gfl';
  root.style.position = 'relative';
  let selectedDeckId = 'hubao'; // 默认出战组（虎豹铁骑）；选实装组（hubao/hanshi）即生效。出生势力由所选牌组的 faction 定。
  // 组牌器（designer #19 步3）：自组牌组选中态 + 拥有的小丑牌 chips（从收藏）。
  const FAC_MAP: Record<string, Faction> = { 蜀: 'shu', 魏: 'wei', 吴: 'wu' };
  let custFac: Faction = 'shu';
  const custSel = new Set<string>();
  const allyFacs: Faction[] = ['wu', 'wei']; // 组队房 2 席盟友阵营（slice3）
  const ownedCards = Object.entries(getCollection()).filter(([id, n]) => n > 0 && CARD_CATALOG[id]);
  const ownedCardChips = ownedCards.length
    ? ownedCards.map(([id, n]) => `<button class="gfl-fbtn" data-card="${esc(id)}" style="cursor:pointer">${esc(id)} ×${n}</button>`).join('')
    : '<span class="gfl-fbtn" style="opacity:.6">（先去「收藏」页抽卡获得小丑牌）</span>';
  const enchLevels = getEnchantLevels();
  const FOIL = ['普通', 'foil', 'holo', '彩'];
  const ownedActionRows = ownedCards.length
    ? ownedCards.map(([id, n]) => { const lv = enchLevels[id] ?? 0; const cost = enchantCost(lv); return `<div class="gfl-frow" style="gap:8px">🃏 <b>${esc(id)}</b> ×<span data-cnt="${esc(id)}">${n}</span> · 附魔 <span data-ench="${esc(id)}">${lv}</span>/${ENCHANT_MAX}（${FOIL[lv]}）
      <span style="flex:1"></span><button class="gfl-mini" data-ench-btn="${esc(id)}">${lv >= ENCHANT_MAX ? '满级' : `附魔(${cost.warfunds}战功+${cost.dust}尘)`}</button><button class="gfl-mini" data-dis-btn="${esc(id)}">分解</button></div>`; }).join('')
    : '<div class="gfl-frow" style="opacity:.6">（先抽卡获得小丑牌，可附魔/分解）</div>';

  const deckGrid = DECKS.map((d, i) => `<div class="gfl-deck${i === 0 ? ' sel' : ''}" data-deck="${d.id}">
    <div class="gfl-dn">${esc(d.name)} ${d.icon}</div><div class="gfl-ds">${esc(d.style)}</div>
    <div style="font-size:12px">钥匙：<b>${esc(d.key)}</b></div><div class="gfl-cmpl">完成度 ${esc(d.complete)}</div></div>`).join('');
  const cardGrid = CARDS.map(([n, ic, r, own]) => `<div class="gfl-card ${r}${own === 0 ? ' locked' : ''}">
    <div class="own">${own > 0 ? '×' + own : '🔒'}</div><div class="ic">${ic}</div><div class="cn">${esc(n)}</div></div>`).join('');

  root.innerHTML = `
  <div class="gfl-top">
    <div style="display:flex;align-items:center;gap:10px"><div class="gfl-av">🪖</div>
      <div><div style="font-weight:700;font-size:15px">赵云<span style="font-size:11px;color:#cdbb98"> ·「江夏太守」</span></div></div>
      <div class="gfl-rank">⚔️ ${rankFor(getLP()).tier} · ${getLP()} LP</div></div>
    <div class="gfl-cur"><span class="gfl-chip" data-ref="warfunds">🎖️ 战功 ${getWarfunds()}</span><span class="gfl-chip" data-ref="dustchip">✨ 尘 ${getDust()}</span><span class="gfl-chip" data-ref="collchip">🃏 收藏 ${Object.values(getCollection()).reduce((a, b) => a + b, 0)}</span></div>
  </div>
  <div class="gfl-tabs">
    <div class="gfl-tab on" data-nav="home">大厅</div><div class="gfl-tab" data-nav="party">组队</div>
    <div class="gfl-tab" data-nav="decks">牌组</div><div class="gfl-tab" data-nav="coll">收藏</div>
    <div class="gfl-tab" data-nav="market">商城/市场</div><div class="gfl-tab" data-nav="ladder">天梯</div>
  </div>
  <div class="gfl-body"><div style="flex:1;display:flex">
    <div class="gfl-screen on" data-screen="home" style="flex:1">
      <h2>大厅 · 渡海征日<span class="gfl-tag">本周战役「九州征伐」· 赛季剩 12 天</span></h2>
      <div class="gfl-sub">主角是「我的牌组 + 我的征程」。点「渡海攻岛」组队（缺人 AI 补位）。</div>
      <div class="gfl-island"><div class="lbl">🗾 九州 · 待征服的战国海岛（城寨星布 · 三方船队登陆）</div>
        <span class="gfl-castle" style="left:42%;top:38%">🏯</span><span class="gfl-castle" style="left:60%;top:52%">🏯</span><span class="gfl-castle" style="left:30%;top:62%">🏯</span>
        <span class="gfl-fleet" style="left:8%;top:74%;color:#2f9e7e">⛵蜀</span><span class="gfl-fleet" style="left:46%;top:84%;color:#3a6ea5">⛵魏</span><span class="gfl-fleet" style="left:80%;top:72%;color:#c0432f">⛵吴</span>
        <div class="gfl-cta-wrap"><button class="gfl-cta" data-nav="party">▶ 渡海攻岛（快速匹配）</button>
          <div class="gfl-cta-row"><button class="gfl-btn" data-nav="party">邀好友组队</button><button class="gfl-btn" data-nav="party">单人（AI 补位）</button></div></div></div>
      <div class="gfl-quick"><div class="gfl-qcard" data-nav="decks">🃏 我的牌组 ▸ <b>虎豹铁骑</b>（出战）</div>
        <div class="gfl-qcard" data-act="tutorial">📖 新手教程 ● 必读</div><div class="gfl-qcard" data-nav="market">🛒 商城上新 ●</div></div>
      <div class="gfl-banner">规则：3 人一队渡海攻岛 → 各自单独 PvE 打太阁守军 → 按<b>贡献度排名</b>定岛主。盟友战局状态实时镜像（连携/卡牌互通）。</div>
    </div>
    <div class="gfl-screen" data-screen="party" style="flex:1">
      <h2>组队房 · 九州征伐<span class="gfl-tag">终盘 Boss：??? 轮换</span></h2>
      <div class="gfl-sub">3 席攻岛：空席可邀好友/快速匹配/AI 补位。各选势力 + 各选牌组（势力=出生倾向，牌组才是身份）。全员 ready 才能开始。</div>
      <div class="gfl-seats">
        <div class="gfl-seat host"><div class="gfl-face" style="background:#2f9e7e">🪖</div><div style="font-weight:800;font-size:15px">赵云（房主·我）</div><div><span class="gfl-pill" style="background:#2f9e7e">蜀</span> 牌组：虎豹铁骑</div><div class="gfl-ready">✅ 已准备</div></div>
        <div class="gfl-seat"><div class="gfl-face" style="background:#2f9e7e">🤖</div><div style="font-weight:800;font-size:15px">AI 盟友 ①</div><div style="display:flex;gap:5px" data-allyfac="0">${(['wu', 'wei', 'shu'] as const).map((f, i) => `<span class="gfl-fac${i === 0 ? ' sel' : ''}" data-f="${f}" style="cursor:pointer">${({ shu: '蜀', wei: '魏', wu: '吴' } as Record<string, string>)[f]}</span>`).join('')}</div><div class="gfl-pending">🤖 AI 自动准备</div></div>
        <div class="gfl-seat"><div class="gfl-face" style="background:#3a6ea5">🤖</div><div style="font-weight:800;font-size:15px">AI 盟友 ②</div><div style="display:flex;gap:5px" data-allyfac="1">${(['wei', 'wu', 'shu'] as const).map((f, i) => `<span class="gfl-fac${i === 0 ? ' sel' : ''}" data-f="${f}" style="cursor:pointer">${({ shu: '蜀', wei: '魏', wu: '吴' } as Record<string, string>)[f]}</span>`).join('')}</div><div class="gfl-pending">🤖 AI 自动准备</div></div>
      </div>
      <div class="gfl-config"><span>选势力：</span>
        <span class="gfl-fac sel" style="background:#2f9e7e" data-fac="shu">蜀</span><span class="gfl-fac" data-fac="wei">魏</span><span class="gfl-fac" data-fac="wu">吴</span>
        <span style="margin-left:14px">选牌组：虎豹铁骑（魏·速攻，v1 已实装）</span>
        <button class="gfl-mini" data-nav="decks">更换 ▸ 牌组管理</button>
        <span style="margin-left:14px">岛屿：九州 · 规则：贡献度排名 → 岛主</span></div>
      <div class="gfl-start-row"><button class="gfl-btn" style="flex:none">队内聊天 ▸</button>
        <button class="gfl-cta" style="width:auto;padding:13px 28px;font-size:16px" data-start="1">开始攻岛（全员 ready）</button></div>
    </div>
    <div class="gfl-screen" data-screen="decks" style="flex:1">
      <h2>牌组管理（${DECKS.length}）</h2><div class="gfl-sub">按流派/势力/稀有度筛；预览 5–8 卡位 + 钥匙牌 + 流派标签 + 克制提示。</div>
      <div class="gfl-filters">${['全部', '速攻', '连携', '控制', '单核', '经济', '降将', '刺客'].map((t) => `<span class="gfl-fbtn">${t}</span>`).join('')}</div>
      <div class="gfl-grid">${deckGrid}</div><div class="gfl-prev" data-deckprev></div>
      <div class="gfl-sub" style="margin-top:18px">🛠️ 自组牌组（从收藏拼小丑牌 · 选出生势力 + ≤8 张）</div>
      <div class="gfl-filters" data-ref="custfac">${(['蜀', '魏', '吴'] as const).map((f, i) => `<button class="gfl-fbtn${i === 0 ? ' sel' : ''}" data-fac="${f}" style="cursor:pointer">${f}</button>`).join('')}</div>
      <div class="gfl-filters" data-ref="custcards">${ownedCardChips}</div>
      <button class="gfl-cta" style="width:auto;padding:11px 24px;font-size:15px;margin-top:10px" data-act="custom-start">▶ 用自组牌组出战</button>
    </div>
    <div class="gfl-screen" data-screen="coll" style="flex:1">
      <h2>卡牌收藏</h2><div class="gfl-sub">筛选 势力/职业/稀有度/品质 + 搜索。未拥有显灰锁 🔒。战功抽卡入收藏（概率公示）。</div>
      <div class="gfl-filters"><button class="gfl-fbtn" data-act="gacha" style="background:#c9a24e;color:#fff;border-color:transparent;cursor:pointer">🎲 单抽 · ${GACHA_COST} 战功</button><button class="gfl-fbtn" data-act="gacha10" style="background:#8a6d2f;color:#fff;border-color:transparent;cursor:pointer">🎲 十连 · ${GACHA10_COST}（保底稀有）</button><span class="gfl-fbtn" data-ref="collinfo">已收藏 ${Object.values(getCollection()).reduce((a, b) => a + b, 0)} 张</span><span class="gfl-fbtn" data-ref="dust">✨ 尘 ${getDust()}</span></div>
      <div class="gfl-sub" style="margin-top:12px">🔧 附魔 / 分解（附魔升卡=局内更强；分解多余卡化尘）</div>
      <div data-ref="ownrows" style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto">${ownedActionRows}</div>
    </div>
    <div class="gfl-screen" data-screen="market" style="flex:1">
      <h2>商城 & 交易市场</h2><div class="gfl-sub">抽卡（概率公示）/ 直购 / 交易市场（挂单·求购·行情）。<b>TCG 式封闭市场，非 crypto。</b></div>
      <div class="gfl-filters"><span class="gfl-fbtn" style="background:#c9a24e;color:#fff;border-color:transparent">抽卡</span><span class="gfl-fbtn">直购礼包</span><span class="gfl-fbtn">交易市场</span></div>
      <table><tr><th>卡名</th><th>最低售价</th><th>求购价</th><th>成交均价</th><th>走势</th><th>操作</th></tr>
        <tr><td>白衣</td><td>💎120</td><td>💎90</td><td>💎105</td><td class="gfl-up">↗</td><td><button class="gfl-mini">购买</button></td></tr>
        <tr><td>虎豹骑令</td><td>💎15</td><td>💎10</td><td>💎12</td><td>→</td><td><button class="gfl-mini">购买</button></td></tr>
        <tr><td>八阵图</td><td>💎64</td><td>💎50</td><td>💎58</td><td class="gfl-up">↗</td><td><button class="gfl-mini">购买</button></td></tr></table>
    </div>
    <div class="gfl-screen" data-screen="ladder" style="flex:1">
      <h2>天梯 · 赛季「九州征伐」</h2><div class="gfl-sub">段位/LP/赛季进度 + 排行榜 + 战绩（名次/贡献/岛主次数）。</div>
      <div class="gfl-banner">我的段位：<b>黄金Ⅲ · 1240 LP</b> · 距铂金 260 LP · 本赛季 岛主 ×7 / 对局 31</div>
      <table><tr><th>#</th><th>主公</th><th>段位</th><th>岛主次数</th><th>胜率</th><th>主流派</th></tr>
        <tr><td>1</td><td>司马懿</td><td>王者</td><td>148</td><td>71%</td><td>谋士·控制</td></tr>
        <tr><td>2</td><td>周瑜</td><td>宗师</td><td>132</td><td>68%</td><td>吴·火攻</td></tr>
        <tr><td style="color:#b5402f;font-weight:800">…48</td><td style="color:#b5402f;font-weight:800">赵云（我）</td><td>黄金Ⅲ</td><td>7</td><td>58%</td><td>魏·速攻</td></tr></table>
    </div>
    <div class="gfl-friends">
      <div style="font-weight:800;margin-bottom:8px">好友（在线 5）</div>
      ${[['张飞_关张', 'on', '对战中'], ['周瑜', 'on', '大厅'], ['孔明', 'on', '组队中'], ['黄忠', 'on', '大厅'], ['马超', 'on', '收藏中'], ['司马懿', 'off', '离线'], ['吕布', 'off', '离线']].map(([n, s, st]) => `<div class="gfl-frow"><span class="gfl-fdot gfl-${s}"></span>${esc(n)}<span class="gfl-fstat">${esc(st)}</span></div>`).join('')}
      <div style="margin-top:10px"><button class="gfl-btn" style="width:100%">＋ 添加好友</button></div>
    </div>
  </div></div>`;

  // —— 交互（纯前端走查）——
  const show = (name: string): void => {
    root.querySelectorAll<HTMLElement>('.gfl-tab').forEach((t) => t.classList.toggle('on', t.dataset.nav === name));
    root.querySelectorAll<HTMLElement>('.gfl-screen').forEach((p) => p.classList.toggle('on', p.dataset.screen === name));
  };
  root.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => b.addEventListener('click', () => show(b.dataset.nav!)));
  root.querySelectorAll<HTMLElement>('[data-fac]').forEach((f) => f.addEventListener('click', () => {
    root.querySelectorAll<HTMLElement>('[data-fac]').forEach((x) => { x.classList.remove('sel'); x.style.color = ''; });
    f.classList.add('sel'); f.style.color = '#fff'; // 势力选择（v1 视觉；出生势力实取所选牌组的 faction）
  }));
  // 牌组选择 + 预览。
  const prev = root.querySelector<HTMLElement>('[data-deckprev]')!;
  const showDeck = (d: DeckCardView): void => {
    const slots = [...d.cards]; while (slots.length < 8) slots.push('');
    prev.innerHTML = `<div style="font-weight:800;font-size:16px">${esc(d.name)} · ${esc(d.style)}</div>
      <div class="gfl-slots">${slots.map((c) => `<div class="gfl-slot ${c === d.key ? 'key' : ''} ${c === '' ? 'empty' : ''}">${esc(c || '空')}</div>`).join('')}</div>
      <div style="font-size:13px;color:var(--ink-dim)">克制：${esc(d.counter)} · 预估强度：${d.power}</div>
      <div style="margin-top:10px;display:flex;gap:10px"><button class="gfl-mini" data-nav="party">设为出战</button><button class="gfl-mini" data-nav="coll">从收藏替换卡</button></div>`;
    prev.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => b.addEventListener('click', () => show(b.dataset.nav!)));
  };
  root.querySelectorAll<HTMLElement>('[data-deck]').forEach((el2) => el2.addEventListener('click', () => {
    root.querySelectorAll<HTMLElement>('[data-deck]').forEach((x) => x.classList.remove('sel'));
    el2.classList.add('sel');
    selectedDeckId = el2.dataset.deck!;
    const d = DECKS.find((x) => x.id === el2.dataset.deck); if (d) showDeck(d);
  }));
  showDeck(DECKS[0]);
  // 空席邀请 toast。
  root.querySelectorAll<HTMLElement>('[data-toast]').forEach((s) => s.addEventListener('click', () => {
    if (root.querySelector('.gfl-toast')) return;
    const t = document.createElement('div'); t.className = 'gfl-toast';
    t.innerHTML = `<span>🔔 <b>周瑜</b> 邀请你加入攻岛队伍</span><button class="gfl-acc">接受</button><button class="gfl-dec">拒绝</button>`;
    t.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => t.remove()));
    root.appendChild(t);
  }));
  // 软币抽卡（经济 v1 spend 端）：扣战功 → 出武将入收藏 → 刷新战功/收藏显示 + 飘字。
  root.querySelector<HTMLElement>('[data-act="gacha"]')?.addEventListener('click', () => {
    const r = gachaPull();
    refreshWf(); refreshColl();
    if (root.querySelector('.gfl-toast')) root.querySelector('.gfl-toast')!.remove();
    const t = document.createElement('div'); t.className = 'gfl-toast';
    t.innerHTML = r.ok ? `<span>🎲 抽到 <b>${esc(r.card!.name)}</b>（${esc(r.card!.rarity ?? '')}）！入收藏。</span><button class="gfl-acc">好</button>` : `<span>⚠️ 战功不足（需 ${GACHA_COST}）</span><button class="gfl-acc">好</button>`;
    t.querySelector('button')!.addEventListener('click', () => t.remove());
    root.appendChild(t);
  });
  // 十连抽（保底 ≥1 稀有）。
  root.querySelector<HTMLElement>('[data-act="gacha10"]')?.addEventListener('click', () => {
    const r = gachaPull10();
    refreshWf(); refreshColl();
    root.querySelector('.gfl-toast')?.remove();
    const t = document.createElement('div'); t.className = 'gfl-toast';
    const rares = r.ok ? r.cards.filter((c) => c.rarity && c.rarity !== 'common').length : 0;
    t.innerHTML = r.ok ? `<span>🎲 十连：${r.cards.length} 张入收藏（稀有+ ×${rares}）</span><button class="gfl-acc">好</button>` : `<span>⚠️ 战功不足（需 ${GACHA10_COST}）</span><button class="gfl-acc">好</button>`;
    t.querySelector('button')!.addEventListener('click', () => t.remove());
    root.appendChild(t);
  });
  // 附魔/分解（养成第二轴 UI）：按卡操作，原地刷新数字 + 飘字。
  const toast = (msg: string): void => { root.querySelector('.gfl-toast')?.remove(); const t = document.createElement('div'); t.className = 'gfl-toast'; t.innerHTML = `<span>${msg}</span><button class="gfl-acc">好</button>`; t.querySelector('button')!.addEventListener('click', () => t.remove()); root.appendChild(t); };
  const refreshDust = (): void => { const d = root.querySelector<HTMLElement>('[data-ref="dust"]'); if (d) d.textContent = `✨ 尘 ${getDust()}`; const dc = root.querySelector<HTMLElement>('[data-ref="dustchip"]'); if (dc) dc.textContent = `✨ 尘 ${getDust()}`; };
  const refreshWf = (): void => { const w = root.querySelector<HTMLElement>('[data-ref="warfunds"]'); if (w) w.textContent = `🎖️ 战功 ${getWarfunds()}`; };
  // P3：顶栏收藏数同步真值（抽卡/分解后）。
  const refreshColl = (): void => { const n = Object.values(getCollection()).reduce((a, b) => a + b, 0); const cc = root.querySelector<HTMLElement>('[data-ref="collchip"]'); if (cc) cc.textContent = `🃏 收藏 ${n}`; const ci = root.querySelector<HTMLElement>('[data-ref="collinfo"]'); if (ci) ci.textContent = `已收藏 ${n} 张`; };
  root.querySelectorAll<HTMLElement>('[data-ench-btn]').forEach((el2) => el2.addEventListener('click', () => {
    const id = el2.dataset.enchBtn!;
    const r = enchantCard(id);
    if (r.ok) {
      const e = root.querySelector<HTMLElement>(`[data-ench="${id}"]`); if (e) e.textContent = String(r.level);
      const nc = enchantCost(r.level); el2.textContent = r.level >= ENCHANT_MAX ? '满级' : `附魔(${nc.warfunds}战功+${nc.dust}尘)`; // 刷新为下一级成本
      refreshWf(); refreshDust(); toast(`🔧 ${esc(id)} 附魔 → Lv${r.level}`);
    } else toast('⚠️ 附魔失败（满级或 战功/尘 不足）');
  }));
  root.querySelectorAll<HTMLElement>('[data-dis-btn]').forEach((el2) => el2.addEventListener('click', () => {
    const id = el2.dataset.disBtn!;
    const r = disenchant(id);
    if (r.dust > 0) { const c = root.querySelector<HTMLElement>(`[data-cnt="${id}"]`); if (c) c.textContent = String(r.kept); refreshDust(); const ci = root.querySelector<HTMLElement>('[data-ref="collinfo"]'); if (ci) ci.textContent = `已收藏 ${Object.values(getCollection()).reduce((a, b) => a + b, 0)} 张`; toast(`✨ 分解得尘 +${r.dust}`); }
    else toast('⚠️ 无多余卡可分解（保留 1 张）');
  }));
  // 组牌器（步3）：势力单选 / 卡多选(≤8) / 用自组牌组出战。
  root.querySelectorAll<HTMLElement>('[data-fac]').forEach((el2) => el2.addEventListener('click', () => {
    root.querySelectorAll<HTMLElement>('[data-fac]').forEach((x) => x.classList.remove('sel'));
    el2.classList.add('sel');
    custFac = FAC_MAP[el2.dataset.fac!] ?? 'shu';
  }));
  root.querySelectorAll<HTMLElement>('[data-card]').forEach((el2) => el2.addEventListener('click', () => {
    const id = el2.dataset.card!;
    if (custSel.has(id)) { custSel.delete(id); el2.classList.remove('sel'); }
    else if (custSel.size < 8) { custSel.add(id); el2.classList.add('sel'); }
  }));
  root.querySelector<HTMLElement>('[data-act="custom-start"]')?.addEventListener('click', () => {
    if (custSel.size === 0) { root.querySelector('.gfl-toast')?.remove(); const t = document.createElement('div'); t.className = 'gfl-toast'; t.innerHTML = '<span>⚠️ 先从收藏选至少 1 张小丑牌</span><button class="gfl-acc">好</button>'; t.querySelector('button')!.addEventListener('click', () => t.remove()); root.appendChild(t); return; }
    const ids = [...custSel];
    saveCustomDeck({ cardIds: ids, faction: custFac });
    onStart({ deck: assembleDeck(ids, custFac, '自组牌组', getEnchantLevels()), faction: custFac, allies: [...allyFacs] }); // 附魔级烘进卡数值
  });
  // 组队房盟友席阵营选择（slice3）：每席 data-f 单选 → allyFacs[席]。
  root.querySelectorAll<HTMLElement>('[data-allyfac]').forEach((grp) => {
    const idx = Number(grp.dataset.allyfac);
    grp.querySelectorAll<HTMLElement>('[data-f]').forEach((el2) => el2.addEventListener('click', () => {
      grp.querySelectorAll<HTMLElement>('[data-f]').forEach((x) => x.classList.remove('sel'));
      el2.classList.add('sel');
      allyFacs[idx] = el2.dataset.f as Faction;
    }));
  });
  // 开始攻岛 → 产出出战配置交引擎（选实装组 hubao/hanshi 即生效；deck.faction 定出生势力；allies=组队房盟友阵营）。
  root.querySelector<HTMLElement>('[data-start]')!.addEventListener('click', () => {
    const deck = DECK_REGISTRY[selectedDeckId] ?? HUBAO_DECK;
    onStart({ deck, faction: deck.faction, allies: [...allyFacs] });
  });

  // P2 新手教程（owner approve）：点「新手教程」→ 弹层 iframe 内联教程页（srcdoc 隔离样式，无分步引导）。
  root.querySelector<HTMLElement>('[data-act="tutorial"]')?.addEventListener('click', () => {
    if (root.querySelector('.gfl-tut')) return;
    const ov = document.createElement('div');
    ov.className = 'gfl-tut';
    ov.style.cssText = 'position:absolute;inset:0;z-index:120;display:flex;flex-direction:column;background:rgba(20,14,8,.72);backdrop-filter:blur(4px)';
    ov.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:#2e2317;color:#f4ead2;font-weight:700;font-size:14px">📖 新手教程<span style="flex:1"></span><button class="gfl-tut-x" style="padding:5px 14px;border-radius:8px;border:1px solid #c9a24e;background:transparent;color:#f4ead2;cursor:pointer;font-size:13px">关闭 ✕</button></div>
      <iframe srcdoc="${TUTORIAL_HTML.replace(/"/g, '&quot;')}" style="flex:1;width:100%;border:none;background:#f4ead2"></iframe>`;
    ov.querySelector('.gfl-tut-x')!.addEventListener('click', () => ov.remove());
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    root.appendChild(ov);
  });

  return root;
}
