import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld, EntityId } from '@engine/core/types.js';
import type { RandomSeed } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  behavior-tree —— 通用行为树能力（REQ-BT·Lead 2026-07-17 设计稿·tier2·确定性关键）。
//
//  真缺口（Lead 裁决）：condition/flow/event-when 只能摆平铺分支；「优先级选择树 + 黑板 +
//  可复用子树 + 逐 tick 确定性推进」是结构性缺口，硬拼必逼游戏层长出私有解释器（违宪）。本能力补上，
//  且**独立于任何单游戏**——NPC/敌 AI/牌桌对手皆可复用（消费方定格：game-a 记牌分档/性格权重、
//  game-b 三姨太人设/难度三档、game-c 五性格模板）。
//
//  五要素（严守设计稿·不越界）：
//    ① 树=纯数据 {root: Node}·Node 闭集 v1 就五种：selector/sequence/invert/condition/action
//       （parallel/decorator/running 等 YAGNI 不做·后议走 capgap）。装载期校验：结构/深度上限/叶名在册。
//    ② 黑板=既有存储：条件/动作叶读写现成 Resource/Flag/StringVar（本能力**不新立存储组件**·
//       provides 为空即此意——BT 只借既有黑板与 RandomSeed，不往组件闭集塞新零件）。
//    ③ 叶注册表：registerBTLeaves(gameId, {name: fn})——消费方注册自己的条件/动作叶（TS 例外口径下的
//       合法游戏层代码）；叶签名 (world, entity, args, seed) → boolean | BTAction。
//    ④ 确定性：tick 制逐帧重评估（selector 优先级语义）；一切随机**经传入 RandomSeed**（游戏读世界
//       RandomSeed 单例传入·叶内走 nextRandom 推进）→ 同 seed 同黑板 → 同决策轨（回放/万手 sim 依据）。
//       绝不 Math.random。
//    ⑤ 与 condition/flow 的关系（防误用）：BT=每 tick 重评估的**优先级策略树**；t3-flow=**状态驻留**
//       流转机——互补不替代。简单平铺分支用 event-when/condition 即可，别上 BT。
//
//  形态（照 dice.ts/modifier-stack 先例·纯函数核 + 注册的能力对象）：
//    · tickBehaviorTree(tree, gameId, world, entity, seed?) —— 确定性解释器（纯：除叶自身副作用外无副作用）。
//    · validateBehaviorTree / checkBehaviorTree —— 装载期校验（结构/深度/叶名在册）。
//    · registerBTLeaves / getBTLeaf / … —— 叶注册表（消费方注册·按名查表·迭代序不影响结果）。
//    · behaviorTreeCapability —— 注册进 registry 供 manifest 引用 + 创作台自描述目录可见；无组件/无系统
//      （驱动由消费方在自己的决策点调 tickBehaviorTree·牌桌 AI 按回合决策而非每帧·故不设引擎系统）。
// ═══════════════════════════════════════════════════════════════

// ── 节点闭集（v1 恰五种·多一种都不加） ───────────────────────────────
export type BTNodeType = 'selector' | 'sequence' | 'invert' | 'condition' | 'action';

// tick 求值状态（v1 二值·无 running：tick 制每帧重评估·running 属 YAGNI 后议）。
export type BTStatus = 'success' | 'failure';

// 树节点（纯数据·structuredClone 友好·可进 snapshot·最弱 LLM 可产）。
//   selector/sequence —— children 非空数组（复合）
//   invert            —— children 恰 1 个（修饰·取反）
//   condition/action  —— leaf 名（在注册表内）+ 可选 args（纯数据·传给叶）
export interface BTNode {
  readonly type: BTNodeType;
  readonly name?: string; // 可选标注（调试/审计·不影响求值）
  readonly children?: readonly BTNode[]; // selector/sequence（≥1）；invert（恰 1）
  readonly leaf?: string; // condition/action：注册表中的叶名
  readonly args?: Readonly<Record<string, unknown>>; // 叶参数（纯数据）
}

// 一棵行为树（设计稿定稿形状：{root: Node}）。消费方本地薄实现须照此形状产数据（迁移零改）。
export interface BehaviorTree {
  readonly root: BTNode;
}

// ── 叶（消费方注册的条件/动作） ───────────────────────────────
// 决策载荷：action 叶可返回一个纯数据对象表示「本 tick 选了什么」（如出哪手牌）；解释器沿**成功路径**
// 把它 surface 到 tick 结果的 action 字段。condition 叶返回 boolean（true=success）。
export type BTAction = Readonly<Record<string, unknown>>;

