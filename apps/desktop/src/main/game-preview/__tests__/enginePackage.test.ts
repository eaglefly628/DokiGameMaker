import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveEngineLocation,
  viteBinCandidates,
  type EngineLookupIo,
} from '../enginePackage';

const ENGINE_PKG = { name: '@zerocraft/apollo-engine', scripts: { dev: 'vite' } };

function ioWith(files: Record<string, unknown>): EngineLookupIo {
  return { readJson: (filePath) => files[filePath] ?? null };
}

describe('resolveEngineLocation', () => {
  const repoRoot = '/home/dev/DokiGameMaker';
  const enginePkgPath = path.posix.join(repoRoot, 'packages/apollo-engine/package.json');

  it('工作目录就是仓库根时直接命中', () => {
    const found = resolveEngineLocation(repoRoot, ioWith({ [enginePkgPath]: ENGINE_PKG }), path.posix);
    expect(found).toEqual({
      repoRoot,
      engineDir: path.posix.join(repoRoot, 'packages/apollo-engine'),
    });
  });

  it('工作目录是仓库内深层子目录时逐级向上找到仓库根', () => {
    const deep = path.posix.join(repoRoot, 'packages/apollo-engine/src/games/my-game');
    const found = resolveEngineLocation(deep, ioWith({ [enginePkgPath]: ENGINE_PKG }), path.posix);
    expect(found?.repoRoot).toBe(repoRoot);
  });

  it('包名对不上就当作没有引擎 —— 不给任何执行机会', () => {
    const impostor = { name: 'totally-not-the-engine', scripts: { dev: 'sh -c "rm -rf /"' } };
    expect(
      resolveEngineLocation(repoRoot, ioWith({ [enginePkgPath]: impostor }), path.posix),
    ).toBeNull();
  });

  it('缺 dev 脚本 / package.json 不是对象一律拒绝', () => {
    expect(
      resolveEngineLocation(
        repoRoot,
        ioWith({ [enginePkgPath]: { name: '@zerocraft/apollo-engine' } }),
        path.posix,
      ),
    ).toBeNull();
    expect(
      resolveEngineLocation(repoRoot, ioWith({ [enginePkgPath]: 'not-an-object' }), path.posix),
    ).toBeNull();
  });

  it('仓库外的目录返回 null,且向上走到文件系统根就停(不死循环)', () => {
    expect(resolveEngineLocation('/tmp/somewhere', ioWith({}), path.posix)).toBeNull();
    expect(resolveEngineLocation('/', ioWith({}), path.posix)).toBeNull();
  });

  it('空字符串输入直接拒绝', () => {
    expect(resolveEngineLocation('', ioWith({}), path.posix)).toBeNull();
    expect(resolveEngineLocation('   ', ioWith({}), path.posix)).toBeNull();
  });
});

describe('viteBinCandidates', () => {
  const location = {
    repoRoot: '/repo',
    engineDir: '/repo/packages/apollo-engine',
  };

  it('优先引擎包自身的 .bin,再回落仓库根 .bin', () => {
    expect(viteBinCandidates(location, 'darwin', path.posix)).toEqual([
      '/repo/packages/apollo-engine/node_modules/.bin/vite',
      '/repo/node_modules/.bin/vite',
    ]);
  });

  it('Windows 上给出 .CMD / .cmd / .exe 候选', () => {
    const candidates = viteBinCandidates(location, 'win32', path.posix);
    expect(candidates.some((c) => c.endsWith('vite.CMD'))).toBe(true);
    expect(candidates.some((c) => c.endsWith('vite.exe'))).toBe(true);
    // 无扩展名的 POSIX shim 不应出现在 Windows 候选里。
    expect(candidates.some((c) => c.endsWith('/vite'))).toBe(false);
  });
});
