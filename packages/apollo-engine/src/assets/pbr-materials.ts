// ═══════════════════════════════════════════════════════════════
//  PBR 材质库（美术库·TA Phase 5）—— **封闭的常见物理材质预设集**。
//  数据驱动：物件挂 `Material3D { preset, 覆盖参数 }` 选一种 + 调参，**不写自由材质**（弱 LLM 也只在闭集里选+调）。
//  渲染器据预设建 three 物理材质（MeshStandard / 玻璃走 MeshPhysical transmission）。render-only·不进 hash。
//
//  数值来源：金属 base color 取 **Google Filament「Materials guide」实测 sRGB 金属表**（业界标准 PBR 参考·
//  现代引擎/Substance 同源）——金 (1.00,0.85,0.57)=0xFFD991、铜 (0.97,0.74,0.62)=0xF7BD9E、铁 (0.77,0.78,0.78)=0xC4C7C7、
//  银 (0.97,0.96,0.91)、铝 (0.91,0.92,0.92)。介电 albedo 取常见实测反照率（木/石/土）。roughness 按抛光度常识取。
//  约定：金属 metalness=1·color=反照率(=反射 F0)；介电 metalness=0·color=漫反射；玻璃走 transmission。
//  后续可换贴图（normal/roughness/metallic map）精修。来源：https://google.github.io/filament/Materials.md.html
// ═══════════════════════════════════════════════════════════════

export interface PbrMaterialDef {
  color: number; // 0xRRGGBB（金属=反照率·介电=漫反射）
  roughness: number; // 0..1（粗糙度·越大越哑）
  metalness: number; // 0..1（金属度）
  emissive?: number; // 自发光色 0xRRGGBB
  emissiveIntensity?: number;
  transmission?: number; // 透射(玻璃) 0..1 → 渲染器改用 MeshPhysicalMaterial
  ior?: number; // 折射率（玻璃 ~1.5）
  opacity?: number; // 透明度（玻璃 <1）
  transparent?: boolean;
}

// 闭集预设（owner「不用太多·几种就够」：金属/玻璃/土/钢/岩石… + 默认哑光）。金属 base color=Filament 实测 sRGB 表。
export const PBR_MATERIALS = {
  matte: { color: 0xffffff, roughness: 0.85, metalness: 0 }, // 哑光（默认·陶土/塑料感·色常由物件给）
  plastic: { color: 0xffffff, roughness: 0.35, metalness: 0 }, // 光面塑料（介电·F0 默认 0.04）
  steel: { color: 0xc4c7c7, roughness: 0.28, metalness: 1 }, // 钢（=Filament 铁色·抛光低粗糙）
  iron: { color: 0x9a9da0, roughness: 0.58, metalness: 1 }, // 铁（铸铁·暗一档·粗糙）
  gold: { color: 0xffd991, roughness: 0.26, metalness: 1 }, // 金（Filament sRGB 1.00,0.85,0.57）
  copper: { color: 0xf7bd9e, roughness: 0.3, metalness: 1 }, // 铜（Filament sRGB 0.97,0.74,0.62）
  glass: { color: 0xeaf6ff, roughness: 0.05, metalness: 0, transmission: 0.92, ior: 1.5, opacity: 0.5, transparent: true }, // 玻璃
  rock: { color: 0x7c7a77, roughness: 0.85, metalness: 0 }, // 岩石（花岗岩/混凝土 albedo ~0.5）
  dirt: { color: 0x6b4f37, roughness: 0.95, metalness: 0 }, // 土（干土壤 albedo）
  wood: { color: 0x8a5a30, roughness: 0.6, metalness: 0 }, // 木（橡木 albedo）
  emissive: { color: 0x222222, roughness: 0.5, metalness: 0, emissive: 0xfff0a0, emissiveIntensity: 1.6 }, // 自发光
} as const satisfies Record<string, PbrMaterialDef>;

export type PbrPreset = keyof typeof PBR_MATERIALS;

// 覆盖参数（Material3D 给）：在预设基础上微调。
export interface PbrOverrides {
  color?: number; roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number;
}

// 解析：预设 + 覆盖 → 最终材质数据。未知预设回退 matte（健壮·弱 LLM 拼错不崩）。
export function resolvePbr(preset: string, ov?: PbrOverrides): PbrMaterialDef {
  const base = (PBR_MATERIALS as Record<string, PbrMaterialDef>)[preset] ?? PBR_MATERIALS.matte;
  if (!ov) return base;
  return {
    ...base,
    ...(ov.color !== undefined ? { color: ov.color } : {}),
    ...(ov.roughness !== undefined ? { roughness: ov.roughness } : {}),
    ...(ov.metalness !== undefined ? { metalness: ov.metalness } : {}),
    ...(ov.emissive !== undefined ? { emissive: ov.emissive } : {}),
    ...(ov.emissiveIntensity !== undefined ? { emissiveIntensity: ov.emissiveIntensity } : {}),
  };
}
