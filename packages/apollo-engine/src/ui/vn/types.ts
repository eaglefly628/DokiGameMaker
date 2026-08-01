import type { GameTheme } from '../themes/theme.types.js';
import type { Engine } from '../../runtime/engine.js';
import type { DialogueGraph } from '@skills/tier3/index.js';

// ═══════════════════════════════════════════════════════════════
//  通用 VN 演出组件的数据契约（R16）。把"哪个对话实体 / 显示哪些属性 / 立绘槽"
//  描述成数据（理想从 manifest 派生），喂给 @ui/vn 的通用、可主题化组件。
//  游戏层不再各写一份 VNStage —— 演出 = 通用组件 + 一份主题数据 + 一份绑定数据。
// ═══════════════════════════════════════════════════════════════

// 属性面板要显示的一项：id = Resource 所在实体 id，label = 显示名。
export interface VNStatBinding {
  id: string;
  label: string;
}

// 指示灯：某 Flag 激活/未激活时的文案（如"已暖场（解锁特殊选项）"）。
export interface VNFlagBinding {
  id: string;
  activeLabel: string;
  inactiveLabel?: string;
}

// VN 演出绑定（数据）：把世界投影成 VN 画面所需的信息。
export interface VNBinding {
  dialogueEntityId: string; // 对话状态机 / Text 所在实体 id
  panelTitle?: string; // 属性面板标题
  stats: VNStatBinding[]; // 属性面板：资源 + 标签 + 顺序
  flags?: VNFlagBinding[]; // 指示灯
  portrait?: { label?: string }; // 立绘槽（占位，真资产走 R9）
}

// R3 输入接缝：UI 把语义动作 enqueue 到队列，引擎在 tick 边界确定性消费（QueuedInputSource 即实现）。
export interface ActionEnqueuer {
  enqueueAction(name: string, value?: { x?: number; y?: number }): void;
}

export interface VNStageProps {
  engine: Engine;
  script: DialogueGraph;
  theme: GameTheme;
  binding: VNBinding;
  input?: ActionEnqueuer; // 缺省则只读演出（点击不注入世界）
  width?: number;
  height?: number;
}
