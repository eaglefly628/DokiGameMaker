// Protocol · 时空 / 物理 / 几何 / 碰撞检测 / 世界服务 ─────────────────────────────
// 实体在世界里"在哪、多大、怎么动、碰没碰、占没占区"的物理基底；以及挂在 world 实体上的
// 随机数与空间索引服务。被 motion/collision/spatial-query/trigger-zone/tilemap 等读写。
import type { Component, EntityId } from '../../core/types.js';

// ── A1 transform ── 实体在世界的位置、朝向和大小
export interface Transform extends Component {
  readonly type: 'Transform';
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

// ── B1 velocity ── 实体当前的运动方向、速度和角速度
export interface Velocity extends Component {
  readonly type: 'Velocity';
  vx: number;
  vy: number;
  angular: number;
}

// ── B2 acceleration ── 实体的速度在怎么变
export interface Acceleration extends Component {
  readonly type: 'Acceleration';
  ax: number;
  ay: number;
}

// ── B3 mass ── 实体有多重（0 = 不可移动）
export interface Mass extends Component {
  readonly type: 'Mass';
  value: number;
}

// ── C1 shape ── 碰撞/占位几何形状
export interface Shape extends Component {
  readonly type: 'Shape';
  kind: 'box' | 'circle' | 'polygon';
  width?: number;
  height?: number;
  radius?: number;
  // polygon: 局部空间凸多边形顶点，扁平存 [x0,y0,x1,y1,...]（不含旋转，旋转留待刚体阶段）。
  vertices?: number[];
  // ── REQ-OVERLAP-LAYER：碰撞分层宽相位过滤（Box2D 双向语义位掩码）。缺省 = 全 1（属于/愿碰所有层），
  // 两边都不设 → 与旧行为逐字节一致（零回归）。语义见 overlap-detect 的过滤实现。
  category?: number; // 本碰撞体所属层位掩码
  mask?: number; // 本碰撞体愿与哪些层碰的位掩码
}

// ── bounds-clamp ── 实体允许活动的世界矩形（含边界）。bounds-clamp 据此把 AABB 钳进去。
export interface Bounds extends Component {
  readonly type: 'Bounds';
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ── A2 hierarchy ── 实体挂在谁下面、本地偏移多少
export interface Hierarchy extends Component {
  readonly type: 'Hierarchy';
  parentId: EntityId;
  localX: number;
  localY: number;
  localRotation: number;
  localScaleX: number;
  localScaleY: number;
}

// ── W1 random ── 可控随机数（确定性重放基石），挂在 world 实体
export interface RandomSeed extends Component {
  readonly type: 'RandomSeed';
  seed: number;
  sequence: number;
}

// ── D1 overlap-detect ── 哪两个实体重叠了，法线与穿透深度
export interface Overlap extends Component {
  readonly type: 'Overlap';
  entityA: EntityId;
  entityB: EntityId;
  normalX: number;
  normalY: number;
  depth: number;
}

// ── Collider3D（REQ-3D-Collision · P1）── 3D 逻辑碰撞体（**确定性 sim·进 hash**·非 render-only）。
// 位置：planar 取同实体 2D `Transform`(x→X、y→Z 地面)；垂直/形状全在本组件（baseY/height/radius·进 hash·
// 不依赖 render-only 的 Transform3D）。胶囊限定竖直(Y 轴·角色标准)。trigger=只产重叠事件不推开（触发区/感知）。
export interface Collider3D extends Component {
  readonly type: 'Collider3D';
  kind: 'sphere' | 'box' | 'capsule' | 'hull';
  radius?: number; // sphere / capsule
  halfX?: number; // box 半尺寸
  halfY?: number;
  halfZ?: number;
  height?: number; // capsule 总高（含两端半球·缺省 2*radius）
  // hull（REQ-3D-Collision · P2）：凸多面体 = **预烘焙局部顶点 + 面法线轴**（同 2D `polygon` 套路·
  // 顶点已按需朝向写死成数据·运行时只平移不旋转 → 无 sin/cos·跨机确定）。表达「转过的盒子/斜坡/斜墙」。
  verts?: readonly number[]; // 扁平局部顶点 [x0,y0,z0, x1,y1,z1, …]（绕碰撞体原点·原点= Transform+baseY）
  axes?: readonly number[]; // 扁平**单位**面法线候选分离轴 [nx,ny,nz, …]（盒/OBB=3 轴；运行时再补边叉积轴）
  baseY?: number; // 碰撞体下沿离地高度（缺省 0=坐地）
  offsetX?: number; // planar 相对 Transform 的偏移
  offsetZ?: number;
  trigger?: boolean; // true=触发区（只产 Overlap3D 事件·不参与推开）
}

// ── Overlap3D（REQ-3D-Collision）── 一对重叠的 3D 碰撞体（法线 A→B + 穿透深度）。每帧重算（同 2D Overlap 先例）。
export interface Overlap3D extends Component {
  readonly type: 'Overlap3D';
  entityA: EntityId;
  entityB: EntityId;
  normalX: number;
  normalY: number;
  normalZ: number;
  depth: number;
}

// ── NavMesh（REQ-3D-Nav · owner 2026-06-28 授权 P3D 跨界落·「自动摆放」）── 导航网格**自动烘焙**配置（单例）。
// 摆这个（而非手摆 NavGraph）→ navmesh-bake 能力把范围内 `Collider3D` 障碍栅格化、把可行走格自动织成
// **主程的 `NavGraph`** 喂 `pathfind`。手摆 NavGraph 与自动烘焙**共存**：作者二选一。确定性·NavGraph 进 hash。
// 平面：X=Transform.x、Z=Transform.y（盒庭地面）。作者只填「范围矩形 + 格边长 + 智能体半径」——可走拓扑自动推导。
export interface NavMesh extends Component {
  readonly type: 'NavMesh';
  minX: number; // 烘焙范围（世界 XZ 矩形）
  minZ: number;
  maxX: number;
  maxZ: number;
  cellSize: number; // 栅格边长（越小越精细越慢）
  agentRadius?: number; // 障碍按此膨胀（Minkowski·把智能体当点·缺省 0）
}

// ── ground-sense ── 实体这帧是否站在地面上（marker，存在即着地，每帧由 ground-sense 重算）
export interface Grounded extends Component {
  readonly type: 'Grounded';
}

// ── sensor ── 非实心碰撞体标记（REQ-002）。挂了它的实体仍参与 overlap-detect/trigger-zone（感知），
// 但 collision-resolve **跳过**含它的接触对（不做物理推开）。开关/压力板/触发区 = Sensor，玩家能站进去。
export interface Sensor extends Component {
  readonly type: 'Sensor';
}

// ── trigger-zone ── 触发事件：实体 other 进入了触发区 zone（每帧重算，read-then-consume 或每帧清重标）。
export interface Trigger extends Component {
  readonly type: 'Trigger';
  zone: EntityId;
  other: EntityId;
}

// ── zone-occupancy ── 声明式区域占据目标：区内匹配目标达数量阈值 → 置 outFlag（REQ-006，下沉 coop-goal）。
// 把「胜负/通关/到达/区域占据/收集齐」表达成纯数据，不写游戏专属系统。判实体中心点是否落入世界矩形。
export interface Zone extends Component {
  readonly type: 'Zone';
  outFlag: string; // 满足时置 true、否则 false 的 Flag id（按 id 全局定位）
  minX: number;
  minY: number;
  maxX: number;
  maxY: number; // 世界矩形（含边界）
  requiredTag?: number; // 选择器A：只数 Tag.flags 含此位的实体（位与非零即匹配）
  requiredEntities?: EntityId[]; // 选择器B：指定实体名单（与 requiredTag 二选一；都缺=所有带 Transform 的实体）
  count?: number; // 数量阈值。Tag/全体模式缺省=1；entities 模式缺省=名单长度（全部在内）
}

// ── W2 spatial-query ── 空间查询服务配置，挂在 world 实体
export interface SpatialIndex extends Component {
  readonly type: 'SpatialIndex';
  cellSize: number;
  kind: 'grid' | 'quadtree';
}

// ── tilemap ── 瓦片地图（地图=数据：二维数组 + tileset assetKey；引擎=瓦片碰撞 + 渲染两台通用解释器）。
// 瓦片不是实体、不进 tick；只在碰撞时被查询、被渲染器画。一个 collides 层里**非零**瓦片=实心(mass0 静态体)，
// 0=空/可通行。多层分工：floor(不挡)/walls(挡)/decoration(不挡)。瓦片在世界里的位置：左上角 (originX,originY)，
// 瓦片 (c,r) 覆盖世界 [originX+c*tileSize, +tileSize) × [originY+r*tileSize, +tileSize)。
// 这是 Hades 式拼接的"房间"积木：一份 Tilemap = 一个房间；dungeon 能力(后)按种子拼多份。
export interface TileLayer {
  name: string; // 'floor' | 'walls' | 'decoration' | …
  data: number[]; // 长 cols*rows，row-major，0=空，>0=tileId（tileset 里第几格，1-based）
  collides: boolean; // 该层非零瓦片是否实心（参与瓦片碰撞）
  tileset: string; // 图块集 assetKey（R9；渲染器据 tileId 算源矩形）
}
export interface Tilemap extends Component {
  readonly type: 'Tilemap';
  cols: number; // 横向格数
  rows: number; // 纵向格数
  tileSize: number; // 每格像素
  originX: number; // 瓦片 (0,0) 左上角的世界 x（房间可放任意位置 → Hades 拼接）
  originY: number;
  layers: TileLayer[];
}

// ── pathfind（REQ-寻路·确定性 sim·进 hash）── 连续自由空间寻路：航点图 NavGraph（摆放数据）+ A*（引擎）+ 沿路跟随。
// 与 grid-move（六格离散）对偶：此为**连续坐标自由空间**（2D 现用·维度无关·将来升 3D 加 z 即可）。
// 「航点图 = 摆放并行数据，寻路算法 = 引擎确定性解释器」（宪法对齐·同 hex「站位=数据/A*=代码」）。
// 静态可走性 = 作者只在可走处连边（或对接 tilemap 实心瓦片）；动态避让 = 既有 collision-resolve 在 nav 定速后
// 推开（**正交**·nav 写 Velocity → motion-apply 积分 → overlap/collision-resolve 分离·零新碰撞代码·复用）。
export interface NavGraph extends Component {
  readonly type: 'NavGraph';
  nodes: Array<{ x: number; y: number }>;                 // 航点世界坐标（下标即节点 id）。摆放数据·最弱 LLM 也能填。
  edges: Array<{ a: number; b: number; cost?: number }>;  // 连边（节点下标·无向）；cost 缺省 = 两端 Euclidean 距离。
}

// ── NavAgent ── 沿 NavGraph 走向 Relation(target) 的移动意图（写 Velocity·被 motion-apply 积分·受碰撞介入）。
// 复用 aggro 写的 Relation(target)（同 steering/grid-move 索敌接缝·零新目标概念）。无目标/被 CC → 停。
export interface NavAgent extends Component {
  readonly type: 'NavAgent';
  speed: number;            // 移动速度（写入 Velocity 模长·单位/tick）
  arriveRange: number;      // 到终点此距离内即停
  waypointRange?: number;   // 到当前航点此距离内即推进下一航点（缺省 = max(speed, arriveRange)·防抖/防一拍一停）
  repathPeriod?: number;    // 每多少 tick 强制重算路径（缺省 30）；目标显著移动（> arriveRange）也会触发重算
  haltStatusMask?: number;  // 自身 Status 含这些位时停（冻结/眩晕 CC·同 Steering/GridMover.haltStatusMask）
}

// ── NavPath ── 引擎写的缓存路径（确定性派生·进 hash）。via=待经节点下标序；gx/gy=规划所据目标点；age=自上次重算 tick。
export interface NavPath extends Component {
  readonly type: 'NavPath';
  via: number[];   // 剩余待经航点（节点下标·按序·整数进 hash）
  gx: number;      // 规划时的目标点 x（检测目标移动 → 触发重算）
  gy: number;      // 规划时的目标点 y
  age: number;     // 自上次重算的 tick 数（配 repathPeriod）
}
