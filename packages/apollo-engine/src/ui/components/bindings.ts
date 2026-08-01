// 世界绑定解析 —— 收编 GameShell 的 stat/bar/image-bind 入统一 LayoutNode 底座。
//
// 思路：渲染器 renderNode 保持**纯函数·世界无关**；世界数据在渲染**前**由 resolveBindings()
// 用注入的 UIDataSource 读出、填成字面值，再交 renderNode。于是「世界绑定」既进了统一节点 schema，
// 又不让 ECS 细节污染组件库（UIDataSource 由游戏/引擎注入·DI 解耦）。
//
// 红线不变（守 GameShell 同款不变量）：
//   · 绑定 = resourceId **字符串**（最弱 LLM 能填），绝不收自由取值表达式；
//   · 只读世界（显示）；写世界(按钮信号)走 action + HandlerMap(enqueue sim)，两端分明。

import type { LayoutNode, LabelProps, ProgressBarProps, ImageProps } from './types.js';

/** 注入式世界数据源（游戏/引擎提供一份·解耦 ECS）：resource 读数值资源，value 读字符串变量，flag 读布尔旗标。 */
export interface UIDataSource {
  resource?(id: string): { current: number; max?: number } | undefined;
  value?(id: string): string | undefined;
  /** 读布尔旗标（通常映射世界 Flag 组件）：LayoutNode.visibleWhen 条件显隐求值用。游戏/引擎注入。 */
  flag?(id: string): boolean | undefined;
}

/**
 * 求 LayoutNode.visibleWhen：flag id（可选 `!` 前缀取反）经 ds.flag 读布尔。
 * 安全默认（与 bind 无 reader 即不解析同构）：无 visibleWhen / 无 ds.flag / 空 id → 恒可见（绝不误删节点）。
 */
export function isVisible(node: LayoutNode, ds: UIDataSource): boolean {
  const vw = node.visibleWhen;
  if (!vw || !ds.flag) return true;
  const neg = vw[0] === '!';
  const id = neg ? vw.slice(1) : vw;
  if (!id) return true; // 空 flag id（如裸 "!"）→ 视为无条件，不误删
  const v = ds.flag(id);
  return neg ? !v : !!v;
}

/**
 * 把树里带 bind(resourceId) 的节点用 ds 读世界、填成字面值，返回**新树**（纯函数·不改原树）。
 * 未命中/无 bind 的节点原样透传。用法：renderNode(resolveBindings(tree, ds), theme)。
 * 活 HUD 每次世界变更重跑本函数 + 重挂即可（与组件库「静态 UI·变更重挂」模型一致）。
 */
export function resolveBindings(node: LayoutNode, ds: UIDataSource): LayoutNode {
  let props = node.props;

  if (node.type === 'Label') {
    const p = node.props as LabelProps;
    if (p.bind && ds.resource) {
      const r = ds.resource(p.bind);
      if (r) props = { ...p, text: `${p.text ?? ''}${r.current}` }; // text 作前缀/标签，接 current
    }
  } else if (node.type === 'ProgressBar') {
    const p = node.props as ProgressBarProps;
    if (p.bind && ds.resource) {
      const r = ds.resource(p.bind);
      if (r) props = { ...p, value: r.current, ...(r.max !== undefined ? { max: r.max } : {}) };
    }
  } else if (node.type === 'Image') {
    const p = node.props as ImageProps;
    if (p.bind && ds.value) {
      const s = ds.value(p.bind);
      if (s !== undefined) props = { ...p, src: s };
    }
  }

  // visibleWhen 不满足的子节点先从 children 里剔除（连同子树·替代游戏用代码 if/else 重建树），再递归解析绑定。
  const children = node.children?.filter((ch) => isVisible(ch, ds)).map((ch) => resolveBindings(ch, ds));
  return children ? { ...node, props, children } : { ...node, props };
}
