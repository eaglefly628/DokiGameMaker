// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySavePort } from './memory-save-port.js';
import { LocalStorageSavePort } from './local-save-port.js';
import { BridgeSavePort, FileSavePort, CloudSavePort, createMemoryFileBridge } from './bridge-save-port.js';
import { sealEnvelope, openEnvelope } from './envelope.js';
import type { SavePort, SaveCodec } from './save-port.js';
import { createMockSteamCloudBridge, resetMockSteamCloud } from '@services/storage/index.js';

// SavePort 契约（REQ-CAP 件③）：write/read/list/remove 往返 + 与信封 seal/open 端到端。
// 四后端同一套契约测试跑一遍（Memory / LocalStorage / File[内存桥] / Cloud[假 Steam 云桥]）。
const codec: SaveCodec = { gameId: 'game-z', schema: 1 };

function contract(name: string, make: () => SavePort): void {
  describe(`SavePort 契约 · ${name}`, () => {
    it('write→read 往返（经信封 seal/open 端到端）', async () => {
      const port = make();
      const data = { gold: 42, deck: [1, 2, 3] };
      await port.write('slot1', sealEnvelope(data, codec, 111));
      const env = await port.read('slot1');
      expect(env).not.toBeNull();
      expect(openEnvelope(env!, codec)).toEqual(data);
      expect(env!.savedAt).toBe(111);
    });
    it('list 返回元数据（按 savedAt 降序）；read 缺槽 → null', async () => {
      const port = make();
      await port.write('a', sealEnvelope({ n: 1 }, codec, 100));
      await port.write('b', sealEnvelope({ n: 2 }, codec, 300));
      await port.write('c', sealEnvelope({ n: 3 }, codec, 200));
      const metas = await port.list();
      expect(metas.map((m) => m.slot)).toEqual(['b', 'c', 'a']);
      expect(metas[0]).toMatchObject({ slot: 'b', schema: 1, gameId: 'game-z', savedAt: 300 });
      expect(await port.read('nope')).toBeNull();
    });
    it('remove 删槽 + 出列表；覆盖写不重复入列表', async () => {
      const port = make();
      await port.write('x', sealEnvelope({ n: 1 }, codec, 1));
      await port.write('x', sealEnvelope({ n: 2 }, codec, 2)); // 覆盖
      expect(await port.list()).toHaveLength(1);
      await port.remove('x');
      expect(await port.read('x')).toBeNull();
      expect(await port.list()).toHaveLength(0);
    });
  });
}

beforeEach(() => { resetMockSteamCloud(); localStorage.clear(); });

contract('MemorySavePort', () => new MemorySavePort());
contract('LocalStorageSavePort', () => new LocalStorageSavePort('test-save:'));
contract('FileSavePort（内存文件桥）', () => new FileSavePort(createMemoryFileBridge()));
contract('CloudSavePort（假 Steam 云桥）', () => new CloudSavePort(createMockSteamCloudBridge({ persist: false })));
contract('BridgeSavePort（基类·内存桥）', () => new BridgeSavePort(createMemoryFileBridge()));

describe('BridgeSavePort —— 索引缺失从文件重建（兜底）', () => {
  it('删掉索引文件后 list 仍能从槽位文件重建', async () => {
    const bridge = createMemoryFileBridge();
    const port = new BridgeSavePort(bridge);
    await port.write('a', sealEnvelope({ n: 1 }, codec, 100));
    await port.write('b', sealEnvelope({ n: 2 }, codec, 200));
    await bridge.deleteFile('save/__index__.json'); // 索引损毁
    const metas = await port.list();
    expect(metas.map((m) => m.slot).sort()).toEqual(['a', 'b']);
  });
});
