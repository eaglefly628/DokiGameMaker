// 引擎公用宿主运行环（render-only · 零 sim 依赖）——REQ-SHELL-公共壳三件 ①·mount-host 姊妹件。
//
// 抽出四家宿主逐字重复的「一局的生老病死」壳层：
//   game-103.ts:199-236 · game-q.ts:112-165 · game-t.ts:213-250 · game101.ts:360-388
// 公倍数恰好四件事：
//   ① startSim/stopSim/restart —— 建局（engine+renderer+胶水）→ 订阅每帧 → 起跑；停局时退订+停机+释放。
//   ② lastSig 差分重绘 —— 把世界态投影成一个签名串，只在变了才重绘 HUD（省 mountUI diff）。
//   ③ 局终冻结 sim —— 状态离开 playing 时停机（浮层已盖·省 CPU），**首见一次**（幂等）。
//   ④ overlay 挂/摘 —— 局终挂结算浮层、局内摘掉。
// 本 helper 只管这四件的**时序**：不建 Engine、不碰 World/渲染器/输入/HUD——那些全由宿主的
// `create`/`read`/`paint`/`overlay` 回调提供（同 mount-host 纪律：只搭台，不进 sim/hash）。
// 跳过或复用本件都不影响回放/hash/lockstep。
//
// ⚠ 冻结为何延到 microtask（BUG-04·game-103.ts:93-96 已验证的坑）：`Engine.start()` 的 loop 旧序在
// notifyListeners() **之后**才 `rafId = requestAnimationFrame(loop)` 重挂——从 listener 里同步调
// engine.stop() 只会取消旧 rafId，紧接着那行又把 loop 重新挂上，sim 根本停不下来。延到 microtask
// 执行时 loop 已返回、重挂的 RAF 还没触发 → 干净取消。
// **引擎已修（REQ-LOOPSTOP·2026-07-29）**：重挂移到通知之前，listener 里同步 stop() 即刻生效
// （回归 `src/runtime/engine.loop-stop.test.ts`）。此处的 `defer` 转为**防御性保留**——`SimHandle`
// 是结构面，宿主可传任何自实现的 sim（未必有同样修好的重挂序），延一拍冻结无害且更稳。

/** 一局引擎的最小结构面（不绑具体 Engine 类型·便于无头测试替身；`Engine` 天然满足）。 */
export interface SimHandle {
  /** 订阅每帧回调 → 返回退订。 */
  subscribe(listener: () => void): () => void;
  /** 起跑。 */
  start(): void;
  /** 停机（幂等）。 */
  stop(): void;
}

/** 结算浮层挂/摘（宿主用 mountUI 实现；缺省=本局无浮层）。 */
export interface RunLoopOverlay<S> {
  /** 局终首见：挂浮层。 */
  open(state: S): void;
  /** 浮层已挂且仍在局终：更新（缺省=不更新）。 */
  update?(state: S): void;
  /** 摘浮层（回到局内 / 重开 / 停局时调·须幂等）。 */
  close(): void;
}

/**
 * 运行环配置。`S`=宿主投影出的 HUD 态；`C`=宿主自定的「本局运行体」形状
 * （各家现状都是 `{ engine, renderer, ... }` 这样一个对象·原样传即可）。
 */
export interface RunLoopOptions<S, C> {
  /** 建本局运行体：new Engine + load 蓝图 + attachRenderer + 画布胶水…（宿主自定形状）。 */
  create(): C;
  /** 从运行体取引擎面（通常 `s => s.engine`）——本件只用它 subscribe/start/stop。 */
  engineOf(session: C): SimHandle;
  /** 读态：从运行体投影出 HUD 态（宿主的 readState）。 */
  read(session: C): S;
  /** 差分签名：同串=不重绘。把「肉眼看得见的字段」拼进来即可。 */
  sig(state: S): string;
  /** 重绘：把态摆进 LayoutNode HUD（宿主的 topUi.update(...) 等）。 */
  paint(state: S): void;
  /** 局终判定（缺省=永不局终·纯常驻 HUD 的游戏用）。 */
  over?(state: S): boolean;
  /**
   * 局终**首见一次**的钩子（记成绩/存档/发成就）。幂等由本件保证（同一局只调一次·回到局内后重置）。
   * 入参就是本帧那个态对象——宿主可就地补字段（如把排行榜/名次挂上去）再由 paint 消费。
   */
  onOver?(state: S): void;
  /** 结算浮层（缺省=无浮层）。 */
  overlay?: RunLoopOverlay<S>;
  /** 局终是否冻结 sim（默认 true·延到 microtask 见头注 BUG-04）。 */
  freezeOnOver?: boolean;
  /** 停局时释放本局宿主侧资源：renderer.destroy() / removeEventListener / input.dispose()。 */
  dispose?(session: C): void;
  /** 重开前清宿主局内态（连杀窗/成就横幅/结算冻结…·持久态不该在这清）。 */
  reset?(): void;
  /** 冻结投递方式（默认 queueMicrotask·测试可注入同步执行以免等微任务）。 */
  defer?(fn: () => void): void;
}

