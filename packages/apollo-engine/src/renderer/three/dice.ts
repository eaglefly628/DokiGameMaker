// three/dice —— 读一颗刚体骰子「朝上的那一面」（render-only 纯函数·配 RigidBody3D 物理落定后读点数）。
// owner 2026-07-03「物理落地 → 给我确定的点数」：物理把骰子的四元数写回 Transform3D.quat，本函数据 quat 算
// 哪一面朝上，返回该面在 `Mesh3D.dieFaces` 里的下标（BoxGeometry 面序 [+X,-X,+Y,-Y,+Z,-Z]）。
// render-only 读侧（不进 sim/hash）；纯数学（无 three 依赖·可确定性单测）。
//
// 原理：立方体 6 个面的局部法线 = ±X/±Y/±Z 单位轴。用骰子朝向四元数把每条法线转到世界系，取**世界 +Y 分量最大**
// 的那一面 = 朝上。四元数旋转某局部轴到世界的 Y 分量可由旋转矩阵第二行直接取（免逐面完整旋转）：
//   +X→ 2(xy+wz) · +Y→ 1−2(x²+z²) · +Z→ 2(yz−wx)（对面取负）。

/** 立方体面序（THREE.BoxGeometry 材质组顺序·与 Mesh3D.dieFaces 一一对应）。 */
export const DIE_FACE_ORDER = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const;

/** 给骰子朝向四元数 `[x,y,z,w]`，返回**朝上面**在 dieFaces 里的下标（0..5·面序见 DIE_FACE_ORDER）。 */
export function upFaceIndex(quat: readonly [number, number, number, number]): number {
  const [x, y, z, w] = quat;
  const px = 2 * (x * y + w * z);      // 局部 +X 轴转到世界后的 Y 分量
  const py = 1 - 2 * (x * x + z * z);  // 局部 +Y
  const pz = 2 * (y * z - w * x);      // 局部 +Z
  const worldY = [px, -px, py, -py, pz, -pz]; // 6 面（对面取负）
  let best = 0, bestY = worldY[0]!;
  for (let i = 1; i < 6; i++) if (worldY[i]! > bestY) { bestY = worldY[i]!; best = i; }
  return best;
}
