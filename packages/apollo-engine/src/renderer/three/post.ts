import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import type { Post3D } from '@engine/protocol/components.js';
import { clamp01, posOr, fin } from './num-guard.js';

// 色彩分级 + 暗角 + 命中闪白 shader（TA Phase 4 + 超休闲缺口 E）：
//   曝光×→亮度+→对比(绕中灰)→饱和(向亮度 mix)→染色× → 暗角(边缘趋 vigColor) → 命中闪白(全屏朝 flashColor 混合)。
//   三者共用这一个 pass（零额外 pass 开销）：不需要时 uniform 取中性值（vigIntensity=0 / flashAmount=0）即无副作用。
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    exposure: { value: 1 }, contrast: { value: 1 }, saturation: { value: 1 }, brightness: { value: 0 },
    tint: { value: new THREE.Color(1, 1, 1) },
    vigIntensity: { value: 0 }, vigSmooth: { value: 0.5 }, vigColor: { value: new THREE.Color(0, 0, 0) },
    flashColor: { value: new THREE.Color(1, 1, 1) }, flashAmount: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, contrast, saturation, brightness; uniform vec3 tint;
    uniform float vigIntensity, vigSmooth, flashAmount; uniform vec3 vigColor, flashColor;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * exposure + brightness;
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation) * tint;
      float d = distance(vUv, vec2(0.5)) * 1.41421356;              // 0 中心 ~1 角
      float vig = 1.0 - vigIntensity * smoothstep(vigSmooth, 1.0, d);
      col = mix(vigColor, col, clamp(vig, 0.0, 1.0));               // 边缘趋 vigColor
      col = mix(col, flashColor, clamp(flashAmount, 0.0, 1.0));     // 命中全屏闪白
      gl_FragColor = vec4(col, c.a);
    }`,
};

// ── FlashDecay（Post3D.flash 解释器·trauma 式·render-only）─────────────────────────────────────
// 游戏 bump `trigger` → 注入 amount=1；按 decay(/秒) 线性衰减到 0。返回当前闪白量（渲染器折进 renderSig 持续重渲直至归零）。
export class FlashDecay {
  private last: number | undefined = undefined;
  private t0 = 0; private amt = 0;
  update(flash: { trigger?: number; decay?: number } | undefined, nowMs: number): number {
    if (!flash) { this.amt = 0; this.last = undefined; return 0; }
    if (this.last === undefined) { this.last = flash.trigger; return 0; } // 首见=基线·不闪（静态带 trigger 的场景装载不白闪·bump 才闪）
    if (flash.trigger !== this.last) { this.last = flash.trigger; this.t0 = nowMs; this.amt = 1; }
    this.amt = Math.max(0, 1 - (nowMs - this.t0) / 1000 * (flash.decay ?? 3));
    return this.amt;
  }
  dispose(): void { this.amt = 0; this.last = undefined; }
}

// ═══════════════════════════════════════════════════════════════
//  three/PostPipeline —— 后处理子系统（EffectComposer·懒建）。
//  RenderPass → GTAO(环境光遮蔽) → 水平+垂直移轴 ShaderPass(tilt-shift) → UnrealBloom → OutputPass。
//  各 pass 的开关/参数每帧据 Post3D 数据设（不重建·只改 uniform/enabled）。无 Post3D 时整条管线不建。
// ═══════════════════════════════════════════════════════════════

export class PostPipeline {
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private gtao?: GTAOPass;
  private hTilt?: ShaderPass;
  private vTilt?: ShaderPass;
  private bloom?: UnrealBloomPass;
  private grade?: ShaderPass;
  private smaa?: SMAAPass;

  constructor(
    private readonly gl: THREE.WebGLRenderer,
    private width: number,
    private height: number,
  ) {}

  /** 改后处理尺寸（配合 ThreeRenderer.resize）：更新 composer 及各 pass 的渲染目标；tilt 移轴 uniform 每帧按 width/height 重算故自动跟。 */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer?.setSize(width, height); // EffectComposer.setSize 级联到 GTAO/bloom/SMAA 等有 setSize 的 pass
  }

  // 据 Post3D 渲染一帧（懒建管线 + 设参数 + composer.render）。camera 可能在透视/正交间切换 → 每帧更新 RenderPass。
  // flashAmount = 渲染器算好的命中闪白量 [0,1]（trauma 式衰减·由 FlashDecay 据 post.flash.trigger 维护）。
  render(scene: THREE.Scene, camera: THREE.Camera, post: Post3D, flashAmount = 0): void {
    this.ensure(scene, camera);
    this.renderPass!.camera = camera;
    // 环境光遮蔽（GTAO·接触阴影/缝隙压暗）。相机可能透视/正交切换 → 每帧更新。
    const ao = post.ao;
    this.gtao!.enabled = !!ao;
    if (ao) {
      this.gtao!.camera = camera;
      // 健壮性铁律：AO 任何数值参数都先过 finite 钳位，**绝不让 NaN/超界进 GTAO** —— 否则黑屏。
      //  · blendIntensity 是 AO「不透明度」(0=不施加·1=全施加)，非强度倍率：GTAO blend = mix(1, ao, intensity)
      //    = 1 − intensity·(1−ao)，>1 让有遮蔽处(ao<1)变负 → 钳 0 → 整片黑；NaN(如上游传 undefined)更直接全黑。
      //    故夹死 [0,1] 且 NaN→1。想要「更强 AO」调 scale（增大遮蔽量），别把 intensity 顶过 1。
      //  · radius/scale 同样 finite 兜底（弱 LLM / UI 抖动写脏值也不崩画面）。
      this.gtao!.blendIntensity = clamp01(ao.intensity, 1);
      this.gtao!.updateGtaoMaterial({ radius: posOr(ao.radius, 4), scale: posOr(ao.scale, 1) });
    }
    const ts = post.tiltShift;
    const tsOn = !!ts;
    this.hTilt!.enabled = tsOn;
    this.vTilt!.enabled = tsOn;
    if (ts) {
      const focus = ts.focus ?? 0.5;
      const intensity = ts.intensity ?? 3;
      this.hTilt!.uniforms['r']!.value = focus;
      this.hTilt!.uniforms['h']!.value = intensity / this.width;
      this.vTilt!.uniforms['r']!.value = focus;
      this.vTilt!.uniforms['v']!.value = intensity / this.height;
    }
    const bl = post.bloom;
    this.bloom!.enabled = !!bl;
    if (bl) {
      this.bloom!.strength = bl.strength ?? 0.6;
      this.bloom!.radius = bl.radius ?? 0.4;
      this.bloom!.threshold = bl.threshold ?? 0.85;
    }
    // 色彩分级 + 暗角 + 命中闪白（共用一 pass·任一在用即启）。
    const gr = post.grade, vig = post.vignette;
    const flashAmt = Math.max(0, Math.min(1, Number.isFinite(flashAmount) ? flashAmount : 0));
    this.grade!.enabled = !!gr || !!vig || flashAmt > 0;
    if (this.grade!.enabled) {
      const u = this.grade!.uniforms;
      // 分级：无 grade → 中性（不改画面）。finite 兜底（NaN 进 shader → 全黑）。
      u['exposure']!.value = fin(gr?.exposure, 1);
      u['contrast']!.value = fin(gr?.contrast, 1);
      u['saturation']!.value = fin(gr?.saturation, 1);
      u['brightness']!.value = fin(gr?.brightness, 0);
      (u['tint']!.value as THREE.Color).setHex((Number.isFinite(gr?.tint) ? (gr!.tint as number) : 0xffffff) & 0xffffff);
      // 暗角：无 vignette → intensity 0（无副作用）。
      u['vigIntensity']!.value = clamp01(vig?.intensity, 0);
      u['vigSmooth']!.value = clamp01(vig?.smoothness, 0.5);
      (u['vigColor']!.value as THREE.Color).setHex((Number.isFinite(vig?.color) ? (vig!.color as number) : 0x000000) & 0xffffff);
      // 命中闪白：amount 由渲染器传入·color 取 post.flash.color。
      u['flashAmount']!.value = flashAmt;
      (u['flashColor']!.value as THREE.Color).setHex((Number.isFinite(post.flash?.color) ? (post.flash!.color as number) : 0xffffff) & 0xffffff);
    }
    // 抗锯齿（SMAA·清 toon 硬边）。
    this.smaa!.enabled = !!post.aa;
    this.composer!.render();
  }

  private ensure(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer) {
      // 场景/相机对象在 init 后稳定，RenderPass 持引用即可（盒庭单场景单相机）。
      return;
    }
    const composer = new EffectComposer(this.gl);
    composer.setSize(this.width, this.height);
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    // GTAO：在 beauty 之后算 AO 并叠加压暗（output=Default·blendIntensity 控强度）。
    const gtao = new GTAOPass(scene, camera, this.width, this.height);
    gtao.output = GTAOPass.OUTPUT.Default;
    composer.addPass(gtao);
    const h = new ShaderPass(HorizontalTiltShiftShader);
    const v = new ShaderPass(VerticalTiltShiftShader);
    composer.addPass(h);
    composer.addPass(v);
    const bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.6, 0.4, 0.85);
    composer.addPass(bloom);
    const grade = new ShaderPass(ColorGradeShader);
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    const smaa = new SMAAPass(); // 末端抗锯齿（作用于 LDR 输出）
    composer.addPass(smaa);
    this.composer = composer;
    this.gtao = gtao; this.hTilt = h; this.vTilt = v; this.bloom = bloom; this.grade = grade; this.smaa = smaa;
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = undefined;
  }
}
