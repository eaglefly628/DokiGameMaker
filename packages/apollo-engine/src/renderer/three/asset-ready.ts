// ═══════════════════════════════════════════════════════════════
//  three/AssetReadyTracker —— 异步资产「就绪版本号」（修脏帧跳渲吞掉迟到贴图/模型帧）。
//  背景（REQ-3D-资产就绪自动重渲）：渲染器每帧先备料（ensurePbrMesh/models.ensure 解析贴图/模型），
//  再由 renderSig 判「画面没变则跳渲」省帧。但 renderSig 只含位姿/相机/灯/后处理——**不含资产就绪态**：
//  纯静态场景（无动画/相机动）+ 异步贴图/模型**迟到就绪**时，mesh 虽已按就绪态重建，renderSig 却没变 →
//  跳渲判「没变」→ 新贴图/模型永不上屏（canvas 停旧帧）。动态场景恒动撞不到，纯陈列场景必撞。
//  修法：每帧对每个被请求的资产 `mark(key, ready)`；某资产从**待办→就绪**时 `gen++`。把 `gen` 折进 renderSig →
//  迟到资产一就绪即令 renderSig 变化 → 跳渲失效 → 那一帧真正重绘上屏。收敛：就绪即出待办，不再反复触发。
//  纯逻辑（无 three/GL 依赖·可单测）。**首帧即就绪**（从未进待办）不 bump——那不是「迟到」，正常渲染已覆盖。
// ═══════════════════════════════════════════════════════════════

export class AssetReadyTracker {
  private readonly pending = new Set<string>();
  private _gen = 0;

  /** 就绪版本号：折进 renderSig。某待办资产就绪时递增 → 迫使下帧重绘。 */
  get gen(): number { return this._gen; }

  /** 当前仍在等待的资产数（诊断/测试用）。 */
  get pendingCount(): number { return this.pending.size; }

  /**
   * 每帧对每个被请求的资产调用一次。
   * @param key   资产 key
   * @param ready 本帧是否已就绪（贴图=图句柄在册·模型=模板已加载）
   * 语义：未就绪 → 记入待办；就绪且**原在待办**（=迟到就绪）→ 出待办 + gen++；首帧即就绪 → 无操作（非迟到）。
   */
  mark(key: string, ready: boolean): void {
    if (ready) { if (this.pending.delete(key)) this._gen++; }
    else this.pending.add(key);
  }
}
