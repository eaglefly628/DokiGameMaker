import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Vfx3D, Transform3D, Transform } from '@engine/protocol/components.js';
import { sampleCurve, sampleGradient } from './curve.js';

// ═══════════════════════════════════════════════════════════════
//  three/VfxSystem —— 数据驱动粒子（TA Phase 1·render-only·不进 hash·Niagara-lite 闭集模块）。
//  每个 `Vfx3D` 实体 → 一个池化 `THREE.Points`（CPU 模拟·billboard shader·按 max 封顶）。
//  render-only → 用真实帧 dt + 随机自由（不碰 sim）。形状 point/cone/sphere·力 gravity/drag·
//  size-over-life(Curve)·color-over-life(Gradient)·混合 add/alpha。全局总粒子 cap 兜底。
// ═══════════════════════════════════════════════════════════════

const GLOBAL_CAP = 6000; // 全场总粒子预算（兜底·防失控）
const DEFAULT_MAX = 256;

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; }

/** 对一颗粒子施力并**半隐式 Euler** 积分一步（render-only·纯函数·便于确定性单测）。
 *  力：gravity(-Y) + 可选点吸引弹簧 `F=strength·(target−pos)`（距离越远拉力越大·趋近自减）+ drag 阻尼（每秒比例）。
 *  半隐式（位置用**更新后**速度积分）+ 弹簧配 drag = 阻尼弹簧 = **先加速后减速**的自然收拢（不炸不夸张）。 */
