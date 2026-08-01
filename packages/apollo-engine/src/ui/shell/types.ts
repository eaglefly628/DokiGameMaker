import type { GameTheme } from '../themes/theme.types.js';
import type { Engine } from '../../runtime/engine.js';

// ═══════════════════════════════════════════════════════════════
//  GameShell —— 通用「页面布局即数据」契约（Stage 1）。
//  把游戏的 DOM 壳层（HUD / 标签 / 状态条 / 按钮）描述成**数据**（UILayout），
//  喂给通用、可主题化的 @ui/shell/GameShell 渲染——它是 dialogue/VNStage 的 chrome 版。
//  游戏层不再各写一份 React 壳：壳 = 通用解释器 + 一份布局数据 + 一份主题数据。
//
//  ⛔ 红线（守不变量②：最弱 LLM 也能一致产出）：
//    · 事件 = **信号名**（button.signal → 注入 sim，复用 Clickable→signal 链），绝不收自由函数；
//    · 绑定 = **resourceId**（stat/bar.bind 读 Resource），绝不收自由表达式；
//    · 节点是**闭集 union**，不滑成图灵完备 UI DSL。
// ═══════════════════════════════════════════════════════════════

// R3 输入接缝（与 @ui/vn 同款）：UI 把语义动作 enqueue，引擎在 tick 边界确定性消费。
export interface ActionEnqueuer {
  enqueueAction(name: string, value?: { x?: number; y?: number; drag?: string }): void; // drag=被拖元素 dragId（拖放落点信号带它，UI 拖拽控件用）
}

// 布局节点（闭集）：容器嵌套子节点；叶子绑定 sim（stat/bar）或发信号（button）。
export type UINode =
  | { kind: 'col'; gap?: number; children: UINode[] } // 纵向容器
  | { kind: 'row'; gap?: number; children: UINode[] } // 横向容器
  | { kind: 'panel'; title?: string; children: UINode[]; anchor?: string } // 带边框/标题的面板（anchor=新手引导锚点键 REQ-ARCH-COACH，落 data-anchor）
  | { kind: 'tabs'; tabs: Array<{ label: string; content: UINode }> } // 标签页（选中态=纯表现局部态）
  | { kind: 'text'; text: string; size?: 'sm' | 'md' | 'lg'; tone?: 'normal' | 'dim' | 'accent' } // 静态文字
  | { kind: 'stat'; bind: string; label?: string; icon?: string } // 数值：读 Resource{id:bind}.current
  | { kind: 'bar'; bind: string; tone?: 'hp' | 'mp' | 'xp' | 'accent' } // 比例条：Resource current/max
  | { kind: 'image'; src?: string; bind?: string; width?: number; height?: number; alt?: string } // 图：src 静态 / bind=StringVar id 动态(取其 value 作 src)
  | { kind: 'draggable'; dragId: string; children: UINode[] } // 可拖控件：拖起时记 dragId（UI 拖拽，如牌→牌组槽/背包格）
  | { kind: 'dropzone'; signal: string; children: UINode[] } // 放置区：落下 → enqueueAction(signal,{drag:dragId})；事件仍=信号名（守红线）
  | { kind: 'button'; label: string; signal: string; primary?: boolean; anchor?: string }; // 按钮：点击 → enqueueAction(signal)；anchor=新手引导锚点键

export interface UILayout {
  root: UINode;
}

export interface GameShellProps {
  engine: Engine;
  layout: UILayout;
  theme: GameTheme;
  input?: ActionEnqueuer; // 缺省=只读（按钮不注入世界）
  resolveAsset?: (key: string) => string | undefined; // image bind 的资产 key → 可绘制 src（DI 注入）；sim 只持 key 保纯/确定
}
