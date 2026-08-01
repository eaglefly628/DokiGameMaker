import { World } from '@engine/core/world.js';
import type { Component, RendererBackend, IWorld } from '@engine/core/types.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import { FixedStepClock, applyCommands, hashSnapshot } from '@net/index.js';
import type { InputSource } from '@net/index.js';

export interface EngineOptions {
  // 模拟频率（Hz）。固定步长 → 任何显示器刷新率下"一个 tick"都是同一份模拟时间。
  tickRate?: number;
  // 每 tick 的输入来源（本地键盘 / 网络对端 / 脚本）。缺省则不注入输入。
  input?: InputSource;
}

// 每帧「表现/平台服务」的统一宿主接口 —— 音频(AudioSync)/存档自动保存/Steam 在场等，
// 都靠它接进规范运行时。与渲染器同侧：sim 外、不进 hash、只读世界 outcome-first（与 RendererBackend.sync 同构）。
export interface FrameService {
  sync(world: IWorld): void;
}

export class Engine {
  readonly world: World;
  private rafId: number | null = null;
  private listeners: Array<() => void> = [];
  private renderer: RendererBackend | null = null;
  private readonly services: FrameService[] = []; // 每帧服务（音频/存档/平台…），与渲染器同侧同步
  private readonly tickRate: number;
  private readonly input: InputSource | null;

  constructor(options: EngineOptions = {}) {
    this.world = new World();
    this.tickRate = options.tickRate ?? 60;
    this.input = options.input ?? null;
  }

  load(blueprint: WorldBlueprint): void {
    for (const cap of blueprint.capabilities) {
      for (const system of cap.systems) {
        this.world.addSystem(system);
      }
    }

    for (const [entityId, components] of Object.entries(blueprint.entities)) {
      this.world.createEntity(entityId);
      for (const [type, data] of Object.entries(components)) {
        this.world.addComponent(entityId, { ...data, type } as Component);
      }
    }
  }

  attachRenderer(renderer: RendererBackend, container: HTMLElement): void {
    this.renderer = renderer;
    renderer.init(container);
    renderer.sync(this.world);
  }

  // 挂一个每帧服务（如 AudioSync）。与渲染器同侧：attach 即同步一次，之后随循环每帧同步。
  // sim 外、不进 hash —— 服务只读世界 outcome-first，不回灌（守住确定性红线）。
  attachService(service: FrameService): void {
    this.services.push(service);
    service.sync(this.world);
  }

  start(): void {
    if (this.rafId !== null) return;

    // 固定步长循环：用真实流逝时间累加，跑整数个模拟步；渲染每帧一次。
    const clock = new FixedStepClock(this.tickRate);
    let last = performance.now();

    const loop = (now: number) => {
      const steps = clock.advance(now - last);
      last = now;
      for (let i = 0; i < steps; i++) this.step();
      this.renderer?.sync(this.world);
      for (const s of this.services) s.sync(this.world); // 音频/存档/平台服务每帧随渲染同步
      // 先重挂下一帧、再通知监听者：监听者在回调里同步调 stop()（局终冻结的常见写法）时，
      // cancel 掉的正是刚挂上的这一帧 → 停机即刻生效。反过来（通知在前、重挂在后）会把
      // stop() 的取消覆盖掉，引擎照跑（REQ-LOOPSTOP）。
      this.rafId = requestAnimationFrame(loop);
      this.notifyListeners();
    };

    this.rafId = requestAnimationFrame(loop);
  }

  // 一个固定模拟步：先注入"本 tick 的输入命令"，再 world.tick()。
  // 这正是联机要的接缝——把 input 换成网络对端即可，循环本身不变。
  private step(): void {
    if (this.input) {
      const tick = this.world.getVersion() + 1; // 即将运行的 tick 编号
      applyCommands(this.world, this.input.commandsForTick(tick));
    }
    this.world.tick();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // 当前世界状态的确定性指纹（与 lockstep 守卫同一套哈希）。
  hash(): string {
    return hashSnapshot(this.world.snapshot());
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