// 叶返回值：boolean（成/败）或 BTAction（视作成功 + 决策载荷）。
export type BTLeafResult = boolean | BTAction;

// 叶签名（设计稿②）：读/写黑板（world+entity 取 Resource/Flag/StringVar）、按 args 参数化、
// 随机经传入 seed（叶内 nextRandom(seed) 推进·确定性）。
export type BTLeafFn = (
  world: IWorld,
  entity: EntityId,
  args: Readonly<Record<string, unknown>>,
  seed: RandomSeed | undefined,
) => BTLeafResult;

export type BTLeafTable = Readonly<Record<string, BTLeafFn>>;

// tick 结果：状态 + 成功路径上最后一个 action 叶产出的决策载荷（若有）。
export interface BTTickResult {
  readonly status: BTStatus;
  readonly action?: BTAction;
}

const EMPTY_ARGS: Readonly<Record<string, unknown>> = Object.freeze({});
const RESULT_FAILURE: BTTickResult = Object.freeze({ status: 'failure' });
const RESULT_SUCCESS: BTTickResult = Object.freeze({ status: 'success' });

// ── 叶注册表（设计稿③） ───────────────────────────────
// 按 gameId → name → fn 分域（各游戏注册自己的叶·同名不撞车）。**迭代序永不影响求值**——叶只按名查表、
// 按树遍历序调用；注册序/迭代序无关 → 确定性不受注册顺序影响。函数是游戏层代码（TS 例外口径），
// 不进 snapshot/manifest（manifest 只存树数据 + 叶名单）。
const LEAF_REGISTRY = new Map<string, Map<string, BTLeafFn>>();

/** 注册一批叶到某游戏域（重复名后注册者覆盖·merge 语义·供分批注册）。 */
export function registerBTLeaves(gameId: string, table: BTLeafTable): void {
  let m = LEAF_REGISTRY.get(gameId);
  if (!m) {
    m = new Map<string, BTLeafFn>();
    LEAF_REGISTRY.set(gameId, m);
  }
  for (const [name, fn] of Object.entries(table)) m.set(name, fn);
}

/** 取某游戏域的某叶（未注册 → undefined）。 */
export function getBTLeaf(gameId: string, name: string): BTLeafFn | undefined {
  return LEAF_REGISTRY.get(gameId)?.get(name);
}

/** 某叶是否已注册。 */
export function hasBTLeaf(gameId: string, name: string): boolean {
  return LEAF_REGISTRY.get(gameId)?.has(name) ?? false;
}

/** 某游戏域已注册的全部叶名（供装载校验对照 config 声明的叶名单）。 */
export function registeredLeafNames(gameId: string): ReadonlySet<string> {
  const m = LEAF_REGISTRY.get(gameId);
  return new Set(m ? m.keys() : []);
}

/** 清空注册表（给 gameId 清该域·不给清全部）。主要供测试隔离；生产按需重置。 */
export function clearBTLeaves(gameId?: string): void {
  if (gameId === undefined) LEAF_REGISTRY.clear();
  else LEAF_REGISTRY.delete(gameId);
}

// ── 装载期校验（设计稿①） ───────────────────────────────
export const MAX_BT_DEPTH = 64; // 深度上限（防手滑/生成器造出无界深树·有界 → tick 栈有界）。

export interface BTValidateOptions {
  readonly maxDepth?: number; // 覆盖 MAX_BT_DEPTH
  readonly knownLeaves?: ReadonlySet<string>; // 给了则校验：每个 leaf 名必在其中（否则记 issue）
}

