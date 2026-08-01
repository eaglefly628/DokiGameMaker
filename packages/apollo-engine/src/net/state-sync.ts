import type { WorldSnapshot, EntityId, ComponentType, Component } from '@engine/core/types.js';

// ═══════════════════════════════════════════════════════════════
//  状态同步 · 打包层（state-sync packing）
// ═══════════════════════════════════════════════════════════════
//
//  模型与 lockstep 互补：lockstep = 所有人跑同一个确定性世界、只同步输入；
//  本层 = **每人各跑自己的世界**，把自己世界的状态打包成「包」广播给盟友只读镜像
//  （金铲铲式偷看队友棋盘）。不要求跨端确定性，不同步输入——只搬运状态。
//
//  本文件只管「**怎么把一个 WorldSnapshot 打成可传输的包 / 从包还原**」这一最底层问题，
//  与「用哪种同步法（全量广播 / 增量流 / 兴趣管理）」无关——三种方法共用这些原语。
//  会话/协议层（谁广播、多久一次、走什么传输）在选定方法后再叠在本层之上。
//
//  两种包：
//   · keyframe（关键帧）= 全量基线，自包含可独立还原。
//   · delta（增量）    = 相对某个已知 baseTick 状态的差分，省带宽（典型只有少数实体在动）。
//  二者皆 plain object → JSON / structuredClone 直接可传（serialization.md：组件皆 POD）。
// ═══════════════════════════════════════════════════════════════

// 表现层/可重算组件不进同步包（与 determinism.ts 同源理由）：含浮点或本地视角，
// 盟友镜像只需逻辑真相（HexPos/Resource/Tag/Status…），渲染件由观看端表现层重算。
export const PRESENTATION_COMPONENTS: ReadonlySet<ComponentType> = new Set(['Camera', 'ScoreTrace']);

// 组件类型过滤：给 include（白名单，兴趣管理用）则只打包白名单内的；
// 否则打包除 exclude（默认=表现层）外的全部。
export interface SyncFilter {
  include?: ReadonlySet<ComponentType>;
  exclude?: ReadonlySet<ComponentType>;
}

export type StatePacket =
  | { kind: 'keyframe'; tick: number; state: WorldSnapshot }
  | {
      kind: 'delta';
      tick: number;
      baseTick: number; // 本增量相对的基线 tick；接收端 base 不是它则需请求重发 keyframe
      upsert: WorldSnapshot; // 新增/变更的「实体→组件」（组件为整件覆盖，非字段级）
      removeEntities: EntityId[]; // 整实体消失
      removeComponents: Record<EntityId, ComponentType[]>; // 实体仍在、个别组件被移除
    };

const keep = (type: ComponentType, filter?: SyncFilter): boolean => {
  if (filter?.include) return filter.include.has(type);
  return !(filter?.exclude ?? PRESENTATION_COMPONENTS).has(type);
};

