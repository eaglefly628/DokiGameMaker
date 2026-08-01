import type { IWorld, EntityId } from '@engine/core/types.js';
import type { Velocity, Controllable, Action, InputQueue, RawInputData } from '@engine/protocol/components.js';

// RawInputData 定义在 protocol（与 InputQueue 同处），此处 re-export 保持 @net 调用方不变。
export type { RawInputData };

// 输入队列单例的实体 id：每 tick 整体覆写其 InputQueue.actions（零实体分配）。
export const INPUT_QUEUE_ENTITY = 'global-input';

// ═══════════════════════════════════════════════════════════════
//  输入模型 — 联机的"接缝"
// ═══════════════════════════════════════════════════════════════
//
//  Command 是一个玩家在**某一个 tick** 的意图。它是真实联机里被序列化、
//  在对端之间逐 tick 交换的最小单位。把"实时键盘"和"网络对端"都抽象成
//  同一个 InputSource：现在喂本地键盘，以后换成网络源，引擎一行都不用动。
//
//  确定性铁律：所有对端必须以**完全相同的顺序**应用同一 tick 的命令，
//  否则状态分叉(desync)。所以应用前一律按 playerId 排序——顺序只由内容
//  决定，与网络到达次序无关。
// ═══════════════════════════════════════════════════════════════

export interface Command {
  readonly playerId: string;
  readonly tick: number;
  // 移动意图，dx/dy 各取 {-1, 0, 1}；真实速度 = move * Controllable.speed
  readonly move: { readonly dx: number; readonly dy: number };
  // 跳跃意图（平台类）。true 时 applyCommands 给目标打 Action{name:'jump'}，由 jump 系统在着地时转成向上冲量。
  readonly jump?: boolean;
  // 原始输入事件（指针/点击/UI 动作）。按 tick 确定性注入为 RawInput 实体供游戏层消费（R3）。
  readonly actions?: readonly RawInputData[];
}

// 每 tick 命令的来源。本地键盘 / 脚本 / 网络对端都实现它。
export interface InputSource {
  // 本源已知的、适用于 `tick` 的所有命令（可能为空）。
  commandsForTick(tick: number): Command[];
}

// 合并多个输入源（本地双人：两套键位、两个 playerId 各一个源）。逐 tick 拼接各源命令；
// applyCommands 已按 playerId 定序并路由，两名玩家互不干扰。
export class MultiInputSource implements InputSource {
  constructor(private readonly sources: readonly InputSource[]) {}
  commandsForTick(tick: number): Command[] {
    return this.sources.flatMap((s) => s.commandsForTick(tick));
  }
  // 转发 dispose 给支持的子源（如 KeyboardInputSource）。
  dispose(): void {
    for (const s of this.sources) (s as { dispose?: () => void }).dispose?.();
  }
}

// 确定性排序：按 playerId 稳定排序，使应用顺序只由内容决定。
export function orderCommands(commands: readonly Command[]): Command[] {
  return [...commands].sort((a, b) =>
    a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0,
  );
}

// 把"意图"翻译成"世界写入"：input → simulation 的桥。拆成两件关注点（Gemini Q3）：
// applyMovement（连续控制：速度/跳跃）+ applyRawActions（离散事件 → 单例 InputQueue）。
export function applyCommands(world: IWorld, commands: readonly Command[]): void {
  const ordered = orderCommands(commands);
  applyMovement(world, ordered);
  applyRawActions(world, ordered);
}

// 连续控制：先把所有 Controllable 速度清零（无输入即静止），再按命令写速度/跳跃意图。
// reset-then-apply 让它无状态：本 tick 没收到某玩家命令 → 其实体速度归零。
export function applyMovement(world: IWorld, ordered: readonly Command[]): void {
  for (const [id] of world.query('Controllable', 'Velocity')) {
    const v = world.getComponent<Velocity>(id, 'Velocity')!;
    v.vx = 0;
    // 有重力(Acceleration)的实体，其 vy 归重力/跳跃管，输入不清（否则每 tick 抹掉重力）。
    if (!world.hasComponent(id, 'Acceleration')) v.vy = 0;
    world.removeComponent(id, 'Action');
  }
  for (const cmd of ordered) {
    const target = findControlled(world, cmd.playerId);
    if (target === undefined) continue;
    const v = world.getComponent<Velocity>(target, 'Velocity');
    const c = world.getComponent<Controllable>(target, 'Controllable');
    if (!v || !c) continue;
    v.vx = cmd.move.dx * c.speed;
    if (!world.hasComponent(target, 'Acceleration')) v.vy = cmd.move.dy * c.speed;
    if (cmd.jump) world.addComponent(target, { type: 'Action', name: 'jump', value: 1 } as Action);
  }
}

// 离散原始输入事件：整体覆写单例实体上的 InputQueue.actions（零实体创建/销毁，规避 GC 碎片）。
// 游戏层读 InputQueue.actions 做命中测试/语义解析。每 tick 覆写 = 先清后标的无状态语义。
export function applyRawActions(world: IWorld, ordered: readonly Command[]): void {
  const actions: RawInputData[] = [];
  for (const cmd of ordered) {
    if (cmd.actions) actions.push(...cmd.actions);
  }
  if (!world.hasComponent(INPUT_QUEUE_ENTITY, 'InputQueue')) {
    world.createEntity(INPUT_QUEUE_ENTITY);
    world.addComponent(INPUT_QUEUE_ENTITY, { type: 'InputQueue', actions: [] } as InputQueue);
  }
  world.getComponent<InputQueue>(INPUT_QUEUE_ENTITY, 'InputQueue')!.actions = actions;
}

function findControlled(world: IWorld, playerId: string): EntityId | undefined {
  for (const [id] of world.query('Controllable')) {
    const c = world.getComponent<Controllable>(id, 'Controllable')!;
    if (c.playerId === playerId) return id;
  }
  return undefined;
}