/** 从一棵树收集全部用到的叶名（供消费方对照「该注册哪些叶」·或做叶名在册校验）。 */
export function collectBTLeafNames(root: BTNode): Set<string> {
  const names = new Set<string>();
  const walk = (n: BTNode | undefined): void => {
    if (!n || typeof n !== 'object') return;
    if ((n.type === 'condition' || n.type === 'action') && typeof n.leaf === 'string') names.add(n.leaf);
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return names;
}

/**
 * 结构/深度/叶名校验 → 问题清单（空=通过）。非抛出版（供工具/UI 收集展示）。
 * 校验：节点类型在闭集内；selector/sequence 需非空 children；invert 需恰 1 child；condition/action 需 leaf
 * 名且无 children；复合节点不应带 leaf；深度 ≤ maxDepth；给了 knownLeaves 则叶名必在册。
 */
export function checkBehaviorTree(root: BTNode, opts: BTValidateOptions = {}): string[] {
  const maxDepth = opts.maxDepth ?? MAX_BT_DEPTH;
  const issues: string[] = [];
  const walk = (node: BTNode | undefined, depth: number, path: string): void => {
    if (!node || typeof node !== 'object') {
      issues.push(`${path}: 空/非法节点`);
      return;
    }
    if (depth > maxDepth) {
      issues.push(`${path}: 超深度上限 ${maxDepth}`);
      return;
    }
    switch (node.type) {
      case 'selector':
      case 'sequence': {
        const ch = node.children;
        if (!Array.isArray(ch) || ch.length === 0) {
          issues.push(`${path}(${node.type}): 需非空 children`);
          break;
        }
        if (node.leaf !== undefined) issues.push(`${path}(${node.type}): 复合节点不应带 leaf`);
        ch.forEach((c, i) => walk(c, depth + 1, `${path}/${node.type}[${i}]`));
        break;
      }
      case 'invert': {
        const ch = node.children;
        if (!Array.isArray(ch) || ch.length !== 1) {
          issues.push(`${path}(invert): 需恰 1 个 child`);
          break;
        }
        if (node.leaf !== undefined) issues.push(`${path}(invert): 修饰节点不应带 leaf`);
        walk(ch[0], depth + 1, `${path}/invert`);
        break;
      }
      case 'condition':
      case 'action': {
        if (typeof node.leaf !== 'string' || node.leaf.length === 0) {
          issues.push(`${path}(${node.type}): 需 leaf 名`);
          break;
        }
        if (node.children !== undefined) issues.push(`${path}(${node.type}): 叶节点不应带 children`);
        if (opts.knownLeaves && !opts.knownLeaves.has(node.leaf)) {
          issues.push(`${path}(${node.type}): 叶 "${node.leaf}" 未注册`);
        }
        break;
      }
      default:
        issues.push(
          `${path}: 未知节点类型 "${(node as { type?: string }).type}"（闭集：selector/sequence/invert/condition/action）`,
        );
    }
  };
  walk(root, 0, '$');
  return issues;
}

/** 装载校验（抛出版）：有任一问题即 throw（=设计稿「未注册叶装载即错」）。 */
export function validateBehaviorTree(root: BTNode, opts: BTValidateOptions = {}): void {
  const issues = checkBehaviorTree(root, opts);
  if (issues.length) {
    throw new Error(`behavior-tree 装载校验失败:\n  - ${issues.join('\n  - ')}`);
  }
}

/** 便捷：按某游戏**已注册的叶**做装载校验（叶名必在该域注册表内）。 */
export function validateBehaviorTreeForGame(root: BTNode, gameId: string, opts: BTValidateOptions = {}): void {
  validateBehaviorTree(root, { ...opts, knownLeaves: registeredLeafNames(gameId) });
}

// ── 确定性解释器（设计稿④） ───────────────────────────────
interface BTTickCtx {
  readonly world: IWorld;
  readonly entity: EntityId;
  readonly seed: RandomSeed | undefined;
  readonly leaf: (name: string) => BTLeafFn | undefined;
}

// 单节点求值（递归·深度有界·遍历序确定）。
function tickNode(node: BTNode, ctx: BTTickCtx): BTTickResult {
  switch (node.type) {
    case 'selector': {
      // 优先级选择：按序试子节点，首个成功即止并原样上抛其结果（含决策）；全败 → 失败。
      for (const c of node.children ?? []) {
        const r = tickNode(c, ctx);
        if (r.status === 'success') return r;
      }
      return RESULT_FAILURE;
    }
    case 'sequence': {
      // 按序全过：任一失败即止（丢弃已产决策）；全过 → 成功·surface 序内最后一个决策。
      let action: BTAction | undefined;
      for (const c of node.children ?? []) {
        const r = tickNode(c, ctx);
        if (r.status === 'failure') return RESULT_FAILURE;
        if (r.action !== undefined) action = r.action;
      }
      return action !== undefined ? { status: 'success', action } : RESULT_SUCCESS;
    }
    case 'invert': {
      // 取反修饰（典型包 condition）：翻转状态·不 surface 决策（反相后的成功不携决策）。
      const child = (node.children ?? [])[0];
      const r = child ? tickNode(child, ctx) : RESULT_FAILURE;
      return r.status === 'success' ? RESULT_FAILURE : RESULT_SUCCESS;
    }
    case 'condition': {
      // 未注册叶：运行时 fail-closed（返回失败·不抛）——硬拦交装载校验 validateBehaviorTree。
      const fn = node.leaf ? ctx.leaf(node.leaf) : undefined;
      if (!fn) return RESULT_FAILURE;
      const res = fn(ctx.world, ctx.entity, node.args ?? EMPTY_ARGS, ctx.seed);
      return res ? RESULT_SUCCESS : RESULT_FAILURE;
    }
    case 'action': {
      const fn = node.leaf ? ctx.leaf(node.leaf) : undefined;
      if (!fn) return RESULT_FAILURE;
      const res = fn(ctx.world, ctx.entity, node.args ?? EMPTY_ARGS, ctx.seed);
      if (res === false) return RESULT_FAILURE;
      if (res === true) return RESULT_SUCCESS;
      return { status: 'success', action: res }; // 对象载荷 = 成功 + 决策
    }
    default:
      // 闭集外类型（装载校验会先拦）→ 运行时 fail-closed。
      return RESULT_FAILURE;
  }
}

/**
 * 确定性 tick 一棵行为树 → {status, action?}。
 *  - tree：BehaviorTree{root} 或直接 BTNode 根。
 *  - gameId：叶从该游戏域注册表按名查取。
 *  - world/entity：黑板作用域（叶读写自身/全局 Resource/Flag/StringVar）。
 *  - seed：随机源（叶内 nextRandom(seed) 推进·同 seed 同黑板 → 同结果·回放/万手 sim 安全）。缺省无随机。
 * 纯函数语义：解释器本身无副作用；一切世界写由叶自身完成（消费方决定叶写什么）。
 */
export function tickBehaviorTree(
  tree: BehaviorTree | BTNode,
  gameId: string,
  world: IWorld,
  entity: EntityId,
  seed?: RandomSeed,
): BTTickResult {
  const root: BTNode = 'root' in tree ? tree.root : tree;
  return tickNode(root, { world, entity, seed, leaf: (name) => getBTLeaf(gameId, name) });
}

export const behaviorTreeCapability = defineCapability({
  id: 't2-behavior-tree',
  version: '1.0.0',

  describe: {
    name: 'behavior-tree',
    summary:
      '通用行为树：纯数据树（selector/sequence/invert/condition/action 五节点闭集）+ 确定性解释器。黑板复用既有 Resource/Flag/StringVar（不新立存储）；叶=消费方注册表 registerBTLeaves(gameId,{name:fn})；随机全经传入 RandomSeed → 同 seed 同黑板同决策轨（回放/万手 sim）。',
    semantic: ['tier2', 'ai', 'behavior-tree', 'determinism'],
    whenToUse:
      'AI 外层优先级策略（NPC/敌/牌桌对手）：把「按优先级选一支能跑的行为」摆成纯数据树，逐 tick 重评估。selector=优先级选择、sequence=按序全过、invert=取反、condition/action=消费方注册的叶（读写黑板/产决策）。树数据 + 估值表由游戏产，叶=游戏注册的 TS 例外代码。与 t3-flow 互补：flow=状态驻留流转机，BT=每 tick 重评估的优先级树；简单平铺分支用 event-when/condition 即可，别上 BT。',
    examples: [
      "优先级选择：{type:'selector', children:[ {type:'sequence', children:[{type:'condition', leaf:'canPlayBomb'}, {type:'action', leaf:'playBomb'}]}, {type:'action', leaf:'playSmallest'} ]}（能炸就炸·否则出最小）",
      "取反守门：{type:'sequence', children:[ {type:'invert', children:[{type:'condition', leaf:'isTeammateLead'}]}, {type:'action', leaf:'pressHard'} ]}（非队友领出才压）",
      "性格权重（数据·非节点）：leaf 'playAggressive' 读黑板 Resource(aggression) 与传入 seed 掷 nextRandom 决定激进度 → 同 seed 同黑板复现",
    ],
  },

  // 不新立组件（设计稿②）：BT 只借既有黑板（Resource/Flag/StringVar）与 RandomSeed，
  // 树本身=纯数据由消费方持有并在决策点调 tickBehaviorTree。故 provides 为空、无系统（无引擎级每帧驱动）。
  components: {
    provides: {},
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {},

  systems: [],
});
