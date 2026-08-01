// 华丽起手包 · Starter Kit（owner 2026-07「为啥新游戏都不用成熟华丽的组合库」→ 起手从「富」抄·非从「空白」搭）。
//
// 目的：新游戏 UI **起手默认华丽**——不再从零写朴素 LayoutNode + 从零调色皮，而是 import 这里的
//   打磨好的屏 builder（house 主题 + 成熟组合件已接线：糖果皮钮 / 悬停流光 / 星级 / 庆祝粒子 / 数字格式化 /
//   蛇形选关 / 环境微光），传最小数据即得一屏富 UI，再按游戏改。
// 红线不破：这些 builder 产的仍是**纯 LayoutNode 数据**（控件闭集·写世界=action 信号）；主题在 mountUI 应用。
//   起手主题=`STARTER_THEME`（apollo-toon 水墨玩趣·亮宣纸糖果皮·程序化零资产）；换 onyx/brocade 见 apollo-kit。
//
// 用法：`mountUI(host, buildStarterHome({ title:'魔法方块', actions:[…] }), handlers, STARTER_THEME)`。
// 手册：`docs/playbooks/ui.md`「华丽起手」一节 + 活范例 game-i 展示台（逐特性对照）。
import type { LayoutNode } from '@ui/components/index.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';

/** 起手推荐 house 主题（别从零写 UITheme·除非有明确美术方向且记债）。想暗皮金属→ `@ui/components/apollo-kit` apolloOnyx。 */
export const STARTER_THEME = apolloToon;

/** 一个主菜单动作（label + kind 皮 + action 信号；hero=金糖大 CTA·primary=品牌·ghost=次·quiet=克制）。 */
export interface StarterAction {
  label: string;
  action: string;
  kind?: 'hero' | 'primary' | 'ghost' | 'quiet';
  sub?: string; // hero 键副标（小字第二行）
  actionArg?: string;
}

/** ① 华丽主菜单：远山淡墨背景 + 标题（衬线大字点睛） + 糖果厚唇钮列（hero 键悬停流光） + 环境微光粒子。 */
export function buildStarterHome(o: { title: string; subtitle?: string; actions: StarterAction[] }): LayoutNode {
  return {
    type: 'Screen',
    id: 'starter-home',
    props: { center: true, fill: true }, // fill：mountHost 定尺盒填满去底部信箱空白
    layout: { direction: 'column', align: 'center', justify: 'center', gap: 18, padding: 28 },
    children: [
      // 环境微光（render-only·铺满·不挡点击）——「活」的底噪，静止菜单也有呼吸。
      { type: 'Particles', id: 'starter-home-amb', props: { kind: 'sparkle', count: 18, loop: true } },
      // 标题卡：文字坐不透明纸面（远山渐变非实底·直坐吃假对比·ui-playbook §3）。
      {
        type: 'Panel', id: 'starter-title-card', props: {},
        layout: { direction: 'column', align: 'center', gap: 6, padding: 18 },
        children: [
          { type: 'Label', id: 'starter-title', props: { text: o.title, font: 'serif', size: 'xxxl', bold: true, color: 'gold' } },
          ...(o.subtitle ? [{ type: 'Label', id: 'starter-sub', props: { text: o.subtitle, size: 'md', color: 'text' } } as LayoutNode] : []),
        ],
      },
      // 动作钮列：统一等宽（框 Panel stretch）·糖果厚唇皮由主题 buttonSkins 自动上·hero 键加悬停流光。
      {
        type: 'Panel', id: 'starter-actions', props: { bare: true },
        layout: { direction: 'column', align: 'stretch', gap: 12, width: 260 },
        children: o.actions.map((a, i): LayoutNode => ({
          type: 'Button', id: `starter-act-${i}`,
          props: {
            label: a.label, kind: a.kind ?? (i === 0 ? 'hero' : 'ghost'),
            action: a.action, ...(a.actionArg ? { actionArg: a.actionArg } : {}), ...(a.sub ? { sub: a.sub } : {}),
          },
          // 首个（主 CTA）加悬停流光 premium 手感（移上去扫一道·天然冷却·非常驻）。
          ...(i === 0 ? { layout: { fx: [{ kind: 'sheen-hover' as const }] } } : {}),
        })),
      },
    ],
  };
}

/** ② 华丽结算（通关）：半透幕布 + 居中纸卡（星级 Rating + 数字格式化大分 + 金糖下一关钮） + 撒纸屑庆祝。 */
export function buildStarterResult(o: {
  title?: string; stars: number; score: number; hasNext?: boolean;
  retryAction?: string; nextAction?: string;
}): LayoutNode {
  const card: LayoutNode = {
    type: 'Panel', id: 'starter-res-card', props: {},
    layout: { direction: 'column', align: 'center', gap: 14, padding: 24 },
    children: [
      { type: 'Label', id: 'starter-res-title', props: { text: o.title ?? '通关！', font: 'serif', size: 'xxxl', bold: true, color: 'gold' } },
      { type: 'Rating', id: 'starter-res-stars', props: { value: Math.max(0, Math.min(3, o.stars)), max: 3 } },
      { type: 'Label', id: 'starter-res-cap', props: { text: '本关得分', size: 'sm', color: 'sub' } },
      // 数字格式化（compact：12,340 → 12.3K）——大字点睛·随 tween/文本作用。
      { type: 'Label', id: 'starter-res-score', props: { text: String(o.score), format: 'compact', size: 'xxl', bold: true, color: 'gold' } },
      {
        type: 'Panel', id: 'starter-res-btns', props: { bare: true },
        layout: { direction: 'row', align: 'center', gap: 12 },
        children: [
          { type: 'Button', id: 'starter-res-retry', props: { label: '重来', kind: 'quiet', action: o.retryAction ?? 'retry' } },
          ...(o.hasNext ? [{ type: 'Button' as const, id: 'starter-res-next', props: { label: '下一关 →', kind: 'hero' as const, action: o.nextAction ?? 'next' } }] : []),
        ],
      },
    ],
  };
  return {
    type: 'Screen', id: 'starter-result',
    props: { center: true, fill: true, bg: { custom: 'linear-gradient(rgba(24,20,14,0.55),rgba(24,20,14,0.72))' } },
    layout: { direction: 'column', align: 'center', justify: 'center', gap: 14, padding: 24 },
    children: [{ type: 'Particles', id: 'starter-res-confetti', props: { kind: 'confetti', count: 34, loop: false } }, card],
  };
}
