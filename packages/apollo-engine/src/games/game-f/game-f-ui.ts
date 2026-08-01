import type { UILayout } from '@ui/shell/types.js';

// Game F · 局内 HUD「布局即数据」（去腐片4：取代 game-f.tsx 手写 React 壳的一份 UILayout）。
// 喂 @ui/shell/GameShell 渲染：stat/bar 绑 Resource（按 id 全局寻址）、button→keybind 信号、image 绑资产 key。
// 棋盘/拖拽/名牌叠层留 canvas（drag-place，按 Lead 裁）；本布局只描述四周 chrome + 商店 3 固定槽。
//
// 商店 3 固定槽（SHOP_XS 三个 → 不用 list，避模板化 DSL 腐烂区）：每槽 image(绑 StringVar 脸图 key 经
// resolveAsset)+stat(价/码)+button(buy_slot_i)。脸图 key 由 mount 侧每帧投影进 shop_face_1..3 StringVar。
export const GAME_F_UI: UILayout = {
  root: {
    kind: 'col',
    gap: 10,
    children: [
      // ── 顶栏状态（关卡/倒计时/连胜）──
      {
        kind: 'row',
        gap: 14,
        children: [
          { kind: 'stat', bind: 'stage_idx', label: '关', icon: '🗾' },
          { kind: 'stat', bind: 'round_idx', label: '波' },
          { kind: 'stat', bind: 'prep_left', label: '备战', icon: '⏱' },
          { kind: 'stat', bind: 'win_streak', label: '连胜' },
        ],
      },
      // ── 主公玩家卡（生命/经验/金币/席位/贡献/攻岛）──
      {
        kind: 'panel',
        title: '主公',
        children: [
          { kind: 'stat', bind: 'player_hp', label: '生命', icon: '❤️' },
          { kind: 'bar', bind: 'player_hp', tone: 'hp' },
          { kind: 'stat', bind: 'level', label: 'Lv' },
          { kind: 'bar', bind: 'xp', tone: 'xp' },
          {
            kind: 'row',
            gap: 10,
            children: [
              { kind: 'stat', bind: 'gold', icon: '🪙' },
              { kind: 'stat', bind: 'bench_space', label: '空席' },
            ],
          },
          { kind: 'stat', bind: 'contribution', label: '贡献', icon: '⚔️' },
          { kind: 'bar', bind: 'island_progress', tone: 'accent' }, // 攻岛进度
        ],
      },
      // ── 商店 3 固定槽（点将台；image 脸图 + 价 + 买入按钮）──
      {
        kind: 'panel',
        title: '点将台',
        children: [
          {
            kind: 'row',
            gap: 8,
            children: [
              { kind: 'col', gap: 4, children: [{ kind: 'image', bind: 'shop_face_1', width: 56, height: 64 }, { kind: 'button', label: '招募', signal: 'buy_slot_1' }] },
              { kind: 'col', gap: 4, children: [{ kind: 'image', bind: 'shop_face_2', width: 56, height: 64 }, { kind: 'button', label: '招募', signal: 'buy_slot_2' }] },
              { kind: 'col', gap: 4, children: [{ kind: 'image', bind: 'shop_face_3', width: 56, height: 64 }, { kind: 'button', label: '招募', signal: 'buy_slot_3' }] },
            ],
          },
        ],
      },
      // ── 操作（开战/经验/刷新；经 keybind 桥发信号）──
      {
        kind: 'row',
        gap: 10,
        children: [
          { kind: 'button', label: '开战', signal: 'ready_btn', primary: true },
          { kind: 'button', label: '经验 $4', signal: 'buyxp_btn' },
          { kind: 'button', label: '刷新 $2', signal: 'reroll_btn' },
        ],
      },
    ],
  },
};