/** 运行环句柄。 */
export interface RunLoop<C> {
  /** 开局（已在跑=幂等空操作）。 */
  start(): void;
  /** 停局：退订 + 停机 + dispose + 摘浮层。 */
  stop(): void;
  /** 重开：摘浮层 → reset → stop → start。 */
  restart(): void;
  /** 手动补投影一帧（如切静音后要立刻反映·或局终后浮层需刷新）。未开局=空操作。 */
  refresh(): void;
  /** 作废差分签名 → 下一次 refresh 必重绘。 */
  invalidate(): void;
  /** 当前运行体（未开局=null·供 handler 判「在局内吗」）。 */
  readonly session: C | null;
}

/**
 * 建一个宿主运行环。典型接法（game-q 形态）：
 * ```ts
 * const loop = createRunLoop({
 *   create: () => { const engine = new Engine({ input }); engine.load(bp); … ; return { engine, renderer, canvas, onDown }; },
 *   engineOf: (s) => s.engine,
 *   read: (s) => readState(s.engine),
 *   dispose: (s) => { s.canvas.removeEventListener('pointerdown', s.onDown); s.renderer.destroy(); },
 *   sig: (st) => `${st.lives}|${st.gold}|${st.status}`,
 *   paint: (st) => { topUi.update(buildTopBar(st), THEME); },
 *   over: (st) => st.status !== 'playing',
 *   overlay: { open: (st) => { overlayUi = mountUI(...); }, update: (st) => overlayUi?.update(...), close: () => { overlayUi?.(); overlayUi = null; } },
 * });
 * loop.start();
 * ```
 */
export function createRunLoop<S, C>(opts: RunLoopOptions<S, C>): RunLoop<C> {
  const freeze = opts.freezeOnOver !== false;
  const defer = opts.defer ?? ((fn: () => void) => queueMicrotask(fn));

  let session: C | null = null;
  let unsub: (() => void) | null = null;
  let lastSig: string | null = null; // null = 已作废 → 下帧必重绘
  let overSeen = false;              // 本局是否已过局终首见门（幂等钩 + 冻结只跑一次）
  let overlayOpen = false;

  function closeOverlay(): void {
    if (!overlayOpen) return;
    overlayOpen = false;
    opts.overlay?.close();
  }

  function refresh(): void {
    if (!session) return;
    const state = opts.read(session);
    const isOver = opts.over ? opts.over(state) : false;

    if (isOver && !overSeen) {
      overSeen = true;
      lastSig = null;              // 局终首帧强制重绘（结算字段常不在 sig 里·如名次/星级）
      opts.onOver?.(state);        // 宿主可就地给 state 补结算字段，下面的 paint 即刻消费
      if (freeze) {
        const s = session;
        defer(() => { if (session === s) opts.engineOf(s).stop(); }); // 见头注 BUG-04；重开后不误停新局
      }
    } else if (!isOver && overSeen) {
      overSeen = false;            // 回到局内（重开/续关）→ 重新武装局终门
      lastSig = null;
    }
    if (!isOver) closeOverlay();

    const sig = opts.sig(state);
    if (sig !== lastSig) {
      lastSig = sig;
      opts.paint(state);
    }

    if (isOver && opts.overlay) {
      if (!overlayOpen) { overlayOpen = true; opts.overlay.open(state); }
      else opts.overlay.update?.(state);
    }
  }

  function start(): void {
    if (session) return; // 已在跑=幂等
    const s = opts.create();
    session = s;
    lastSig = null;
    overSeen = false;
    unsub = opts.engineOf(s).subscribe(refresh);
    opts.engineOf(s).start();
    refresh(); // 首帧立刻投影（别等第一次 tick 才有画面）
  }

  function stop(): void {
    const s = session;
    if (!s) return;
    session = null; // 先摘引用：defer 的冻结回调据此认出"局已换/已停"
    unsub?.();
    unsub = null;
    opts.engineOf(s).stop();
    opts.dispose?.(s);
    closeOverlay();
    lastSig = null;
    overSeen = false;
  }

  function restart(): void {
    closeOverlay();
    opts.reset?.();
    stop();
    start();
  }

  return {
    start,
    stop,
    restart,
    refresh,
    invalidate() { lastSig = null; },
    get session(): C | null { return session; },
  };
}
