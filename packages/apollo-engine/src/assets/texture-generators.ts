// ═══════════════════════════════════════════════════════════════
//  贴图生成器注册表（REQ-VECTOR-ART 步3·Lead 2026-07-13 契约定形）
//
//  owner 洞见：美术资源=统一间接层——索引条目 resolve 出来的可以是 raster 文件，也可以是
//  程序矢量/参数化生成器；对消费方（渲染器/皮肤槽/台账/打包）**两者一回事**。
//  契约（裁决=texture + spec.generator·不加新 AssetType）：
//    · 索引条目 `type:'texture'` + `spec.generator = { name, params? }`（带 generator 免 path）
//    · 生成器=**确定性纯函数** params → data-URI（禁随机/时钟/IO——同 params 永远同输出，
//      录放/lockstep/打包缓存都靠这条）
//    · 热替换=同一 id 的条目在 path(raster) ↔ spec.generator(矢量) 间只改索引数据，调用点零改
//  登记纪律：引擎通用花纹在共享处登记；game 专属生成器（如 game-g 钱币纹/立绘）在 game 模块
//  import 期 registerTextureGenerator——先登记后 registerAssetIndex（未登记名=注册期明报早失败）。
// ═══════════════════════════════════════════════════════════════

/** 生成器参数：纯数据（弱 LLM 可填·可进索引 JSON）。 */
export type TextureGeneratorParams = Readonly<Record<string, number | string | boolean>>;

/** 生成器：确定性纯函数 params → data-URI（'data:image/…'）。 */
export type TextureGeneratorFn = (params: TextureGeneratorParams) => string;

/** 索引条目里的 spec.generator 形状。 */
export interface GeneratorSpec {
  readonly name: string;
  readonly params?: TextureGeneratorParams;
}

const REGISTRY = new Map<string, TextureGeneratorFn>();

/** 登记生成器（重名即抛——同 capability registry 纪律：静默覆盖=悄悄换图·极难查）。 */
export function registerTextureGenerator(name: string, fn: TextureGeneratorFn): void {
  if (!name || typeof name !== 'string') throw new Error('texture-generator: 名字必须是非空字符串');
  if (REGISTRY.has(name)) throw new Error(`texture-generator: 重名登记 "${name}"（改名或删其一）`);
  REGISTRY.set(name, fn);
}

export function hasTextureGenerator(name: string): boolean {
  return REGISTRY.has(name);
}

export function listTextureGenerators(): string[] {
  return [...REGISTRY.keys()].sort();
}

/** 仅测试用：卸载一个登记（生产路径永不调用——热替换走索引数据，不走注册表翻新）。 */
export function unregisterTextureGeneratorForTest(name: string): void {
  REGISTRY.delete(name);
}

/** spec 里抽出合法 generator 形状；无/形状坏 → null（形状校验的硬错在 asset-index parse 期做）。 */
export function generatorSpecOf(spec: Readonly<Record<string, unknown>> | undefined): GeneratorSpec | null {
  const g = spec?.generator;
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  const name = (g as Record<string, unknown>).name;
  if (typeof name !== 'string' || !name) return null;
  const params = (g as Record<string, unknown>).params;
  if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) return null;
  return { name, params: params as TextureGeneratorParams | undefined };
}

/** generator 条目 → src（data-URI）。未登记/产出不是 data-URI → 明报抛错（早失败·不静默占位）。 */
export function resolveGeneratedSrc(gen: GeneratorSpec): string {
  const fn = REGISTRY.get(gen.name);
  if (!fn) {
    throw new Error(
      `texture-generator: 未登记的生成器 "${gen.name}"（已登记：${listTextureGenerators().join(', ') || '（无）'}）——` +
      '先 registerTextureGenerator 再 registerAssetIndex',
    );
  }
  const src = fn(gen.params ?? {});
  if (typeof src !== 'string' || !src.startsWith('data:')) {
    throw new Error(`texture-generator: "${gen.name}" 产出必须是 data-URI（收到 ${String(src).slice(0, 40)}…）`);
  }
  return src;
}
