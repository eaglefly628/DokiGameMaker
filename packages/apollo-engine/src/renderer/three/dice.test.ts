// 读骰子朝上面（upFaceIndex·物理落定后读确定点数）：纯数学·确定性。面序 [+X,-X,+Y,-Y,+Z,-Z]。
import { describe, it, expect } from 'vitest';
import { upFaceIndex } from './dice.js';

// 绕单轴旋转的四元数 [x,y,z,w]。
const qAxis = (ax: number, ay: number, az: number, deg: number): [number, number, number, number] => {
  const h = (deg * Math.PI) / 180 / 2, s = Math.sin(h);
  return [ax * s, ay * s, az * s, Math.cos(h)];
};

describe('upFaceIndex：物理落定读朝上面', () => {
  it('无旋转 → +Y（顶面·index 2）朝上', () => {
    expect(upFaceIndex([0, 0, 0, 1])).toBe(2);
  });
  it('绕 X 转 180° → -Y（底面·index 3）翻上来', () => {
    expect(upFaceIndex(qAxis(1, 0, 0, 180))).toBe(3);
  });
  it('绕 Z 转 90° → +X（index 0）朝上', () => {
    expect(upFaceIndex(qAxis(0, 0, 1, 90))).toBe(0);
  });
  it('绕 X 转 -90° → +Z（index 4）朝上', () => {
    expect(upFaceIndex(qAxis(1, 0, 0, -90))).toBe(4);
  });
  it('任意朝向都返回合法面下标 0..5', () => {
    for (const q of [qAxis(1, 1, 1, 37), qAxis(0.3, -0.8, 0.5, 200), qAxis(1, 0, 0, 45)]) {
      const i = upFaceIndex(q);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(5);
    }
  });
});
