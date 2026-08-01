import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Resource } from '@engine/protocol/components.js';
import { MemoryStoragePort } from './memory-storage.js';
import { SaveSystem } from './save-system.js';

function worldWith(hp: number): World {
  const w = new World();
  w.createEntity('player');
  w.addComponent('player', { type: 'Resource', id: 'hp', current: hp, min: 0, max: 100 } as Resource);
  return w;
}

describe('SaveSystem — 存/读/列/删（MemoryStoragePort）', () => {
  it('save 后 load 恢复世界状态', async () => {
    const port = new MemoryStoragePort();
    const sys = new SaveSystem(port);
    const w1 = worldWith(73);
    const meta = await sys.save('slot1', w1, '第一章');
    expect(meta.label).toBe('第一章');
    expect(meta.hash).toBeTypeOf('string');

    const w2 = worldWith(10); // 不同状态
    const loaded = await sys.load('slot1', w2);
    expect(loaded?.slot).toBe('slot1');
    expect(w2.getComponent<Resource>('player', 'Resource')!.current).toBe(73);
  });

  it('load 不存在的槽位 → null', async () => {
    const sys = new SaveSystem(new MemoryStoragePort());
    expect(await sys.load('nope', worldWith(1))).toBeNull();
  });

  it('list 返回所有槽位元数据；delete 移除', async () => {
    const sys = new SaveSystem(new MemoryStoragePort());
    await sys.save('a', worldWith(1));
    await sys.save('b', worldWith(2));
    expect((await sys.list()).map((m) => m.slot).sort()).toEqual(['a', 'b']);
    await sys.delete('a');
    expect((await sys.list()).map((m) => m.slot)).toEqual(['b']);
  });

  it('存档 hash 与世界确定性指纹一致（防篡改/校验）', async () => {
    const port = new MemoryStoragePort();
    const sys = new SaveSystem(port);
    const w = worldWith(50);
    const meta = await sys.save('s', w);
    const reloaded = await port.load('s');
    expect(reloaded?.meta.hash).toBe(meta.hash);
  });
});
