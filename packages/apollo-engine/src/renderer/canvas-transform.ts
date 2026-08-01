// ═══════════════════════════════════════════════════════════════
//  canvas-transform —— 2D 渲染的仿射变换合成（纯逻辑·无 canvas·可单测）。
//  REQ-3D-RENDER-EFFICIENCY：热路径去掉每实体 `ctx.save()/translate/rotate/scale/restore`——
//  把 `DPR × 相机 × 实体` 三层变换在 JS 里合成一个 6 元仿射，每实体一次 `ctx.setTransform(...)`。
//  省下每实体 5+ 次 canvas 调用 + 状态栈压弹（百级同屏实体 = 百次省），DPR/相机零丢失（都折进矩阵）。
//  相机是纯 scale+translate（无旋转/切变），故 base 只需 3 个数 [s, e, f] 表示 world→device：[s,0,0,s,e,f]。
// ═══════════════════════════════════════════════════════════════

export interface DeviceBase { s: number; e: number; f: number; } // world→device 仿射 [s,0,0,s,e,f]（相机+DPR）

export interface CameraView { zoom: number; centerX: number; centerY: number; }

// world→device 基变换：DPR × 相机（translate(W/2,H/2)·scale(zoom)·translate(-c)）。无相机 = 仅 DPR（1:1×dpr）。
export function deviceBase(dpr: number, cam: CameraView | null | undefined, logicalW: number, logicalH: number): DeviceBase {
  if (!cam) return { s: dpr, e: 0, f: 0 };
  return { s: dpr * cam.zoom, e: dpr * (logicalW / 2 - cam.zoom * cam.centerX), f: dpr * (logicalH / 2 - cam.zoom * cam.centerY) };
}

// 实体世界变换 T(x,y)·R(rot)·S(sx,sy) 折进 base → 设备空间 6 元仿射 [a,b,c,d,e,f]（喂 ctx.setTransform）。
// base 无旋转/切变 → 合成简化：a/b/c/d = s·(R·S)，e/f = s·(x,y)+base。rot=0 跳 trig（热路径·多数实体不旋转）。
export function entityMatrix(base: DeviceBase, x: number, y: number, rotation: number, scaleX: number, scaleY: number): [number, number, number, number, number, number] {
  const s = base.s;
  const e = s * x + base.e, f = s * y + base.f;
  if (rotation === 0) return [s * scaleX, 0, 0, s * scaleY, e, f];
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  return [s * cos * scaleX, s * sin * scaleX, -s * sin * scaleY, s * cos * scaleY, e, f];
}
