/**
 * enginePackage —— 从一个工作目录定位 ZeroCraft 引擎包(纯逻辑,可注入 IO)。
 *
 * 为什么不直接信 renderer 传来的路径当命令来源:renderer 是不可信 UI 环境
 * (docs/dev-rules/electron-security-and-process-boundaries.md §1)。这里的口径是
 * ——「workdir 只是从哪里开始往上找」,真正要执行的东西由本模块从**仓库结构**
 * 推导:必须存在 `<root>/packages/apollo-engine/package.json`,且其 `name` 恰为
 * `@zerocraft/apollo-engine`、带 `dev` 脚本。名字对不上就当作「这里没有引擎」,
 * 不给任何执行机会。
 *
 * 往上找而不是只看 workdir 自身:会话的 workdir 常常是仓库里的某个子目录
 * (`packages/apollo-engine/src/games/<slug>` 之类),从那里往上走才能落到仓库根。
 */

import path from 'node:path';

/** 引擎包在仓库里的固定位置与身份(与 docs/REQUIREMENTS.md §2 的目录约定同源)。 */
export const ENGINE_PACKAGE_NAME = '@zerocraft/apollo-engine';
export const ENGINE_RELATIVE_SEGMENTS = ['packages', 'apollo-engine'] as const;

/** 往上找的层数上限:防御性护栏,正常仓库深度远小于此。 */
const MAX_ANCESTOR_WALK = 32;

export interface EngineLocation {
  /** 仓库根(含 `packages/apollo-engine` 的那一层)。 */
  repoRoot: string;
  /** 引擎包目录 = `<repoRoot>/packages/apollo-engine`。 */
  engineDir: string;
}

export interface EngineLookupIo {
  /** 读取并 JSON.parse;文件不存在 / 读失败 / 不是合法 JSON 一律返回 null。 */
  readJson(filePath: string): unknown | null;
}

function isEnginePackageJson(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const pkg = parsed as { name?: unknown; scripts?: unknown };
  if (pkg.name !== ENGINE_PACKAGE_NAME) return false;
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return false;
  return typeof (scripts as Record<string, unknown>).dev === 'string';
}

/**
 * 从 `startDir` 起逐级向上找引擎包。找到返回 { repoRoot, engineDir },否则 null。
 *
 * `pathApi` 可注入(默认跟随宿主平台),让 Windows 路径语义能在任意 runner 上被
 * 单测覆盖 —— 与 filePathPolicy.ts 同款做法。
 */
export function resolveEngineLocation(
  startDir: string,
  io: EngineLookupIo,
  pathApi: typeof path.posix = path as unknown as typeof path.posix,
): EngineLocation | null {
  if (typeof startDir !== 'string' || startDir.trim() === '') return null;
  let current = pathApi.resolve(startDir);
  for (let depth = 0; depth < MAX_ANCESTOR_WALK; depth += 1) {
    const engineDir = pathApi.join(current, ...ENGINE_RELATIVE_SEGMENTS);
    if (isEnginePackageJson(io.readJson(pathApi.join(engineDir, 'package.json')))) {
      return { repoRoot: current, engineDir };
    }
    const parent = pathApi.dirname(current);
    if (parent === current) break; // 到达文件系统根
    current = parent;
  }
  return null;
}

/**
 * 引擎 dev server 的可执行文件候选(按优先级)。
 *
 * 直接跑 pnpm 安装好的 `vite` bin shim,而不是 `pnpm --filter … dev`:
 *   - 不要求用户 PATH 上有 pnpm(打包版 Electron 的 PATH 常常不含用户 shell 的补丁);
 *   - `shell: false` 直接 spawn 一个具体文件,没有 shell 解析面。
 *
 * 找不到任何候选 = 依赖没装。此时**如实报错让用户自己装**,绝不代跑安装
 * (docs/HANDOFF.md 三-2:owner 明确不希望被自动安装打断)。
 */
export function viteBinCandidates(
  location: EngineLocation,
  platform: NodeJS.Platform,
  pathApi: typeof path.posix = path as unknown as typeof path.posix,
): string[] {
  const binNames = platform === 'win32' ? ['vite.CMD', 'vite.cmd', 'vite.exe'] : ['vite'];
  const binDirs = [
    pathApi.join(location.engineDir, 'node_modules', '.bin'),
    pathApi.join(location.repoRoot, 'node_modules', '.bin'),
  ];
  const out: string[] = [];
  for (const dir of binDirs) {
    for (const name of binNames) out.push(pathApi.join(dir, name));
  }
  return out;
}
