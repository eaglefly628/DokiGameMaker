import { describe, it, expect } from 'vitest';
import { createEventLog, EventLog, type LogEntry } from './event-log.js';

// event-log 泛型数据结构测试（REQ-EVENTLOG·对齐 skills 1:1 测试文化）。
// seq 自增 / recent 截断 / dump 格式 / 泛型 Extra 透传 / clear 归零，纯数据零随机。

type Kind = 'deal' | 'action' | 'info';

describe('event-log.push — seq 自增', () => {
  it('seq 从 0 单调自增', () => {
    const log = createEventLog<Kind>();
    log.push({ kind: 'deal', text: '发牌' });
    log.push({ kind: 'action', text: '跟注' });
    log.push({ kind: 'info', text: '进街' });
    expect(log.all().map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(log.size()).toBe(3);
  });
  it('push 返回含 seq 的完整条目', () => {
    const log = createEventLog<Kind>();
    const rec = log.push({ kind: 'deal', text: 'x' });
    expect(rec.seq).toBe(0);
    expect(rec.kind).toBe('deal');
  });
});

describe('event-log.recent — 近 k 条截断', () => {
  it('recent(k) 取尾部 k 条（追加序）', () => {
    const log = createEventLog<Kind>();
    for (let i = 0; i < 20; i++) log.push({ kind: 'info', text: `e${i}` });
    const r = log.recent(3);
    expect(r.map((e) => e.text)).toEqual(['e17', 'e18', 'e19']);
  });
  it('k≤0 → 空；k>size → 全部', () => {
    const log = createEventLog<Kind>();
    log.push({ kind: 'info', text: 'a' });
    expect(log.recent(0)).toEqual([]);
    expect(log.recent(-1)).toEqual([]);
    expect(log.recent(99)).toHaveLength(1);
  });
});

describe('event-log — 泛型 Extra 透传（game-b 式 round/actor/tile）', () => {
  it('Extra 字段随条目落盘 + 可回读', () => {
    const log = createEventLog<Kind, { round: string; actor: string; tile?: number }>();
    log.push({ kind: 'deal', text: '摸牌', round: '東1局', actor: '主角', tile: 34 });
    const e = log.all()[0];
    expect(e.round).toBe('東1局');
    expect(e.actor).toBe('主角');
    expect(e.tile).toBe(34);
    expect(e.seq).toBe(0); // core 骨架仍管 seq
  });
});

describe('event-log.dump / clear', () => {
  it('dump 缺省格式 #seq [kind] text', () => {
    const log = createEventLog<Kind>();
    log.push({ kind: 'deal', text: '发牌' });
    log.push({ kind: 'action', text: '弃牌' });
    expect(log.dump()).toBe('#0 [deal] 发牌\n#1 [action] 弃牌');
  });
  it('dump 自定义格式器', () => {
    const log = createEventLog<Kind>();
    log.push({ kind: 'info', text: 'hi' });
    expect(log.dump((e) => e.text.toUpperCase())).toBe('HI');
  });
  it('clear 归零 seq 与内容', () => {
    const log = createEventLog<Kind>();
    log.push({ kind: 'info', text: 'a' });
    log.clear();
    expect(log.size()).toBe(0);
    const rec = log.push({ kind: 'info', text: 'b' });
    expect(rec.seq).toBe(0); // seq 重置
  });
});

describe('event-log — new EventLog 与 createEventLog 等价', () => {
  it('两种构造行为一致', () => {
    const a = new EventLog<Kind>();
    const b = createEventLog<Kind>();
    a.push({ kind: 'info', text: 'x' });
    b.push({ kind: 'info', text: 'x' });
    const stripSeq = (e: LogEntry<Kind>) => ({ kind: e.kind, text: e.text, seq: e.seq });
    expect(a.all().map(stripSeq)).toEqual(b.all().map(stripSeq));
  });
});
