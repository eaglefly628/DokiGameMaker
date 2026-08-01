import * as THREE from 'three';
import type { IWorld } from '@engine/core/types.js';
import type { Transform, NavGraph, NavPath } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  three/NavDebug —— 导航可视化（render-only·我的渲染线域）。读 sim 的 `NavGraph`(+`NavPath`)：
//  ① 航点 = 青点（自动烘焙的可行走格中心·没点处=被碰撞封住=「寻路碰撞」）；② 连边 = 暗青线（可走拓扑）；
//  ③ 每个智能体的 `NavPath.via` = 亮黄路径线（A* 规划的航点序）。纯表现：只读 world、不写 sim。开关即增删。
//  平面：NavGraph 节点 (x, y=世界Z)（game-z：Transform.y→Z）→ three 坐标 (x, 高度, z)。
// ═══════════════════════════════════════════════════════════════

const COL_NODE = 0x00e5ff; // 航点=青
const COL_EDGE = 0x0097a7; // 连边=暗青
const COL_PATH = 0xffd54f; // 规划路径=黄
const NODE_Y = 0.3, EDGE_Y = 0.25, PATH_Y = 0.7;

export class NavDebug {
  private nodesMesh: THREE.InstancedMesh | null = null;
  private edgeLines: THREE.LineSegments | null = null;
  private sig = '';
  private readonly paths = new Map<string, THREE.Line>();

  sync(scene: THREE.Scene, world: IWorld, enabled: boolean): void {
    if (!enabled) { this.clear(scene); return; }
    const gids = world.query('NavGraph').map(([id]) => id).sort();
    if (gids.length === 0) { this.clear(scene); return; }
    const nav = world.getComponent<NavGraph>(gids[0]!, 'NavGraph')!;

    // 图（航点 + 连边）变才重建（sig 守门：节点/边数）。
    const sig = `${nav.nodes.length}|${nav.edges.length}`;
    if (sig !== this.sig) { this.rebuild(scene, nav); this.sig = sig; }

    // 路径线（每帧更新·池按 agent id）：智能体 Transform → via 航点 → 目标点。
    const seen = new Set<string>();
    for (const [id] of world.query('NavPath', 'Transform')) {
      const p = world.getComponent<NavPath>(id, 'NavPath')!;
      const t = world.getComponent<Transform>(id, 'Transform')!;
      const pts: THREE.Vector3[] = [new THREE.Vector3(t.x, PATH_Y, t.y)];
      for (const ni of p.via) { const n = nav.nodes[ni]; if (n) pts.push(new THREE.Vector3(n.x, PATH_Y, n.y)); }
      pts.push(new THREE.Vector3(p.gx, PATH_Y, p.gy));
      if (pts.length < 2) continue;
      seen.add(id);
      let line = this.paths.get(id);
      if (!line) {
        line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COL_PATH, transparent: true, opacity: 0.95 }));
        line.renderOrder = 999; scene.add(line); this.paths.set(id, line);
      }
      line.geometry.setFromPoints(pts);
    }
    for (const [id, line] of this.paths) if (!seen.has(id)) { scene.remove(line); line.geometry.dispose(); (line.material as THREE.Material).dispose(); this.paths.delete(id); }
  }

  private rebuild(scene: THREE.Scene, nav: NavGraph): void {
    if (this.nodesMesh) { scene.remove(this.nodesMesh); this.nodesMesh.geometry.dispose(); (this.nodesMesh.material as THREE.Material).dispose(); this.nodesMesh = null; }
    if (this.edgeLines) { scene.remove(this.edgeLines); this.edgeLines.geometry.dispose(); (this.edgeLines.material as THREE.Material).dispose(); this.edgeLines = null; }

    // 航点：单 InstancedMesh 小球。
    if (nav.nodes.length > 0) {
      const geo = new THREE.SphereGeometry(0.5, 6, 5);
      const mat = new THREE.MeshBasicMaterial({ color: COL_NODE, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
      const mesh = new THREE.InstancedMesh(geo, mat, nav.nodes.length);
      const m = new THREE.Matrix4();
      for (let i = 0; i < nav.nodes.length; i++) { m.makeTranslation(nav.nodes[i]!.x, NODE_Y, nav.nodes[i]!.y); mesh.setMatrixAt(i, m); }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = 997;
      scene.add(mesh);
      this.nodesMesh = mesh;
    }

    // 连边：LineSegments（每条边两端点）。
    if (nav.edges.length > 0) {
      const pts: THREE.Vector3[] = [];
      for (const e of nav.edges) {
        const a = nav.nodes[e.a], b = nav.nodes[e.b];
        if (!a || !b) continue;
        pts.push(new THREE.Vector3(a.x, EDGE_Y, a.y), new THREE.Vector3(b.x, EDGE_Y, b.y));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.edgeLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL_EDGE, transparent: true, opacity: 0.35 }));
      this.edgeLines.renderOrder = 996;
      scene.add(this.edgeLines);
    }
  }

  private clear(scene: THREE.Scene): void {
    if (this.nodesMesh) { scene.remove(this.nodesMesh); this.nodesMesh.geometry.dispose(); (this.nodesMesh.material as THREE.Material).dispose(); this.nodesMesh = null; }
    if (this.edgeLines) { scene.remove(this.edgeLines); this.edgeLines.geometry.dispose(); (this.edgeLines.material as THREE.Material).dispose(); this.edgeLines = null; }
    for (const [, line] of this.paths) { scene.remove(line); line.geometry.dispose(); (line.material as THREE.Material).dispose(); }
    this.paths.clear();
    this.sig = '';
  }

  dispose(scene: THREE.Scene): void { this.clear(scene); }
}
