import { describe, it, expect } from 'vitest';
import { addEquip, removeEquip, equipStatSum, equipDeployHp, parseMarkerId, applyEquip, unequip, MAX_EQUIP, type EquipMap, type EquipWorld } from './equip.js';
import { finalHp, type HeroSpec } from './heroes.js';
import { STAR_HP_MUL } from './economy.js';

const hero = (hp: number, atk: number, items?: string[]): HeroSpec =>
  ({ hp, atk, items } as unknown as HeroSpec);

describe('装备 ③/④ 模型（金铲铲 ≤3 / 烘下次部署 / 拆解退栏；纯函数零引擎）', () => {
  it('addEquip：每将 ≤3；满员拒绝（回弹）', () => {
    const m: EquipMap = {};
    expect(addEquip(m, 'k', 'w_fangtian')).toBe(true);
    expect(addEquip(m, 'k', 'a_baiyin')).toBe(true);
    expect(addEquip(m, 'k', 't_yuxi')).toBe(true);
    expect(m['k'].length).toBe(MAX_EQUIP);
    expect(addEquip(m, 'k', 'w_qinglong')).toBe(false); // 第 4 件拒绝
    expect(m['k'].length).toBe(3);
  });
  it('removeEquip：拆首个匹配并退回 id；空了清键；无则 null', () => {
    const m: EquipMap = { k: ['w_fangtian', 'a_baiyin'] };
    expect(removeEquip(m, 'k', 'a_baiyin')).toBe('a_baiyin');
    expect(m['k']).toEqual(['w_fangtian']);
    expect(removeEquip(m, 'k', 'w_fangtian')).toBe('w_fangtian');
    expect(m['k']).toBeUndefined(); // 空了清键
    expect(removeEquip(m, 'k', 'x')).toBeNull();
  });
  it('equipStatSum：hp/atk 加总（缺省 0）', () => {
    const m: EquipMap = { k: ['a_baiyin', 'w_fangtian'] }; // hp260 / atk40
    expect(equipStatSum(m, 'k', 'hp')).toBe(260);
    expect(equipStatSum(m, 'k', 'atk')).toBe(40);
    expect(equipStatSum(m, 'none', 'hp')).toBe(0);
  });
  it('equipDeployHp：= round((finalHp + Σ装备hp) × 人数难度 × 星级)（heroOverrides 同管道）', () => {
    const h = hero(200, 15);
    const m: EquipMap = { k: ['a_baiyin'] }; // +hp260
    const expected2 = Math.round((finalHp(h) + 260) * 1 * STAR_HP_MUL[2]);
    expect(equipDeployHp(h, 2, 1, m, 'k')).toBe(expected2);
    // 无装备 = 纯 heroOverrides 基线
    expect(equipDeployHp(h, 1, 1, {}, 'k')).toBe(Math.round(finalHp(h) * STAR_HP_MUL[1]));
  });
  it('applyEquip：成功写回 HP(main.Resource) + eq_atk(eqstat.Resource,REQ-F-065)；满 3 件不写、返回 false', () => {
    const caster = { overrides: { main: { Resource: { current: 100, max: 100 } } } } as { overrides: { main: { Resource: { current: number; max: number } }; eqcaster?: { Resource: { current: number; max: number } } } };
    const world: EquipWorld = { getComponent: () => caster, addComponent: () => {} };
    const m: EquipMap = {};
    const h = hero(200, 15);
    expect(applyEquip(world, 'bench_a_x#1:seat', 'w_fangtian', m, h, 2, 1)).toBe(true); // 方天画戟 atk40(无 hp)
    expect(caster.overrides.main.Resource.max).toBe(Math.round(finalHp(h) * STAR_HP_MUL[2])); // hp 无变(方天无 hp)
    expect(caster.overrides.eqcaster!.Resource.current).toBe(40); // eq_atk = Σ装备atk
    // 再装含 hp 的：白银狮蛮铠 hp260
    expect(applyEquip(world, 'bench_a_x#1:seat', 'a_baiyin', m, h, 2, 1)).toBe(true);
    expect(caster.overrides.main.Resource.max).toBe(Math.round((finalHp(h) + 260) * STAR_HP_MUL[2]));
    expect(caster.overrides.eqcaster!.Resource.current).toBe(40); // 铠无 atk，eq_atk 仍 40
    // 装满 3 件后第 4 件拒绝、override 不再变
    addEquip(m, 'bench_a_x#1:seat', 'x'); // 现 3 件
    const before = caster.overrides.main.Resource.max;
    expect(applyEquip(world, 'bench_a_x#1:seat', 't_yuxi', m, h, 2, 1)).toBe(false);
    expect(caster.overrides.main.Resource.max).toBe(before);
  });
  it('unequip(④)：卸下 → HP 重烘回扣装备 hp → 返回被卸 id（退回袋）；无则 null', () => {
    const caster = { overrides: { main: { Resource: { current: 100, max: 100 } } } };
    const world: EquipWorld = { getComponent: () => caster, addComponent: () => {} };
    const m: EquipMap = {};
    const h = hero(200, 15);
    applyEquip(world, 'k', 'a_baiyin', m, h, 2, 1); // +hp260
    const withGear = caster.overrides.main.Resource.max;
    expect(unequip(world, 'k', 'a_baiyin', m, h, 2, 1)).toBe('a_baiyin'); // 退回 id
    expect(caster.overrides.main.Resource.max).toBe(Math.round(finalHp(h) * STAR_HP_MUL[2])); // 扣回基线
    expect(caster.overrides.main.Resource.max).toBeLessThan(withGear);
    expect(unequip(world, 'k', 'x', m, h, 2, 1)).toBeNull(); // 无则 null
  });
  it('parseMarkerId：bench/bench2/bench3 编码星级；heroId 含下划线；非席位 null', () => {
    expect(parseMarkerId('bench_a_guanyu#3:seat')).toEqual({ heroId: 'a_guanyu', star: 1 });
    expect(parseMarkerId('bench2_b_simayi#7:seat')).toEqual({ heroId: 'b_simayi', star: 2 });
    expect(parseMarkerId('bench3_a_zhaoyun#1:seat')).toEqual({ heroId: 'a_zhaoyun', star: 3 });
    expect(parseMarkerId('hero_a_guanyu#3')).toBeNull();
    expect(parseMarkerId('r_dmg_scale_a')).toBeNull();
  });
});
