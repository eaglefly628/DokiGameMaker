import { describe, it, expect } from 'vitest';
import type { WorldSnapshot } from '@engine/core/types.js';
import { hashSnapshot } from './determinism.js';
import { packKeyframe, diffState, applyPacket, PRESENTATION_COMPONENTS, StateSyncSession } from './state-sync.js';
import type { StateSyncMsg, SyncChannel } from './state-sync.js';

// 小工具：构造快照（plain，含 type 字段，与 World.snapshot 同形）。
const snap = (...ents: [string, Record<string, Record<string, unknown>>][]): WorldSnapshot => {
  const out: WorldSnapshot = {};
  for (const [id, comps] of ents) {
    const m: Record<string, { type: string }> = {};
    for (const t of Object.keys(comps)) m[t] = { type: t, ...comps[t] } as { type: string };
    out[id] = m;
  }
  return out;
};

describe('state-sync · keyframe 打包/还原', () => {
  it('keyframe 往返：applyPacket(null, packKeyframe(s)) 与源逻辑等价', () => {
    const s = snap(['u1', { Transform: { x: 1, y: 2 }, HexPos: { q: 3, r: 4 } }], ['u2', { Resource: { id: 'hp', current: 80 } }]);
    const back = applyPacket(null, packKeyframe(s, 7));
    expect(hashSnapshot(back)).toBe(hashSnapshot(s));
  });

  it('表现层组件不入包（Camera/ScoreTrace 默认排除）', () => {
    expect(PRESENTATION_COMPONENTS.has('Camera')).toBe(true);
    const s = snap(['cam', { Camera: { zoom: 1.8 } }], ['u', { HexPos: { q: 1, r: 1 } }]);
    const pk = packKeyframe(s, 0);
    const state = pk.kind === 'keyframe' ? pk.state : {};
    expect(state.cam).toBeUndefined(); // 纯相机实体整体被滤掉
    expect(state.u?.HexPos).toBeDefined();
  });

  it('深拷贝隔离：包发出后源世界继续改不污染包', () => {
    const s = snap(['u', { Resource: { id: 'hp', current: 100 } }]);
    const pk = packKeyframe(s, 0);
    (s.u.Resource as unknown as { current: number }).current = 1; // 源被后续 tick 改写
    const back = applyPacket(null, pk) as WorldSnapshot;
    expect((back.u.Resource as unknown as { current: number }).current).toBe(100);
  });

  it('include 白名单（兴趣管理）：只打包指定组件', () => {
    const s = snap(['u', { Transform: { x: 9 }, HexPos: { q: 2, r: 2 }, Resource: { current: 5 } }]);
    const pk = packKeyframe(s, 0, { include: new Set(['HexPos', 'Resource']) });
    const state = pk.kind === 'keyframe' ? pk.state : {};
    expect(state.u.Transform).toBeUndefined();
    expect(state.u.HexPos).toBeDefined();
    expect(state.u.Resource).toBeDefined();
  });
});

describe('state-sync · delta 差分/施加', () => {
  it('diff→apply 往返 == next（变更/新增/删组件/删实体 全覆盖）', () => {
    const prev = snap(
      ['a', { Transform: { x: 1 }, Resource: { current: 10 } }],
      ['b', { HexPos: { q: 0, r: 0 } }],
      ['c', { Tag: { flags: 2 } }], // 将被删除
    );
    const next = snap(
      ['a', { Transform: { x: 5 } }],            // Transform 变 + Resource 被删
      ['b', { HexPos: { q: 0, r: 0 }, Tag: { flags: 4 } }], // 不变 + 新增 Tag
      ['d', { Resource: { current: 7 } }],       // 新实体
    );
    const delta = diffState(prev, next, 11, 10);
    const rebuilt = applyPacket(prev, delta) as WorldSnapshot;
    expect(hashSnapshot(rebuilt)).toBe(hashSnapshot(next));
  });

  it('无变化 → 空 delta（upsert/remove 全空）', () => {
    const s = snap(['u', { HexPos: { q: 1, r: 1 } }]);
    const d = diffState(s, structuredClone(s), 1, 0);
    if (d.kind !== 'delta') throw new Error('expect delta');
    expect(Object.keys(d.upsert)).toHaveLength(0);
    expect(d.removeEntities).toHaveLength(0);
    expect(Object.keys(d.removeComponents)).toHaveLength(0);
  });

  it('delta 仅含真正变化的实体（静止单位不进包 → 省带宽）', () => {
    const prev = snap(['still', { HexPos: { q: 1, r: 1 } }], ['mover', { Transform: { x: 0 } }]);
    const next = snap(['still', { HexPos: { q: 1, r: 1 } }], ['mover', { Transform: { x: 3 } }]);
    const d = diffState(prev, next, 2, 1);
    if (d.kind !== 'delta') throw new Error('expect delta');
    expect(Object.keys(d.upsert)).toEqual(['mover']);
  });

  it('delta 无基线 → 抛错（会话层据此请求重发 keyframe）', () => {
    const d = diffState(snap(['u', { Tag: { flags: 1 } }]), snap(['u', { Tag: { flags: 2 } }]), 1, 0);
    expect(() => applyPacket(null, d)).toThrow(/keyframe/);
  });

  it('链式增量：keyframe → 多个 delta 依次施加，末态与逐帧真相一致', () => {
    const f0 = snap(['u', { Resource: { current: 100 } }]);
    const f1 = snap(['u', { Resource: { current: 90 } }]);
    const f2 = snap(['u', { Resource: { current: 75 } }], ['orb', { Tag: { flags: 8 } }]);
    let view = applyPacket(null, packKeyframe(f0, 0));
    view = applyPacket(view, diffState(f0, f1, 1, 0));
    view = applyPacket(view, diffState(f1, f2, 2, 1));
    expect(hashSnapshot(view)).toBe(hashSnapshot(f2));
  });
});

