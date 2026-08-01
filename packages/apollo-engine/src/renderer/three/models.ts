import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Model3D, AnimState3D } from '@engine/protocol/components.js';
import type { AssetManager } from '@assets/index.js';
import { isModelHandle } from '@assets/index.js';
import { disposeObject } from './geometry.js';

// ═══════════════════════════════════════════════════════════════
//  three/ModelPool —— 导入式 glTF 模型 + **骨骼动画** 子系统。
//  按 modelKey 取 ArrayBuffer 字节（AssetManager）→ GLTFLoader.parse 一次入模板缓存（含动画 clip）→ 多实例
//  **SkeletonUtils.clone**（正确克隆骨架/蒙皮·每实例独立动画）。挂 AnimState3D 的实体建 AnimationMixer 播指定 clip。
//  未就绪本帧不画（向后兼容·同 sprite 先例）。纯表现·不写 sim/hash。
// ═══════════════════════════════════════════════════════════════

interface Tpl { scene: THREE.Object3D; clips: THREE.AnimationClip[]; } // 模板：场景图 + glTF 动画
interface Anim { mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[]; clip?: string; action?: THREE.AnimationAction; }

export class ModelPool {
  private gltf?: GLTFLoader; // 懒建
  private readonly instances = new Map<string, THREE.Object3D>(); // 每实体已放置的实例（template 的 clone）
  private readonly mats = new Map<string, THREE.Material[]>(); // 每实例自有材质（clone 出·供染色/独立释放）
  private readonly keyOf = new Map<string, string>(); // 实体当前 modelKey（变了才重建实例）
  private readonly cache = new Map<string, Tpl>(); // 按 modelKey 的已解析模板（解析一次·多实例 clone）
  private readonly state = new Map<string, 'pending' | 'failed'>(); // 解析中/失败（避免每帧重复 parse）
  private readonly anims = new Map<string, Anim>(); // 每实体骨骼动画混合器（模型有 clip 时）
  private lastMs = 0; // 上次推进的壁钟（算 mixer delta）

  constructor(private readonly assets?: AssetManager) {}

  get count(): number {
    return this.instances.size;
  }

  // 建/复用实例：modelKey 不变则复用；变了拆旧建新。模板未就绪 → null（本帧不画）。tint 每帧由调用方设。
  ensure(scene: THREE.Scene, entityId: string, m: Model3D): THREE.Object3D | null {
    const prev = this.instances.get(entityId);
    if (prev && this.keyOf.get(entityId) === m.modelKey) return prev;
    if (prev) this.removeInstance(scene, entityId);
    const tpl = this.template(m.modelKey);
    if (!tpl) return null;
    const obj = cloneSkinned(tpl.scene); // SkeletonUtils.clone：正确克隆骨架/蒙皮（每实例独立动画·共享几何）
    const mats: THREE.Material[] = [];
    const cloneMat = (src: THREE.Material): THREE.Material => { const c = src.clone(); mats.push(c); return c; };
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true; // 盒庭里模型与地台互投软影
      const src = mesh.material;
      mesh.material = Array.isArray(src) ? src.map(cloneMat) : cloneMat(src);
    });
    this.instances.set(entityId, obj);
    this.mats.set(entityId, mats);
    this.keyOf.set(entityId, m.modelKey);
    if (tpl.clips.length > 0) this.anims.set(entityId, { mixer: new THREE.AnimationMixer(obj), clips: tpl.clips });
    scene.add(obj);
    return obj;
  }

  // 应用骨骼动画状态：clip 名变 → 淡入切新动作（旧的淡出·idle↔run 平滑过渡）；每帧设倍速/循环。模型无 clip 则 no-op。
  applyAnim(entityId: string, a: AnimState3D): void {
    const an = this.anims.get(entityId);
    if (!an) return;
    if (an.clip !== a.clip) {
      const clip = THREE.AnimationClip.findByName(an.clips, a.clip) ?? an.clips[0];
      if (!clip) return;
      const next = an.mixer.clipAction(clip);
      next.reset();
      next.setLoop(a.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = a.loop === false;
      next.fadeIn(0.25);
      next.play();
      if (an.action && an.action !== next) an.action.fadeOut(0.25);
      an.action = next;
      an.clip = a.clip;
    }
    if (an.action) an.action.timeScale = a.speed ?? 1;
  }

  // 每帧推进所有混合器（render-only·壁钟 delta）。返回活跃混合器数（>0 → 渲染器折进 renderSig 持续重渲 + 刷阴影）。
  update(nowMs: number): number {
    if (this.anims.size === 0) { this.lastMs = nowMs; return 0; }
    const dt = this.lastMs ? Math.min(0.1, (nowMs - this.lastMs) / 1000) : 0;
    this.lastMs = nowMs;
    for (const [, an] of this.anims) an.mixer.update(dt);
    return this.anims.size;
  }

  // 整体染色（每帧·tint 变即反映）：把实例自有材质的 color 设成 hex。
  tint(entityId: string, hex: number): void {
    for (const mm of this.mats.get(entityId) ?? []) (mm as THREE.MeshStandardMaterial).color?.setHex(hex & 0xffffff);
  }

  // 移除本帧未见（消失）的实例。
  sweep(scene: THREE.Scene, seen: ReadonlySet<string>): void {
    for (const id of [...this.instances.keys()]) {
      if (!seen.has(id)) this.removeInstance(scene, id);
    }
  }

  private removeInstance(scene: THREE.Scene, id: string): void {
    const obj = this.instances.get(id);
    if (obj) scene.remove(obj);
    this.anims.get(id)?.mixer.stopAllAction();
    for (const mm of this.mats.get(id) ?? []) mm.dispose();
    this.instances.delete(id);
    this.mats.delete(id);
    this.keyOf.delete(id);
    this.anims.delete(id);
  }

  dispose(scene: THREE.Scene): void {
    for (const [id] of [...this.instances]) this.removeInstance(scene, id);
    for (const [, tpl] of this.cache) disposeObject(tpl.scene); // 模板：释放共享几何 + 模板自带材质
    this.cache.clear();
    this.state.clear();
  }

  // 按 modelKey 取已解析模板（含动画 clip）。首见且字节备好 → 异步 parse 一次（标 pending 防每帧重复）。
  private template(key: string): Tpl | null {
    const ready = this.cache.get(key);
    if (ready) return ready;
    if (this.state.get(key)) return null; // pending / failed
    const handle = this.assets?.get(key)?.handle;
    if (!isModelHandle(handle)) return null;
    this.state.set(key, 'pending');
    (this.gltf ??= new GLTFLoader()).parse(
      handle,
      '',
      (gltf) => { this.cache.set(key, { scene: gltf.scene, clips: gltf.animations ?? [] }); this.state.delete(key); },
      () => { this.state.set(key, 'failed'); },
    );
    return null;
  }
}
