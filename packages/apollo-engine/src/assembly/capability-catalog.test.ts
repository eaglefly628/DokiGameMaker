import { describe, it, expect } from 'vitest';
import { buildCapabilityCatalog } from './capability-catalog.js';
import { ALL_CAPABILITIES } from './capability-registry.js';
import { hitboxCapability } from '@skills/tier2/index.js';

describe('capability-catalog — 引擎自描述 → LLM 可读目录', () => {
  it('单能力格式：id/名/摘要 + 组件字段签名', () => {
    const cat = buildCapabilityCatalog([hitboxCapability], { withExamples: false, withWhenToUse: false });
    expect(cat).toContain('- t2-hitbox (hitbox):');
    expect(cat).toContain('provides: Hitbox{');
    expect(cat).toContain('targetMask:number'); // 字段名:类型
  });

  it('含 whenToUse / examples（教 AI 数据形状）', () => {
    const cat = buildCapabilityCatalog([hitboxCapability]);
    expect(cat).toContain('when:');
    expect(cat).toContain('e.g.:');
    expect(cat).toContain('冰霜新星'); // 来自 describe.examples
  });

  it('全量目录自动含新能力（手维护 prompt 此前漏掉的 hitbox/prefab）', () => {
    const cat = buildCapabilityCatalog(ALL_CAPABILITIES);
    // 战斗簇 + 授权层：一登记进注册表就自动对生成器可见，零 prompt 维护。
    expect(cat).toContain('t2-hitbox');
    expect(cat).toContain('t3-prefab');
    expect(cat).toContain('PrefabLibrary{');
    // 对话/三消等也都在（不再是平台跳跃那十来个的陈旧子集）。
    expect(cat).toContain('t3-dialogue');
    expect(cat).toContain('t3-match3-board');
  });

  it('assetKey 字段类型透出 → 提示 AI 该填清单 key（接 R9① 硬校验）', () => {
    const cat = buildCapabilityCatalog(ALL_CAPABILITIES);
    expect(cat).toMatch(/textureKey:assetKey|clipId:assetKey/);
  });
});
