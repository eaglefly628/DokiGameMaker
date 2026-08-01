import type { EntityId, ComponentType, Component, SystemDeclaration, IWorld, TickObserver, WorldSnapshot } from './types.js';
import { topologicalSort } from './topological-sort.js';

export class World implements IWorld {
  private entities = new Map<EntityId, Map<ComponentType, Component>>();
  private systems: SystemDeclaration[] = [];
  private sorted: SystemDeclaration[] = [];
  private needsSort = false;
  private version = 0;
  private observer?: TickObserver;

  // ── 倒排组件索引（query-perf-plan 方案 A）──
  // typeIndex: 组件类型 → 持有它的实体集（add/remove/destroy/consume 同步维护）。
  // creationSeq: 实体创建序号——query 候选按它排序，与旧实现"entities 插入序全扫"**逐字节同序**
  // （确定性铁律：lockstep/录放依赖 query 顺序稳定；hash 自身 canonical 排序不受影响）。
  private typeIndex = new Map<ComponentType, Set<EntityId>>();
  private creationSeq = new Map<EntityId, number>();
  private nextSeq = 0;

  // ── Entity operations ──

  createEntity(id: EntityId): void {
    if (this.entities.has(id)) throw new Error(`Entity "${id}" already exists`);
    this.entities.set(id, new Map());
    this.creationSeq.set(id, this.nextSeq++);
  }

  destroyEntity(id: EntityId): void {
    const comps = this.entities.get(id);
    if (comps) {
      for (const type of comps.keys()) this.typeIndex.get(type)?.delete(id);
    }
    this.entities.delete(id);
    this.creationSeq.delete(id);
  }

  getAllEntities(): EntityId[] {
    return Array.from(this.entities.keys());
  }

  // ── Component operations ──

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity "${entityId}" not found`);
    entity.set(component.type, component);
    let owners = this.typeIndex.get(component.type);
    if (!owners) {
      owners = new Set();
      this.typeIndex.set(component.type, owners);
    }
    owners.add(entityId);
  }

  removeComponent(entityId: EntityId, type: ComponentType): void {
    if (this.entities.get(entityId)?.delete(type)) {
      this.typeIndex.get(type)?.delete(entityId);
    }
  }

  getComponent<T extends Component>(entityId: EntityId, type: ComponentType): T | undefined {
    return this.entities.get(entityId)?.get(type) as T | undefined;
  }

  hasComponent(entityId: EntityId, type: ComponentType): boolean {
    return this.entities.get(entityId)?.has(type) ?? false;
  }

  // ── Queries ──

  // 倒排索引剪枝：取**最稀有 type** 的实体集做候选，再过滤其余 type；候选按 creationSeq 排序
  // → 返回序与旧"全表插入序扫描"逐字节一致（行为零变）。O(k log k + k×|types|)，k=最稀有集大小。
  query(...types: ComponentType[]): Array<[EntityId, Map<ComponentType, Component>]> {
    const results: Array<[EntityId, Map<ComponentType, Component>]> = [];
    if (types.length === 0) {
      // 退化：无条件 → 全量（保持旧 every([])≡true 行为，插入序）。
      for (const [id, comps] of this.entities) results.push([id, comps]);
      return results;
    }

    let rarest: Set<EntityId> | undefined;
    for (const t of types) {
      const owners = this.typeIndex.get(t);
      if (!owners || owners.size === 0) return []; // 某 type 无人持有 → 必空
      if (!rarest || owners.size < rarest.size) rarest = owners;
    }

    // 稠密退化（候选过半）：索引剪不动 → 直接按 entities 插入序全扫（=旧实现，天然旧序，
    // 免 per-candidate 双重 Map.get 与排序开销）。索引只在稀有查询时发挥剪枝价值。
    if (rarest!.size * 2 > this.entities.size) {
      for (const [id, comps] of this.entities) {
        if (types.every(t => comps.has(t))) results.push([id, comps]);
      }
      return results;
    }

    let prevSeq = -1;
    let monotonic = true;
    for (const id of rarest!) {
      const comps = this.entities.get(id);
      if (comps && types.every(t => comps.has(t))) {
        const seq = this.creationSeq.get(id)!;
        if (seq < prevSeq) monotonic = false;
        prevSeq = seq;
        results.push([id, comps]);
      }
    }
    // Set 迭代序=加入序。组件从未被增删的常见情形下它就是创建序（单调）→ 免排序；
    // 被 remove→re-add 过的实体会排到集尾 → 仅此时按创建序重排，保证与旧全扫描逐字节同序。
    if (!monotonic) {
      results.sort((a, b) => this.creationSeq.get(a[0])! - this.creationSeq.get(b[0])!);
    }
    return results;
  }

  queryEntities(...types: ComponentType[]): EntityId[] {
    return this.query(...types).map(([id]) => id);
  }

  // ── System management ──

  addSystem(system: SystemDeclaration): void {
    this.systems.push(system);
    this.needsSort = true;
  }

  private ensureSorted(): void {
    if (this.needsSort) {
      this.sorted = topologicalSort(this.systems);
      this.needsSort = false;
    }
  }

  // ── Debug instrumentation ──

  setObserver(observer?: TickObserver): void {
    this.observer = observer;
  }

  // ── Game loop ──

  tick(): void {
    this.ensureSorted();
    this.observer?.onTickStart?.(this.version + 1);

    for (const system of this.sorted) {
      this.observer?.onSystemStart?.(system);
      system.execute(this);

      // Consume: remove components marked as consumed（走倒排索引，O(持有者数)；并保持索引一致）
      for (const consumeType of system.consumes) {
        const owners = this.typeIndex.get(consumeType);
        if (!owners || owners.size === 0) continue;
        for (const entityId of owners) {
          this.entities.get(entityId)?.delete(consumeType);
        }
        owners.clear();
      }

      this.observer?.onSystemEnd?.(system);
    }

    this.version++;
    this.observer?.onTickEnd?.(this.version);
  }

  getVersion(): number {
    return this.version;
  }

  getSortedSystems(): readonly SystemDeclaration[] {
    this.ensureSorted();
    return this.sorted;
  }

  // ── Snapshot / restore (record / replay / time-travel) ──

  snapshot(): WorldSnapshot {
    const snap: WorldSnapshot = {};
    for (const [id, comps] of this.entities) {
      const components: Record<ComponentType, Component> = {};
      for (const [type, comp] of comps) {
        components[type] = structuredClone(comp);
      }
      snap[id] = components;
    }
    return snap;
  }

  restore(snapshot: WorldSnapshot): void {
    this.entities.clear();
    this.typeIndex.clear();
    this.creationSeq.clear();
    this.nextSeq = 0;
    for (const [id, comps] of Object.entries(snapshot)) {
      const m = new Map<ComponentType, Component>();
      this.creationSeq.set(id, this.nextSeq++); // 快照键序=原创建序 → query 序经重放仍一致
      for (const [type, comp] of Object.entries(comps)) {
        m.set(type, structuredClone(comp));
        let owners = this.typeIndex.get(type);
        if (!owners) {
          owners = new Set();
          this.typeIndex.set(type, owners);
        }
        owners.add(id);
      }
      this.entities.set(id, m);
    }
  }
}
