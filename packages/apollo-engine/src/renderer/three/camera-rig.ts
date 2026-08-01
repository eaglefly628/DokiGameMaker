import * as THREE from 'three';
import type { Camera3D } from '@engine/protocol/components.js';
import { orbitCamera, clampPitch, orthoFrustum, fitPerspective, type Bounds2D } from '../three-projection.js';

// ═══════════════════════════════════════════════════════════════
//  three/CameraRig —— 相机解释器（REQ-3D-Camera）。
//  铁律：游戏只填 `Camera3D` 语义参数（yaw/pitch/projection/fov/ortho/near/far/mode...），**渲染器算矩阵**。
//  持透视 + 正交两台相机，按 `Camera3D.projection` 选 active；fov/ortho/near/far 全从数据读（不写死）。
//  本类不读 world——`mode:'follow'` 的 target 实体位由渲染器解析成 center 传入（保持「解释器只算矩阵」纯净）。
// ═══════════════════════════════════════════════════════════════

// 震屏偏移（相机局部右/上轴·世界单位）。active=trauma>0（渲染器据此持续重渲直到回正）。
export interface ShakeOffset { rx: number; uy: number; active: boolean; }
const NO_SHAKE: ShakeOffset = { rx: 0, uy: 0, active: false };

// 两条不同频率/相位的平滑合成（避免抖成直线·非周期观感）。范围约 [-1,1]。
function shakeNoise(t: number, seed: number): number {
  return Math.sin((t + seed) * 1.0) * 0.6 + Math.sin((t + seed) * 2.31 + 1.3) * 0.4;
}

// ── CameraShake（Camera3D.shake 解释器·trauma 模型·render-only）───────────────────────────────
// 游戏 bump `trigger` → 注入 trauma=1；每帧按 decay(/秒) 线性衰减；幅度 = amp·trauma²（尾巴快速回落）。
// 沿相机局部右/上轴平滑抖动。纯壁钟驱动·持内部 trauma 态·绝不进 sim/hash。
export class CameraShake {
  private lastTrigger: number | undefined = undefined;
  private t0 = 0;
  private trauma = 0;

  update(shake: { trigger?: number; amp?: number; freq?: number; decay?: number } | undefined, nowMs: number): ShakeOffset {
    if (!shake) { this.trauma = 0; this.lastTrigger = undefined; return NO_SHAKE; }
    if (this.lastTrigger === undefined) { this.lastTrigger = shake.trigger; return NO_SHAKE; } // 首见=基线·不注入（静态带 trigger 的场景装载不白震·bump 才震）
    if (shake.trigger !== this.lastTrigger) { this.lastTrigger = shake.trigger; this.trauma = 1; this.t0 = nowMs; }
    const decay = shake.decay ?? 2;
    const elapsed = (nowMs - this.t0) / 1000;
    this.trauma = Math.max(0, 1 - elapsed * decay);
    if (this.trauma <= 0) return NO_SHAKE;
    const amp = shake.amp ?? 0.3, freq = shake.freq ?? 30;
    const mag = amp * this.trauma * this.trauma; // trauma² → 尾部更柔
    return { rx: mag * shakeNoise(elapsed * freq, 0), uy: mag * shakeNoise(elapsed * freq, 11.7), active: true };
  }

  dispose(): void { this.trauma = 0; this.lastTrigger = undefined; }
}

// ── FollowDamper（Camera3D.follow 解释器·跟随柔化·render-only）─────────────────────────────────
// 指数平滑逼近 target 世界位（帧率无关：alpha = 1-e^(-dt/lag)）+ 按 target 速度做 lookAhead 预读。
// 持内部平滑态 + 上一帧 raw（估速度）。settling=尚未收敛（渲染器据此持续重渲直到贴合·收敛回省帧）。
// 无 follow 参数 → 直通 raw 并重置态（切模式/首帧硬贴不甩尾）。绝不进 sim/hash。
export interface DampedCenter { x: number; y: number; z: number; settling: boolean; }
export class FollowDamper {
  private sx = 0; private sy = 0; private sz = 0;   // 平滑后中心
  private px = 0; private py = 0; private pz = 0;   // 上一帧 raw（估速度）
  private t = 0; private has = false;