// 双端内存总线：post 广播给所有已注册回调（含发送方自己，由会话内部过滤自身回声）。
class Bus {
  private cbs: ((m: StateSyncMsg) => void)[] = [];
  channel(): SyncChannel {
    return {
      post: (m) => { for (const cb of this.cbs) cb(m); },
      onMessage: (cb) => { this.cbs.push(cb); },
      close: () => {},
    };
  }
}

describe('state-sync · 会话层（关键帧为主 + 增量）', () => {
  it('盟友镜像：A 广播自己世界 → B 的 peerState(A) 逐帧等于 A 的真相', () => {
    const bus = new Bus();
    const A = new StateSyncSession({ peerId: 'A', channel: bus.channel(), keyframeEveryTicks: 4, deltaEveryTicks: 1 });
    const B = new StateSyncSession({ peerId: 'B', channel: bus.channel(), keyframeEveryTicks: 4, deltaEveryTicks: 1 });
    // A 的世界逐帧演化（含位移/新增/删除）。
    const frames = [
      snap(['g1', { HexPos: { q: 1, r: 1 }, Resource: { current: 100 } }]),
      snap(['g1', { HexPos: { q: 1, r: 2 }, Resource: { current: 100 } }]),
      snap(['g1', { HexPos: { q: 1, r: 2 }, Resource: { current: 80 } }], ['orb', { Tag: { flags: 8 } }]),
      snap(['g1', { HexPos: { q: 2, r: 2 }, Resource: { current: 80 } }]), // orb 消失
      snap(['g1', { HexPos: { q: 2, r: 3 }, Resource: { current: 60 } }]),
    ];
    frames.forEach((f, t) => {
      A.broadcast(f, t);
      expect(hashSnapshot(B.peerState('A')!)).toBe(hashSnapshot(f)); // B 镜像逐帧追平 A
    });
    expect(A.peerState('B')).toBeUndefined(); // B 没广播过 → A 无 B 镜像
  });

  it('首发必为关键帧（即便起始 tick 非关键帧拍）→ 收端可独立还原', () => {
    const bus = new Bus();
    const A = new StateSyncSession({ peerId: 'A', channel: bus.channel(), keyframeEveryTicks: 10 });
    const B = new StateSyncSession({ peerId: 'B', channel: bus.channel(), keyframeEveryTicks: 10 });
    A.broadcast(snap(['u', { Tag: { flags: 1 } }]), 7); // tick 7 ≠ 关键帧拍，但首发强制关键帧
    expect(B.peerState('A')).toBeDefined();
  });

  it('丢包自愈：B 错过中间增量 → base 对不上丢弃 → 下个关键帧重新对齐', () => {
    const sent: StateSyncMsg[] = [];
    // A 走一条记录总线（只录不发），B 单独喂——模拟选择性丢包。
    const recA: SyncChannel = { post: (m) => sent.push(m), onMessage: () => {}, close: () => {} };
    const A = new StateSyncSession({ peerId: 'A', channel: recA, keyframeEveryTicks: 3, deltaEveryTicks: 1 });
    const B = new StateSyncSession({ peerId: 'B', channel: { post: () => {}, onMessage: () => {}, close: () => {} } });
    const frames = [
      snap(['u', { Resource: { current: 100 } }]), // t0 keyframe
      snap(['u', { Resource: { current: 90 } }]),  // t1 delta（故意丢给 B）
      snap(['u', { Resource: { current: 80 } }]),  // t2 delta（基线 t1，B 没有 → 丢弃）
      snap(['u', { Resource: { current: 70 } }]),  // t3 keyframe → B 自愈
    ];
    frames.forEach((f, t) => A.broadcast(f, t));
    // B 收到：t0 关键帧、(丢 t1)、t2 增量、t3 关键帧。
    const deliver = (m: StateSyncMsg): void => { (B as unknown as { onMessage: (m: StateSyncMsg) => void }).onMessage(m); };
    deliver(sent[0]); // t0 keyframe
    expect(hashSnapshot(B.peerState('A')!)).toBe(hashSnapshot(frames[0]));
    deliver(sent[2]); // t2 delta（base t1，B 持 t0 → 丢弃）
    expect(hashSnapshot(B.peerState('A')!)).toBe(hashSnapshot(frames[0])); // 仍停在 t0
    deliver(sent[3]); // t3 keyframe → 自愈到 t3
    expect(hashSnapshot(B.peerState('A')!)).toBe(hashSnapshot(frames[3]));
  });
});