// 规范化字符串：用于「组件是否变化」的确定性逐位比较（字段排序，-0 归一；与 determinism.ts 同纪律）。
function canon(v: unknown): string {
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (v === null || typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${k}:${canon(o[k])}`).join(',')}}`;
}
const compEqual = (a: Component, b: Component): boolean => canon(a) === canon(b);

// 过滤 + 深拷贝一个快照（不让包与源世界共享引用——源世界继续 tick 不污染已发出的包）。
function cloneFiltered(snapshot: WorldSnapshot, filter?: SyncFilter): WorldSnapshot {
  const out: WorldSnapshot = {};
  for (const id of Object.keys(snapshot)) {
    const comps = snapshot[id];
    const kept: Record<ComponentType, Component> = {};
    let any = false;
    for (const type of Object.keys(comps)) {
      if (!keep(type, filter)) continue;
      kept[type] = structuredClone(comps[type]);
      any = true;
    }
    if (any) out[id] = kept; // 全组件被过滤掉的实体不入包（如纯相机实体）
  }
  return out;
}

// 关键帧：把当前快照打成自包含全量包。
export function packKeyframe(snapshot: WorldSnapshot, tick: number, filter?: SyncFilter): StatePacket {
  return { kind: 'keyframe', tick, state: cloneFiltered(snapshot, filter) };
}

// 增量：prev→next 的组件级差分（变化的整件覆盖；消失的列入移除）。两端皆先过滤再比，口径一致。
export function diffState(prev: WorldSnapshot, next: WorldSnapshot, tick: number, baseTick: number, filter?: SyncFilter): StatePacket {
  const p = cloneFiltered(prev, filter);
  const n = cloneFiltered(next, filter);
  const upsert: WorldSnapshot = {};
  const removeEntities: EntityId[] = [];
  const removeComponents: Record<EntityId, ComponentType[]> = {};

  for (const id of Object.keys(n)) {
    const nc = n[id];
    const pc = p[id];
    if (!pc) { upsert[id] = nc; continue; } // 新实体：整体 upsert
    const changed: Record<ComponentType, Component> = {};
    let anyChanged = false;
    for (const type of Object.keys(nc)) {
      if (!pc[type] || !compEqual(pc[type], nc[type])) { changed[type] = nc[type]; anyChanged = true; }
    }
    if (anyChanged) upsert[id] = changed;
    const gone = Object.keys(pc).filter((type) => !(type in nc));
    if (gone.length) removeComponents[id] = gone;
  }
  for (const id of Object.keys(p)) {
    if (!(id in n)) removeEntities.push(id);
  }
  return { kind: 'delta', tick, baseTick, upsert, removeEntities, removeComponents };
}

// 还原：keyframe 自包含直接得新快照；delta 在 base 之上施加（base 由接收端持有的上一个状态提供）。
// 入参 base 为 null 时只能 apply keyframe（delta 无基线 → 抛错，由会话层兜底请求重发 keyframe）。
export function applyPacket(base: WorldSnapshot | null, packet: StatePacket): WorldSnapshot {
  if (packet.kind === 'keyframe') return structuredClone(packet.state);
  if (!base) throw new Error('state-sync: delta 无基线快照，需先收到 keyframe');
  const out: WorldSnapshot = structuredClone(base);
  for (const id of packet.removeEntities) delete out[id];
  for (const id of Object.keys(packet.removeComponents)) {
    const comps = out[id];
    if (comps) for (const type of packet.removeComponents[id]) delete comps[type];
  }
  for (const id of Object.keys(packet.upsert)) {
    const comps = (out[id] ??= {});
    const inc = packet.upsert[id];
    for (const type of Object.keys(inc)) comps[type] = structuredClone(inc[type]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  状态同步 · 会话层（关键帧为主 + 增量流；用户 2026-06-13 选定）
// ═══════════════════════════════════════════════════════════════
//
//  每端各自拥有一个世界，每 tick 把自己快照交给本会话；会话按节奏广播自己的状态、
//  并维护「盟友 peerId → 最新只读镜像快照」供观看端表现层画队友棋盘。传输经注入的
//  SyncChannel（开发=BroadcastChannel 包装 / 生产=WebSocket / 测试=mock），与 lockstep 同纪律。
//
//  节奏（不认识游戏相位——统一一套即覆盖备战/战斗）：
//   · 关键帧每 keyframeEveryTicks 发一次（抗漂移 + 给增量提供自愈基线）；
//   · 其余按 deltaEveryTicks 发组件级增量。备战几乎无变化→增量天然≈空≈零成本；
//     战斗变化多→增量承载位移。收端 base 对不上（丢包/迟到）即丢弃该增量，等下一个关键帧自愈。
// ═══════════════════════════════════════════════════════════════

export interface StateSyncMsg {
  peer: string; // 发送方 peerId
  packet: StatePacket;
}

export interface SyncChannel {
  post(msg: StateSyncMsg): void;
  onMessage(cb: (msg: StateSyncMsg) => void): void;
  close(): void;
}

export interface StateSyncOptions {
  peerId: string;
  channel: SyncChannel;
  keyframeEveryTicks?: number; // 缺省 30（≈0.5s@60tps）
  deltaEveryTicks?: number; // 缺省 1（每 tick 增量；填 2/3 降频）
  filter?: SyncFilter;
}

interface PeerMirror {
  snapshot: WorldSnapshot; // 当前已还原的盟友状态
  tick: number; // 该状态对应的发送方 tick（增量 base 对账用）
}

export class StateSyncSession {
  private readonly peerId: string;
  private readonly channel: SyncChannel;
  private readonly kEvery: number;
  private readonly dEvery: number;
  private readonly filter?: SyncFilter;

  private lastSent: WorldSnapshot | null = null; // 本端上次发出的状态（增量基线）
  private lastSentTick = -1;
  private readonly mirrors = new Map<string, PeerMirror>(); // 盟友只读镜像

  constructor(opts: StateSyncOptions) {
    this.peerId = opts.peerId;
    this.channel = opts.channel;
    this.kEvery = Math.max(1, opts.keyframeEveryTicks ?? 30);
    this.dEvery = Math.max(1, opts.deltaEveryTicks ?? 1);
    this.filter = opts.filter;
    this.channel.onMessage((m) => this.onMessage(m));
  }

  // 本端每 tick 调用：按节奏广播自己的状态（首发或到关键帧拍=关键帧，否则=增量）。
  broadcast(snapshot: WorldSnapshot, tick: number): void {
    const needKeyframe = this.lastSent === null || tick % this.kEvery === 0;
    if (needKeyframe) {
      const pk = packKeyframe(snapshot, tick, this.filter);
      this.channel.post({ peer: this.peerId, packet: pk });
      this.lastSent = pk.kind === 'keyframe' ? pk.state : null;
      this.lastSentTick = tick;
      return;
    }
    if (tick % this.dEvery !== 0) return; // 非增量拍：不发
    const delta = diffState(this.lastSent!, snapshot, tick, this.lastSentTick, this.filter);
    this.channel.post({ peer: this.peerId, packet: delta });
    // 推进基线到本次发出的状态（= 过滤后的 next；用 applyPacket 在旧基线上施加增量得到，确保与收端一致）。
    this.lastSent = applyPacket(this.lastSent, delta);
    this.lastSentTick = tick;
  }

  // 盟友最新只读镜像（缺失/尚未收到关键帧 → undefined）。观看端表现层据此画队友棋盘。
  peerState(peerId: string): WorldSnapshot | undefined {
    return this.mirrors.get(peerId)?.snapshot;
  }
  peers(): string[] {
    return [...this.mirrors.keys()];
  }

  dispose(): void {
    this.channel.close();
  }

  private onMessage(m: StateSyncMsg): void {
    if (m.peer === this.peerId) return; // 忽略自身回声
    const { packet } = m;
    if (packet.kind === 'keyframe') {
      this.mirrors.set(m.peer, { snapshot: applyPacket(null, packet), tick: packet.tick });
      return;
    }
    // 增量：基线必须与已持有的发送方 tick 严格对账；对不上即丢弃，等下一个关键帧自愈。
    const cur = this.mirrors.get(m.peer);
    if (!cur || cur.tick !== packet.baseTick) return;
    this.mirrors.set(m.peer, { snapshot: applyPacket(cur.snapshot, packet), tick: packet.tick });
  }
}
