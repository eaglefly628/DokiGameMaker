/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import { ALL_CAPABILITIES } from './capability-registry.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';

// ═══════════════════════════════════════════════════════════════
//  注册表守护 —— 「每个 src/skills 下的 defineCapability 导出都必须在 ALL_CAPABILITIES」。
//
//  背景：能力对象若被游戏「直传消费」（不走 manifest），漏进注册表也能跑，但 manifest 路线/
//  创作台词汇表(buildCapabilityCatalog) 解析不到它——就是 t2-tray 曾漏注册那种隐性缺口。
//  本测用 Vite 的 import.meta.glob 扫**全部** skill 模块的导出，鸭子判定出 CapabilityDefinition，
//  断言其 id 都已注册。任何人新增一个 defineCapability 却忘了在 capability-registry 登记 → 本测立即红。
// ═══════════════════════════════════════════════════════════════

// 扫 src/skills 下所有源模块（排除测试文件，避免副作用重复注册 describe/it）。
// eager → 直接拿到模块对象；路径相对本测试文件（src/assembly → ../skills）。
const skillModules = import.meta.glob(['../skills/**/*.ts', '!../skills/**/*.test.ts'], {
  eager: true,
});

// 鸭子判定：defineCapability 的产物形状（id/version/describe/components/systems）。
// 这套形状只有 defineCapability 会产出，skills 里的纯函数/常量导出都不匹配。
function isCapability(v: unknown): v is CapabilityDefinition {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.version === 'string' &&
    typeof o.describe === 'object' &&
    o.describe !== null &&
    typeof o.components === 'object' &&
    o.components !== null &&
    Array.isArray(o.systems)
  );
}

const discovered: { id: string; path: string }[] = [];
for (const [path, mod] of Object.entries(skillModules)) {
  for (const val of Object.values(mod as Record<string, unknown>)) {
    if (isCapability(val)) discovered.push({ id: val.id, path });
  }
}

const registeredIds = new Set(ALL_CAPABILITIES.map((c) => c.id));

describe('capability-registry 守护 — src/skills 全部 defineCapability 必须注册', () => {
  it('glob 真扫到了 skills 能力（防路径写错时空跑=假绿）', () => {
    // 现有 ~80 个 defineCapability；随能力增长只会更多。低于此下限=glob 没匹配到，测试形同虚设。
    expect(discovered.length).toBeGreaterThan(70);
  });

  it('每个 defineCapability 导出的 id 都在 ALL_CAPABILITIES', () => {
    const missing = discovered.filter((d) => !registeredIds.has(d.id));
    // 失败信息直接点名漏注册的 id + 所在文件，便于一眼补登记。
    expect(missing).toEqual([]);
  });
});
