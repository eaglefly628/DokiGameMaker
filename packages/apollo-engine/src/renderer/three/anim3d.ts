import type { IWorld } from '@engine/core/types.js';
import type { Anim3D, Anim3DChannel, Anim3DField, Transform3D } from '@engine/protocol/components.js';
import { anim3dField, springSettle } from '../three-projection.js';

// ═══════════════════════════════════════════════════════════════
//  three/Anim3DSystem —— 程序化位姿动画（render-only·不进 hash）。
//  每个挂 `Anim3D` 的实体：首见时从 Transform3D 捕获各通道 field 的**作者初值**为基准，
//  之后每帧据壁钟经过秒 + 通道数据（spin/bob）算目标分量写回 Transform3D（渲染器照常读位姿）。
//  「按初值 + 绝对经过秒算」而非「每帧累加」→ 帧率无关、无累积漂移、稳定不闪。
//  render-only：只写 Transform3D（已在 NON_DETERMINISTIC）→ 不影响 sim/hash。
// ═══════════════════════════════════════════════════════════════

interface EntState { start: number; bases: Map<Anim3DField, number>; }

export class Anim3DSystem {
  private state = new Map<string, EntState>();

  /** nowMs = 渲染器传入的壁钟（performance.now·render-only）。返回**活跃动画实体数**——>0 时渲染器须强制重渲。 */
  sync(world: IWorld, nowMs: number): number {
    const seen = new Set<string>();
    let live = 0;
    for (const [id] of world.query('Anim3D')) {
      const anim = world.getComponent<Anim3D>(id, 'Anim3D');
      const t3 = world.getComponent<Transform3D>(id, 'Transform3D');
      if (!anim || !t3 || anim.channels.length === 0) continue;
      seen.add(id);
      let st = this.state.get(id);
      if (!st) {
        st = { start: nowMs, bases: new Map() };
        for (const ch of anim.channels) if (!st.bases.has(ch.field)) st.bases.set(ch.field, fieldOf(t3, ch.field));
        this.state.set(id, st);
      }
      const tSec = (nowMs - st.start) / 1000;
      // 同 field 多通道**叠加（compose·非覆盖）**：各通道算相对初值的 delta → 同 field 求和 → 叠回初值一次写回。
      // 让「稳转 spin + 摆动 bob」叠在同一 rotY = **变速自转（加速→减速·摇骰手感）**，纯数据可表达
      //   （免游戏层 rAF 逐帧改 rate 的绕基座 bypass·REQ-3D-骰盅 P18 下沉）。异 field 单通道 → 结果与旧一致（向后兼容）。
      const delta = new Map<Anim3DField, number>();
      for (const ch of anim.channels) {
        const base = st.bases.get(ch.field) ?? 0;
        delta.set(ch.field, (delta.get(ch.field) ?? 0) + (anim3dField(ch, tSec, base) - base));
      }
      for (const [f, d] of delta) setField(t3, f, (st.bases.get(f) ?? 0) + d);
      // 活跃判定：loop 通道（spin/bob/osc/noise）永远活跃；once 通道（ease/spring）播完/沉降后不再计活跃（渲染器转 idle 省帧）。
      if (anim.channels.some((ch) => channelLive(ch, tSec))) live++;
    }
    // 卸载已消失实体的动画态（title 骰销毁 / 房间流式卸载）。
    for (const id of [...this.state.keys()]) if (!seen.has(id)) this.state.delete(id);
    return live;
  }

  dispose(): void { this.state.clear(); }
}

// 通道是否仍在动（loop 恒真；ease 播完/spring 沉降后为假 → 可转 idle 省帧）。
function channelLive(ch: Anim3DChannel, tSec: number): boolean {
  if (ch.kind === 'ease') return tSec < (ch.delay ?? 0) + ch.dur;
  if (ch.kind === 'spring') return tSec < springSettle(ch);
  return true; // spin/bob/osc/noise = loop·恒活跃
}

// Transform3D 分量读写（scale/scaleX/Y/Z 缺省 1·分轴缺省回退等比 scale·其余缺省 0）。
function fieldOf(t3: Transform3D, f: Anim3DField): number {
  const v = (t3 as unknown as Record<string, number | undefined>)[f];
  if (v !== undefined) return v;
  if (f === 'scale') return 1;
  if (f === 'scaleX' || f === 'scaleY' || f === 'scaleZ') return t3.scale ?? 1; // 分轴基准=作者等比 scale（未写则 1）
  return 0;
}
function setField(t3: Transform3D, f: Anim3DField, v: number): void {
  (t3 as unknown as Record<string, number>)[f] = v;
}

// 重导出通道类型供渲染器/测试用（避免各处再从 protocol 拉）。
export type { Anim3DChannel };
