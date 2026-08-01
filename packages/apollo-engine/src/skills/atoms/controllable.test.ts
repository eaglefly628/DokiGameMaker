import { describe, it, expect } from 'vitest';
import { COMPONENT_PROVIDERS, inferCapabilityIds } from '../../assembly/capability-registry.js';
import { parseManifestDetailed } from '../../assembly/manifest.js';
import { controllablePlayerIds } from '../../studio/DataCartridgeRunner.js';

// i3-controllable（owner 07-11「按箭头/AD 不动」修）：把运行时 applyMovement 的操控契约登记进词表——
// 此前 Controllable 无 provider：目录查不到、推断推不出、体检永远黄告警，AI 只能瞎猜 i1/i2。

describe('i3-controllable · 操控契约进词表', () => {
  it('Controllable 有 provider（目录可发现·告警消除的根据）', () => {
    expect(COMPONENT_PROVIDERS.get('Controllable')).toBe('i3-controllable');
  });

  it('从 entities 可推断出 i3-controllable（未声明 capabilities 的稿也接得住）', () => {
    const ids = inferCapabilityIds({ hero: { Controllable: { playerId: 'p1', speed: 3 } } });
    expect(ids).toContain('i3-controllable');
  });

  it('声明 i3-controllable 后 Controllable 不再进「无 provider」告警', () => {
    const r = parseManifestDetailed({
      capabilities: ['a1-transform', 'b1-velocity', 'i3-controllable', 't1-motion-apply'],
      entities: { hero: { Transform: { x: 0, y: 0 }, Velocity: { vx: 0, vy: 0 }, Controllable: { playerId: 'p1', speed: 3 } } },
    });
    expect(r.warnings.filter((w) => w.includes('Controllable'))).toEqual([]);
  });
});

describe('cartInput · 卡带键盘接线的玩家发现（RunOnly 修）', () => {
  const bp = (entities: Record<string, Record<string, unknown>>) =>
    parseManifestDetailed({ capabilities: ['a1-transform'], entities }).blueprint;

  it('无 Controllable → 无玩家（不挂监听器）', () => {
    expect(controllablePlayerIds(bp({ e: { Transform: { x: 0, y: 0 } } }))).toEqual([]);
  });

  it('单人/双人：playerId 去重升序（p1 方向键·p2 WASD 的分配根据）', () => {
    expect(controllablePlayerIds(bp({
      l: { Transform: { x: 0, y: 0 }, Controllable: { playerId: 'p2', speed: 4 } },
      r: { Transform: { x: 1, y: 0 }, Controllable: { playerId: 'p1', speed: 4 } },
      dup: { Transform: { x: 2, y: 0 }, Controllable: { playerId: 'p1', speed: 4 } },
    }))).toEqual(['p1', 'p2']);
  });
});
