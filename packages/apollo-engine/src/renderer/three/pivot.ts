import * as THREE from 'three';
import type { Pose3D } from '../three-projection.js';

// ═══════════════════════════════════════════════════════════════
//  three/pivot —— Pivot3D 父合成的矩阵数学（用 THREE.Matrix4·纯计算·无 WebGL → node 可测）。
//  把一组子实体的世界位姿合成到 pivot 变换下 → 整组当一个单元转/缩/移（骰钟转场 §F）。
//  合成式：childWorld = T(pivot 平移 + center)·R·S·T(-center)·childLocal（绕 center 转缩·再叠平移；无变换=恒等）。
// ═══════════════════════════════════════════════════════════════

export interface PivotXform { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scale: number; }

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** pivot 变换矩阵：M = T(平移+center)·R·S·T(-center)。pivot 无变换（rot0 scale1 平移0）时 = 恒等。 */
export function pivotMatrix(p: PivotXform, cx: number, cy: number, cz: number): THREE.Matrix4 {
  _e.set(p.rotX, p.rotY, p.rotZ, 'XYZ');
  _q.setFromEuler(_e);
  const rs = new THREE.Matrix4().compose(_v.set(0, 0, 0), _q, _v2.set(p.scale, p.scale, p.scale)); // R·S 绕原点
  return new THREE.Matrix4()
    .makeTranslation(p.x + cx, p.y + cy, p.z + cz)
    .multiply(rs)
    .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
}

/** 把 pivot 矩阵合成到子实体 Pose3D → 新 Pose3D（分解为 位置 + 四元数 + 缩放；quat 覆盖欧拉·避开欧拉序歧义）。 */
export function applyPivot(M: THREE.Matrix4, pose: Pose3D): Pose3D {
  if (pose.quat) _q.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
  else { _e.set(pose.rx ?? 0, pose.ry ?? 0, pose.rotZ, 'XYZ'); _q.setFromEuler(_e); }
  const child = new THREE.Matrix4().compose(_v.set(pose.x, pose.y, pose.z), _q, _v2.set(pose.sx, pose.sy, pose.sz ?? 1));
  const out = new THREE.Matrix4().multiplyMatrices(M, child);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  out.decompose(p, q, s);
  return { x: p.x, y: p.y, z: p.z, rotZ: 0, rx: 0, ry: 0, sx: s.x, sy: s.y, sz: s.z, quat: [q.x, q.y, q.z, q.w] };
}
