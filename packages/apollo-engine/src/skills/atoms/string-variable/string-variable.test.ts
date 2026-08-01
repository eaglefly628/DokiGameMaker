import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { stringVariableCapability } from './index.js';
import type { StringVar, StringSet } from '@engine/protocol/components.js';

const system = stringVariableCapability.systems[0];

describe('string-apply system', () => {
  let world: World;
  beforeEach(() => {
    world = new World();
    world.addSystem(system);
  });

  it('同实体设置字符串值', () => {
    world.createEntity('e1');
    world.addComponent('e1', { type: 'StringVar', id: 'story-node', value: 'scene_01' } as StringVar);
    world.addComponent('e1', { type: 'StringSet', id: 'story-node', value: 'scene_02' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('e1', 'StringVar')!.value).toBe('scene_02');
    expect(world.hasComponent('e1', 'StringSet')).toBe(false); // 被消费
  });

  it('全局按 id 路由：StringSet 挂别的实体也能写到持有者', () => {
    world.createEntity('state');
    world.addComponent('state', { type: 'StringVar', id: 'ending', value: '' } as StringVar);
    world.createEntity('judge');
    world.addComponent('judge', { type: 'StringSet', id: 'ending', value: 'true_end' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('state', 'StringVar')!.value).toBe('true_end');
  });

  it('无匹配 id：不写入但仍消费事件', () => {
    world.createEntity('e1');
    world.addComponent('e1', { type: 'StringVar', id: 'a', value: 'x' } as StringVar);
    world.createEntity('e2');
    world.addComponent('e2', { type: 'StringSet', id: 'nope', value: 'y' } as StringSet);
    world.tick();
    expect(world.getComponent<StringVar>('e1', 'StringVar')!.value).toBe('x');
    expect(world.hasComponent('e2', 'StringSet')).toBe(false);
  });
});
