import { describe, it, expect } from 'vitest';
import { ftpFrames, ftpToAtlasEntry, mergeAtlasIntoIndex, normalizeFrameName, type FtpAtlasJson } from './pack-atlas.js';
import { AssetManager, StubAssetLoader } from './asset-manager.js';
import { registerAssetIndex } from './asset-index.js';
import type { AssetIndex } from './asset-index.js';

const FTP: FtpAtlasJson = {
  frames: {
    'hero_idle_0.png': { frame: { x: 0, y: 0, w: 64, h: 64 } },
    'hero_idle_1.png': { frame: { x: 64, y: 0, w: 64, h: 64 } },
    'hero_attack_0.png': { frame: { x: 0, y: 64, w: 64, h: 64 } },
  },
  meta: { image: 'hero.png' },
};

describe('pack-atlas — FTP JSON → AssetIndex（唯一真理，不造第二个 manifest）', () => {
  it('normalizeFrameName 去扩展名', () => {
    expect(normalizeFrameName('hero_idle_0.png')).toBe('hero_idle_0');
    expect(normalizeFrameName('snd.coin.wav')).toBe('snd.coin'); // 只去最后一段扩展
  });

  it('ftpFrames → 命名帧矩形表（去扩展名 + 取子矩形）', () => {
    const frames = ftpFrames(FTP);
    expect(Object.keys(frames).sort()).toEqual(['hero_attack_0', 'hero_idle_0', 'hero_idle_1']);
    expect(frames.hero_idle_1).toEqual({ x: 64, y: 0, w: 64, h: 64 });
    expect(frames.hero_attack_0).toEqual({ x: 0, y: 64, w: 64, h: 64 });
  });

  it('ftpToAtlasEntry → 一条 filled texture 条目，spec.frames 承载切片', () => {
    const entry = ftpToAtlasEntry(FTP, { id: 'atlas_hero', path: 'packed/hero.png' });
    expect(entry).toMatchObject({ id: 'atlas_hero', type: 'texture', status: 'filled', path: 'packed/hero.png' });
    expect((entry.spec as { frames: Record<string, unknown> }).frames.hero_idle_0).toEqual({ x: 0, y: 0, w: 64, h: 64 });
  });

  it('mergeAtlasIntoIndex 按 id 替换同名条目（幂等可重打包）', () => {
    const base: AssetIndex = { version: 1, assets: [{ id: 'atlas_hero', type: 'texture', status: 'tbf', description: '旧' }] };
    const merged = mergeAtlasIntoIndex(base, FTP, { id: 'atlas_hero', path: 'packed/hero.png' });
    expect(merged.assets).toHaveLength(1); // 替换而非追加
    expect(merged.assets[0].status).toBe('filled');
  });

  it('打包产物经 registerAssetIndex → 注册成 atlas，可按帧名解析', async () => {
    const index = mergeAtlasIntoIndex({ version: 1, assets: [] }, FTP, { id: 'atlas_hero', path: 'hero.png' });
    const m = new AssetManager(new StubAssetLoader());
    registerAssetIndex(m, index, '/assets/');
    await m.load('atlas_hero');
    // spec.frames 在 → 注册为 atlas → 按帧名取子矩形
    expect(m.resolve('atlas_hero', 'hero_attack_0')).toMatchObject({ sx: 0, sy: 64, sw: 64, sh: 64 });
    // 配合命名动画剪辑（增益 B）：index → 帧名
    m.registerAnimation({ key: 'hero_idle', atlas: 'atlas_hero', frames: ['hero_idle_0', 'hero_idle_1'] });
    expect(m.resolve('hero_idle', 1)).toMatchObject({ sx: 64, sy: 0 });
  });
});
