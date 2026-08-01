import { World } from '@engine/core/world.js';
import { applyCommands } from './commands.js';
import type { Command } from './commands.js';
import { hashSnapshot } from './determinism.js';
import { FixedStepClock } from './fixed-step.js';
import { buildMpWorld, addPlayer, playerEntityId, renderEnts, PLAYER_COLORS } from './mp-world.js';
import type { RenderEnt } from './mp-world.js';

export interface Dir {
  dx: number;
  dy: number;
  jump?: number; // 0/1：平台跳跃用；俯视世界不带（默认 0）
}

// 对端之间交换的报文（经 BroadcastChannel / 任意 Channel 传输）。
export type NetMsg =
  | { t: 'hello'; peer: string }
  | { t: 'bye'; peer: string }
  | { t: 'input'; peer: string; epoch: string; tick: number; dx: number; dy: number; jump?: number }
  | { t: 'hash'; peer: string; epoch: string; tick: number; hash: string };

// 传输抽象：浏览器里用 BroadcastChannel，测试里用内存 mock。
export interface Channel {
  post(msg: NetMsg): void;
  onMessage(cb: (msg: NetMsg) => void): void;
  close(): void;
}

export interface ClientView {
  epoch: string;
  tick: number;
  hash: string;
  youPlayerId: string;
  youEntityId: string;
  youColor: number;
  peerCount: number;
  inSync: boolean;
  ents: RenderEnt[];
}

export interface LockstepOptions {
  peerId: string;
  channel: Channel;
  getInput: () => Dir;
  now?: () => number;
  tickRate?: number;
  inputDelay?: number;
  // 世界构建器（注入 → 同一套 lockstep 既能跑俯视 mp-world，也能跑平台世界）。
  // 入参为按 slot 排好的 playerId 列表；缺省构建 mp-world。所有对端必须构建顺序一致 → 同哈希。
  buildWorld?: (playerIds: string[]) => World;
}

const HEARTBEAT_MS = 250;
const PEER_TIMEOUT_MS = 1200;

// ═══════════════════════════════════════════════════════════════
//  帧同步客户端（lockstep）—— 每个标签页一个。
//
//  各端各跑一份**完整的确定性世界**，只通过 channel 交换"每 tick 的输入"。
//  铁律：第 N tick 必须在所有对端应用**完全相同的输入集合**，状态才能逐位一致。
//  → 严格 lockstep：未集齐本 tick 全部对端输入就等待（同浏览器 ≈ 0 延迟，不会卡）。
//  → 输入提前 inputDelay 个 tick 广播，给传播留出余量。
//  成员变化（开/关标签页）→ 整体回到 tick 0 按新成员重建世界，重新对齐。
//  注意：本类不碰渲染/键盘/网络具体实现，故可在 headless 下用 mock channel 单测。
// ═══════════════════════════════════════════════════════════════
export class LockstepClient {
  private readonly peerId: string;
  private readonly channel: Channel;
  private readonly getInput: () => Dir;
  private readonly buildWorld: (playerIds: string[]) => World;
  private readonly now: () => number;
  private readonly inputDelay: number;
  private readonly clock: FixedStepClock;

  private world!: World;
  private epoch = '';
  private membership: string[] = [];
  private slotOf = new Map<string, number>();
  private simTick = 0;
  private committedInputTick = 0;

  private lastSeen = new Map<string, number>();
  private lastHeartbeat = -Infinity;
  // inputs: epoch -> tick -> peerId -> Dir
  private inputs = new Map<string, Map<number, Map<string, Dir>>>();
  private peerHashAt = new Map<number, string>(); // 对端某 tick 的 hash（仅供"是否同步"显示）

  constructor(opts: LockstepOptions) {
    this.peerId = opts.peerId;
    this.channel = opts.channel;
    this.getInput = opts.getInput;
    this.buildWorld = opts.buildWorld ?? defaultBuildWorld;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.inputDelay = Math.max(1, opts.inputDelay ?? 4);
    this.clock = new FixedStepClock(opts.tickRate ?? 30, { maxSteps: 8 });

    this.channel.onMessage((m) => this.onMessage(m));
    this.recomputeEpoch(); // 建立初始（单人）epoch + 世界
  }

  // 渲染 / HUD 读取的当前视图。
  view(): ClientView {
    const hash = hashSnapshot(this.world.snapshot());
    let inSync = true;
    if (this.membership.length > 1) {
      const ph = this.peerHashAt.get(this.simTick);
      inSync = ph === undefined ? true : ph === hash;
    }
    const slot = this.slotOf.get(this.peerId) ?? 0;
    const youPlayerId = playerIdForSlot(slot);
    return {
      epoch: this.epoch,
      tick: this.simTick,
      hash,
      youPlayerId,
      youEntityId: playerEntityId(youPlayerId),
      youColor: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      peerCount: this.membership.length,
      inSync,
      ents: renderEnts(this.world),
    };
  }

