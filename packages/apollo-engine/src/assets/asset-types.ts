// 资产(美术)类型层 —— 表现层概念，不是 skill、不进确定性 sim。
//
// 设计铁律：sim 侧只持有 `textureKey`(字符串，可哈希、可回滚)；真实像素/模型只在
// 此资产层。AssetManager 永远不碰 world / snapshot，所以像素层怎么变都不威胁 lockstep。
//
// 「门留宽」的关键 = 描述符显式分 kind + 句柄不透明：
//   一个 textureKey 解析成什么，由资产层说了算 —— 平面贴图、图集、序列帧，
//   乃至「3D 模型离线预渲染出的 2D 序列」(prerendered-sequence)，都只是一种 kind。
//   未来真要 3D→2D，只是多一个 kind / 换一个 loader，sim 与其它 kind 都不动。

/** 图像内的一块矩形(像素坐标)。atlas 的命名帧用它。 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 单张贴图：整图即一帧。最基础的 2D 资产。 */
export interface TextureDescriptor {
  readonly kind: 'texture';
  readonly key: string;
  readonly src: string;
  /** 可选：声明内在尺寸，便于无真实 I/O(headless/测试)时也能解析整图帧。 */
  readonly width?: number;
  readonly height?: number;
  /**
   * 色彩空间（REQ-Resource ③）：'srgb'（颜色/反照率贴图）| 'linear'（法线/粗糙/AO 等数据贴图）。
   * 由索引 `spec.usage/colorSpace` 派生（见 asset-index.deriveColorSpace）。渲染线据此设 three 色彩空间——
   * PBR 材质贴图消费端（three-renderer.pbrMapTexture）用它**覆盖槽位默认**，防「法线图误设 sRGB」偏色。
   * 2D 精灵路径忽略（恒 sRGB）。缺省视为 sRGB（向后兼容）。
   */
  readonly colorSpace?: 'srgb' | 'linear';
}

/** 图集：一张图 + 命名子矩形。Game B 的表情差分(neutral/smile/angry/...)即一张图多帧。 */
export interface AtlasDescriptor {
  readonly kind: 'atlas';
  readonly key: string;
  readonly src: string;
  /** 帧名 → 子矩形。frame 传帧名解析。 */
  readonly frames: Readonly<Record<string, Rect>>;
}

/** 精灵表：等分网格切片。frame 传索引(0-based)，按 columns 折行。 */
export interface SpriteSheetDescriptor {
  readonly kind: 'sprite-sheet';
  readonly key: string;
  readonly src: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly count: number;
}

/**
 * 3D→2D 离线序列(一等公民，但不接 3D 工具链)：
 * 由 3D 模型预渲染出的有序 2D 帧(可表角度转盘或动画)。布局同精灵表(网格)。
 * `source3d` 仅作元数据留痕，资产层照样只当一张 2D 图集切片用 —— 这就是 3D→2D 的门。
 */
export interface PrerenderedSequenceDescriptor {
  readonly kind: 'prerendered-sequence';
  readonly key: string;
  readonly src: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly count: number;
  /** 可选来源元数据：从哪个 3D 模型、哪种轴(如 8 向角度 / 动画帧)预渲染来的。 */
  readonly source3d?: {
    readonly model?: string;
    readonly axis?: 'angles' | 'animation';
    readonly angles?: number;
  };
}

/**
 * 3D 模型（glTF/glb · 一等公民「又一种 kind」）：
 * 资产层只管「key → 取模型字节(ArrayBuffer)」，**零 three 依赖**——真正的 glTF 解析（→ three 场景图）
 * 在渲染线（ThreeRenderer）做，three 不泄进资产层。同 sprite 先例：sim/蓝图只持 key（可哈希、可回滚），
 * 真实模型只在此资产层。句柄形态 = `ArrayBuffer`（原始字节）。width/height 对模型无意义（取 0）。
 */
export interface ModelDescriptor {
  readonly kind: 'model';
  readonly key: string;
  readonly src: string; // 模型文件地址（相对 baseUrl）或 data: URI
}

export type AssetDescriptor =
  | TextureDescriptor
  | AtlasDescriptor
  | SpriteSheetDescriptor
  | PrerenderedSequenceDescriptor
  | ModelDescriptor;

/** 数据驱动清单：一组描述符。可由 JSON 提供。 */
export type AssetManifest = readonly AssetDescriptor[];

/**
 * 命名动画剪辑（R9 增益 B）—— 把"一组**有序的图集命名帧**"当作一个可按 index 播放的资产。
 * 自身**无图**：`frames` 是底层 `atlas` 里已命名帧的有序名字；`resolve(key, index)` 委托该 atlas 取帧矩形。
 * 解决 `Frame.index(0..n)` → **非连续命名帧**（hero_attack_A/B/C，可乱序/跳取）的映射，ECS/Frame 组件不变。
 * 不进 AssetDescriptor 联合体（它无物理图、无需加载），由 AssetManager 单独注册表持有。
 */
export interface AnimationDescriptor {
  readonly key: string;
  readonly atlas: string; // 底层 atlas 的 key（帧矩形的真正来源）
  readonly frames: readonly string[]; // 有序帧名（atlas.frames 里的名字）
}

/**
 * 不透明资产句柄 —— 引擎不关心其具体形态。
 * 2D loader 产出可绘制图像(ImageBitmap / HTMLImageElement)；测试 stub 产出假句柄；
 * 未来 3D 后端可产出自己的句柄类型。这层不透明正是「换后端不动上层」的保证。
 */
export type AssetHandle = unknown;

/** 已加载资产：句柄 + 内在像素尺寸(供整图帧 / 渲染缩放用)。 */
export interface LoadedAsset {
  readonly descriptor: AssetDescriptor;
  readonly handle: AssetHandle;
  readonly width: number;
  readonly height: number;
}

/** 解析出的一帧：已加载资产 + 在源图中的子矩形。渲染后端据此 drawImage。 */
export interface ResolvedFrame {
  readonly asset: LoadedAsset;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/** 帧选择子：图集传帧名(string)，序列/精灵表传索引(number)，整图贴图忽略。 */
export type FrameRef = string | number;

/**
 * 可插拔加载器 —— 把 I/O 与缓存/解析解耦。
 * 浏览器用 ImageAssetLoader(真实图片)；headless/sim/测试用 StubAssetLoader(无 I/O)。
 */
export interface AssetLoader {
  load(descriptor: AssetDescriptor): Promise<{
    handle: AssetHandle;
    width: number;
    height: number;
  }>;
}