  update(raw: { x: number; y: number; z: number }, follow: { lag?: number; lookAhead?: number } | undefined, nowMs: number): DampedCenter {
    if (!follow || ((follow.lag ?? 0) <= 0 && (follow.lookAhead ?? 0) <= 0)) { this.has = false; return { ...raw, settling: false }; }
    if (!this.has) { // 首帧：硬贴（不从原点甩入）
      this.sx = raw.x; this.sy = raw.y; this.sz = raw.z;
      this.px = raw.x; this.py = raw.y; this.pz = raw.z;
      this.t = nowMs; this.has = true;
      return { ...raw, settling: false };
    }
    const dt = Math.max(0, (nowMs - this.t) / 1000); this.t = nowMs;
    const la = follow.lookAhead ?? 0;
    const vx = dt > 0 ? (raw.x - this.px) / dt : 0, vy = dt > 0 ? (raw.y - this.py) / dt : 0, vz = dt > 0 ? (raw.z - this.pz) / dt : 0;
    this.px = raw.x; this.py = raw.y; this.pz = raw.z;
    const tx = raw.x + vx * la, ty = raw.y + vy * la, tz = raw.z + vz * la; // 预读目标
    const lag = Math.max(1e-3, follow.lag ?? 0.15);
    const alpha = dt > 0 ? 1 - Math.exp(-dt / lag) : 1;
    this.sx += (tx - this.sx) * alpha; this.sy += (ty - this.sy) * alpha; this.sz += (tz - this.sz) * alpha;
    const settling = Math.hypot(tx - this.sx, ty - this.sy, tz - this.sz) > 1e-3;
    return { x: this.sx, y: this.sy, z: this.sz, settling };
  }

  reset(): void { this.has = false; }
}

// ── CameraTween（Camera3D.tween 解释器·运镜过渡·render-only）─────────────────────────────────
// 在**世界空间的取景（眼位 eye + 注视点 target）**层面做过渡——不碰 auto 距离/pivot 解析：
// bump trigger → 捕获上一帧已应用的取景为 from，dur 秒内 ease 到当前（目标）取景。收敛/未触发 → 直通目标。
// 分两步用：tick(相机前·出 active 折 renderSig) → apply(applyOrbit 内·据 k 混合 from→raw)。
type TweenEase = 'linear' | 'cubicOut' | 'inOut';
const easeTween = (p: number, e: TweenEase): number => {
  if (e === 'linear') return p;
  if (e === 'inOut') return p * p * (3 - 2 * p); // smoothstep
  const q = 1 - p; return 1 - q * q * q;         // cubicOut（缺省·减速停靠）
};
export class CameraTween {
  private lastTrigger: number | undefined = undefined;
  private t0 = 0; private k = 1; private active = false; private pendingCapture = false; private has = false;
  private readonly fromEye = new THREE.Vector3(); private readonly fromTgt = new THREE.Vector3();
  private readonly lastEye = new THREE.Vector3(); private readonly lastTgt = new THREE.Vector3();

  // 相机前调（只需 trigger+壁钟·算进度 k 与 active）。返回 active（折进 renderSig 持续重渲直至到位）。
  tick(tween: { trigger: number; dur?: number; ease?: TweenEase } | undefined, nowMs: number): boolean {
    if (!tween) { this.active = false; this.lastTrigger = undefined; return false; }
    if (tween.trigger !== this.lastTrigger) { this.lastTrigger = tween.trigger; this.t0 = nowMs; this.pendingCapture = true; }
    const dur = tween.dur ?? 0.6;
    const elapsed = (nowMs - this.t0) / 1000;
    this.k = easeTween(dur > 0 ? Math.min(1, elapsed / dur) : 1, tween.ease ?? 'cubicOut');
    this.active = this.has && elapsed < dur;
    return this.active;
  }

  // applyOrbit 内调：给 raw 取景（眼位/注视点）→ 返回过渡混合后的有效取景。首帧/未触发直通并记录。
  apply(rawEye: THREE.Vector3, rawTgt: THREE.Vector3): { eye: THREE.Vector3; tgt: THREE.Vector3 } {
    if (this.pendingCapture) { this.fromEye.copy(this.lastEye); this.fromTgt.copy(this.lastTgt); this.pendingCapture = false; }
    let eye = rawEye, tgt = rawTgt;
    if (this.active && this.has) {
      eye = this.fromEye.clone().lerp(rawEye, this.k);
      tgt = this.fromTgt.clone().lerp(rawTgt, this.k);
    }
    this.lastEye.copy(eye); this.lastTgt.copy(tgt); this.has = true;
    return { eye, tgt };
  }