  // 渲染循环每帧调用：推进尽可能多的确定性 tick（受输入集齐与否限制）。
  pump(elapsedMs: number): void {
    const t = this.now();
    if (t - this.lastHeartbeat >= HEARTBEAT_MS) {
      this.lastHeartbeat = t;
      this.channel.post({ t: 'hello', peer: this.peerId });
    }
    this.recomputeEpoch();

    const steps = this.clock.advance(elapsedMs);
    for (let i = 0; i < steps; i++) {
      this.commitLocalInputs();
      const target = this.simTick + 1;
      if (!this.inputsReady(target)) break; // lockstep：等齐对端输入
      this.stepTo(target);
    }
  }

  dispose(): void {
    this.channel.post({ t: 'bye', peer: this.peerId });
    this.channel.close();
  }

  // 当前确定性世界（只读，供渲染后端 sync）。
  getWorld(): World {
    return this.world;
  }

  // ── 成员管理（心跳发现 + 超时剔除；成员串变化即重建 epoch）──
  private recomputeEpoch(): void {
    const t = this.now();
    this.lastSeen.set(this.peerId, t); // 自己永不超时
    const alive = [...this.lastSeen.entries()]
      .filter(([, ts]) => t - ts <= PEER_TIMEOUT_MS)
      .map(([id]) => id)
      .sort();
    const key = alive.join('|');
    if (key !== this.epoch) this.resetEpoch(key, alive);
  }

  private resetEpoch(key: string, members: string[]): void {
    this.epoch = key;
    this.membership = members;
    this.slotOf = new Map(members.map((id, i) => [id, i]));
    this.world = this.buildWorld(members.map((_, i) => playerIdForSlot(i)));
    this.simTick = 0;
    this.committedInputTick = this.inputDelay; // 前 inputDelay 个 tick 视为零输入热身
    if (!this.inputs.has(key)) this.inputs.set(key, new Map());
    this.peerHashAt.clear();
  }

  // ── 报文处理 ──
  private onMessage(m: NetMsg): void {
    if ('peer' in m && m.peer === this.peerId) return; // 忽略自身回声
    switch (m.t) {
      case 'hello':
        this.lastSeen.set(m.peer, this.now());
        this.recomputeEpoch();
        break;
      case 'bye':
        this.lastSeen.delete(m.peer);
        this.recomputeEpoch();
        break;
      case 'input':
        if (m.epoch === this.epoch) this.recordInput(m.epoch, m.tick, m.peer, { dx: m.dx, dy: m.dy, jump: m.jump ?? 0 });
        break;
      case 'hash':
        if (m.epoch === this.epoch) this.peerHashAt.set(m.tick, m.hash);
        break;
    }
  }

  // ── 输入提交 / 查询 ──
  private commitLocalInputs(): void {
    const target = this.simTick + this.inputDelay;
    while (this.committedInputTick < target) {
      this.committedInputTick++;
      const inp = this.getInput();
      this.recordInput(this.epoch, this.committedInputTick, this.peerId, inp);
      this.channel.post({
        t: 'input',
        peer: this.peerId,
        epoch: this.epoch,
        tick: this.committedInputTick,
        dx: inp.dx,
        dy: inp.dy,
        jump: inp.jump ?? 0,
      });
    }
  }

  private recordInput(epoch: string, tick: number, peer: string, inp: Dir): void {
    let e = this.inputs.get(epoch);
    if (!e) {
      e = new Map();
      this.inputs.set(epoch, e);
    }
    let bt = e.get(tick);
    if (!bt) {
      bt = new Map();
      e.set(tick, bt);
    }
    bt.set(peer, inp);
  }

  private inputFor(tick: number, peer: string): Dir | undefined {
    if (tick <= this.inputDelay) return { dx: 0, dy: 0, jump: 0 }; // 热身：全员零输入
    return this.inputs.get(this.epoch)?.get(tick)?.get(peer);
  }

  private inputsReady(tick: number): boolean {
    return this.membership.every((p) => this.inputFor(tick, p) !== undefined);
  }

  private stepTo(tick: number): void {
    const cmds: Command[] = [];
    for (const peer of this.membership) {
      const inp = this.inputFor(tick, peer)!;
      cmds.push({ playerId: playerIdForSlot(this.slotOf.get(peer)!), tick, move: { dx: inp.dx, dy: inp.dy }, jump: inp.jump === 1 });
    }
    applyCommands(this.world, cmds);
    this.world.tick();
    this.simTick = tick;
    this.channel.post({
      t: 'hash',
      peer: this.peerId,
      epoch: this.epoch,
      tick,
      hash: hashSnapshot(this.world.snapshot()),
    });
  }
}

function playerIdForSlot(slot: number): string {
  return `p${slot + 1}`;
}

// 缺省世界：俯视 mp-world + 每个 slot 一个玩家（保持原 lockstep 行为，向后兼容）。
function defaultBuildWorld(playerIds: string[]): World {
  const w = buildMpWorld();
  playerIds.forEach((pid, i) => addPlayer(w, i, pid));
  return w;
}