export function integrateParticle(
  p: { x: number; y: number; z: number; vx: number; vy: number; vz: number },
  dt: number, gravity: number, drag: number,
  at?: { x: number; y: number; z: number; strength: number },
): void {
  if (gravity) p.vy -= gravity * dt;
  if (at && at.strength) { const k = at.strength * dt; p.vx += (at.x - p.x) * k; p.vy += (at.y - p.y) * k; p.vz += (at.z - p.z) * k; }
  if (drag > 0) { const f = Math.max(0, 1 - drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
}
interface Emitter {
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  pos: Float32Array; col: Float32Array; aAlpha: Float32Array; aSize: Float32Array;
  parts: Particle[];
  accum: number; // 发射累积
  max: number;
  blend: 'add' | 'alpha';
}

const VERT = `
  attribute float aAlpha; attribute float aSize; attribute vec3 aColor;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vColor = aColor; vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (320.0 / max(-mv.z, 0.001)); // 透视缩放（远小近大）
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.12, r); // 软圆边
    gl_FragColor = vec4(vColor, vAlpha * soft);
  }`;

export class VfxSystem {
  private readonly emitters = new Map<string, Emitter>();
  private last = -1;

  // nowMs 由渲染器传入（performance.now·render-only）。返回**全场存活粒子数**——>0 时渲染器须强制重渲
  // （粒子每帧在动·不能被 W1-C 脏跳渲冻住）。
  sync(scene: THREE.Scene, world: IWorld, nowMs: number): number {
    const dt = this.last < 0 ? 0 : Math.min(0.05, Math.max(0, (nowMs - this.last) / 1000)); // 夹 ≤50ms 防卡顿大跳
    this.last = nowMs;

    const seen = new Set<string>();
    let total = 0;
    for (const [id] of world.query('Vfx3D')) {
      const vfx = world.getComponent<Vfx3D>(id, 'Vfx3D')!;
      seen.add(id);
      const max = Math.max(1, vfx.max ?? DEFAULT_MAX);
      let e = this.emitters.get(id);
      if (!e || e.max !== max || e.blend !== (vfx.blend ?? 'add')) {
        if (e) { scene.remove(e.points); disposeEmitter(e); }
        e = createEmitter(max, vfx.blend ?? 'add'); scene.add(e.points); this.emitters.set(id, e);
      }
      this.step(e, vfx, emitterPos(world, id, vfx), dt, total);
      total += e.parts.length;
    }
    for (const [id, e] of this.emitters) if (!seen.has(id)) { scene.remove(e.points); disposeEmitter(e); this.emitters.delete(id); }
    return total;
  }

  private step(e: Emitter, vfx: Vfx3D, origin: { x: number; y: number; z: number }, dt: number, totalBefore: number): void {
    // 1) 老化 + 积分（render-only·自由用随机）。半隐式 Euler（位置用更新后的速度积分）→ 弹簧力配 drag 稳定不炸。
    const g = vfx.gravity ?? 0, drag = vfx.drag ?? 0, at = vfx.attractor;
    for (let i = e.parts.length - 1; i >= 0; i--) {
      const p = e.parts[i]!;
      p.age += dt;
      if (p.age >= p.life) { e.parts[i] = e.parts[e.parts.length - 1]!; e.parts.pop(); continue; }
      integrateParticle(p, dt, g, drag, at);
    }
    // 2) 发射（rate·dt 累积；受本发射器 max + 全局 cap 限）。
    if (dt > 0 && (vfx.rate ?? 0) > 0) {
      e.accum += vfx.rate! * dt;
      const budget = Math.min(e.max, e.parts.length + Math.max(0, GLOBAL_CAP - totalBefore));
      while (e.accum >= 1 && e.parts.length < budget) { e.accum -= 1; e.parts.push(spawn(vfx, origin)); }
      if (e.parts.length >= budget) e.accum = 0;
    }
    // 3) 写 buffer（live 粒子）。
    const n = e.parts.length;
    for (let i = 0; i < n; i++) {
      const p = e.parts[i]!;
      const lf = p.life > 0 ? p.age / p.life : 1;
      e.pos[i * 3] = p.x; e.pos[i * 3 + 1] = p.y; e.pos[i * 3 + 2] = p.z;
      const c = sampleGradient(vfx.colorGradient, lf, vfx.color ?? 0xffffff);
      e.col[i * 3] = c.r; e.col[i * 3 + 1] = c.g; e.col[i * 3 + 2] = c.b;
      e.aAlpha[i] = c.a;
      e.aSize[i] = (vfx.size ?? 1) * sampleCurve(vfx.sizeCurve, lf, 1);
    }
    e.geo.setDrawRange(0, n);
    (e.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (e.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (e.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (e.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    for (const [, e] of this.emitters) { scene.remove(e.points); disposeEmitter(e); }
    this.emitters.clear();
  }
}

// 发射器世界位：显式 x/y/z > Transform3D > 2D Transform(x→X,y→Z)+baseY。
function emitterPos(world: IWorld, id: string, vfx: Vfx3D): { x: number; y: number; z: number } {
  if (vfx.x !== undefined && vfx.y !== undefined && vfx.z !== undefined) return { x: vfx.x, y: vfx.y, z: vfx.z };
  const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
  if (t3) return { x: t3.x, y: t3.y, z: t3.z };
  const t = world.getComponent<Transform>(id, 'Transform');
  if (t) return { x: t.x, y: vfx.baseY ?? 0, z: t.y };
  return { x: vfx.x ?? 0, y: vfx.y ?? 0, z: vfx.z ?? 0 };
}

// 生成一个粒子（初位置抖动 + 按形状定初速方向）。render-only → Math.random/sin/cos 自由。
function spawn(vfx: Vfx3D, o: { x: number; y: number; z: number }): Particle {
  const jit = vfx.emitRadius ?? 0;
  const life = (vfx.lifetime ?? 1) + (Math.random() * 2 - 1) * (vfx.lifeVar ?? 0);
  const spd = (vfx.speed ?? 4) + (Math.random() * 2 - 1) * (vfx.speedVar ?? 0);
  let dx = 0, dy = 1, dz = 0;
  const shape = vfx.shape ?? 'cone';
  if (shape === 'point' || shape === 'sphere') {
    // 各向同性方向。
    const u = Math.random() * 2 - 1, phi = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    dx = s * Math.cos(phi); dy = u; dz = s * Math.sin(phi);
  } else { // cone 绕 +Y
    const ca = vfx.coneAngle ?? 0.4;
    const cosT = 1 - Math.random() * (1 - Math.cos(ca)), sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT)), phi = Math.random() * Math.PI * 2;
    dx = sinT * Math.cos(phi); dy = cosT; dz = sinT * Math.sin(phi);
  }
  const px = o.x + (Math.random() * 2 - 1) * jit, py = o.y + (Math.random() * 2 - 1) * jit, pz = o.z + (Math.random() * 2 - 1) * jit;
  return { x: px, y: py, z: pz, vx: dx * spd, vy: dy * spd, vz: dz * spd, age: 0, life: Math.max(0.05, life) };
}

function createEmitter(max: number, blend: 'add' | 'alpha'): Emitter {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), aAlpha = new Float32Array(max), aSize = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
    blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // 发射器移动/世界空间·别被裁
  points.renderOrder = 990;
  return { points, geo, mat, pos, col, aAlpha, aSize, parts: [], accum: 0, max, blend };
}

function disposeEmitter(e: Emitter): void { e.geo.dispose(); e.mat.dispose(); }