  dispose(): void { this.has = false; this.active = false; this.lastTrigger = undefined; }
}

export class CameraRig {
  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private readonly tween = new CameraTween(); // 运镜过渡（Camera3D.tween·世界空间取景 ease）
  private readonly tmpEye = new THREE.Vector3(); private readonly tmpTgt = new THREE.Vector3();
  current: THREE.Camera; // 当前激活相机（渲染 + 后处理用）

  // 运镜过渡计时（相机前调·出 active 折 renderSig）。委托内部 CameraTween。
  tickTween(tween: { trigger: number; dur?: number; ease?: 'linear' | 'cubicOut' | 'inOut' } | undefined, nowMs: number): boolean {
    return this.tween.tick(tween, nowMs);
  }
  disposeTween(): void { this.tween.dispose(); }

  constructor(fov: number, aspect: number) {
    this.persp = new THREE.PerspectiveCamera(fov, aspect, 0.1, 10000);
    this.persp.position.set(0, 0, 10);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    this.current = this.persp;
  }

  // 盒庭模式：据 Camera3D 选投影 + 设 fov/ortho/near/far + 轨道位姿 + lookAt。center 已含 follow 解析。
  // radius=场景半径（正交 orthoSize 缺省据此）；defFov=渲染器构造默认 fov（数据没给时的 fallback）。
  applyOrbit(
    cam3d: Camera3D,
    center: { x: number; y: number; z: number },
    dist: number,
    aspect: number,
    radius: number,
    defFov: number,
    skyRadius: number,
    shake?: ShakeOffset,
  ): THREE.Camera {
    const near = cam3d.near ?? 1;
    const far = cam3d.far ?? dist + skyRadius + 200; // 缺省：刚好框住天空盒
    let cam: THREE.Camera;
    if ((cam3d.projection ?? 'perspective') === 'ortho') {
      const f = orthoFrustum(cam3d.orthoSize ?? radius * 1.15, aspect);
      this.ortho.left = f.left; this.ortho.right = f.right; this.ortho.top = f.top; this.ortho.bottom = f.bottom;
      this.ortho.near = near; this.ortho.far = far;
      this.ortho.updateProjectionMatrix();
      cam = this.ortho;
    } else {
      this.persp.fov = cam3d.fov ?? defFov;
      this.persp.aspect = aspect;
      this.persp.near = near; this.persp.far = far;
      this.persp.updateProjectionMatrix();
      cam = this.persp;
    }
    const pitch = clampPitch(cam3d.pitch, cam3d.pitchMin, cam3d.pitchMax);
    const p = orbitCamera(center, dist, cam3d.yaw, pitch);
    // 运镜过渡：在世界空间取景层混合（from 上一帧应用取景 → raw 目标取景）。未触发时直通（记录当前取景供下次 from）。
    const eff = this.tween.apply(this.tmpEye.set(p.x, p.y, p.z), this.tmpTgt.set(center.x, center.y, center.z));
    cam.position.set(eff.eye.x, eff.eye.y, eff.eye.z);
    cam.lookAt(eff.tgt.x, eff.tgt.y, eff.tgt.z);
    // 震屏：沿相机局部右/上轴平移眼位（保持 lookAt center → 视线轻摆 = 旋转式抖动·不晕）。
    if (shake && shake.active) {
      cam.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      cam.position.addScaledVector(right, shake.rx).addScaledVector(up, shake.uy);
      cam.updateMatrixWorld();
    }
    this.current = cam;
    return cam;
  }

  // 无 Camera3D：原俯视自适配（透视·框住 2D 包围盒）。向后兼容 three-lab / game-i。
  applyFlat(bounds: Bounds2D, fov: number, aspect: number): THREE.Camera {
    const fit = fitPerspective(bounds, fov, aspect);
    this.persp.fov = fov;
    this.persp.aspect = aspect;
    this.persp.near = 0.1;
    this.persp.far = 10000;
    this.persp.updateProjectionMatrix();
    this.persp.position.set(fit.cx, fit.cy, fit.dist);
    this.persp.lookAt(fit.cx, fit.cy, 0);
    this.current = this.persp;
    return this.persp;
  }
}
