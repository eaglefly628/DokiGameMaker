// Tier 4 — 心智与黑盒 (Behaviors)
// 实体的"意图"层：AI 巡逻 / 追逐 / 状态决策等黑盒行为。详见 wiki/atom-skill-periodic-table.md「Tier 4」+「Macro 机制」。
//
// 刻意保持为空：按宣言 + 周期表，Tier4 行为是「用 Macro **组装**」——即 **数据装配**（蓝图里
// 把 aggro(感知→relation target) + steering(追/逃) + state(模式) + condition(转移) 拼成 ai-chase/ai-patrol），
// 而非常驻代码。D-001 的索敌/转向已拆成 tier3/aggro + tier2/steering 两个单一职责能力；AI 行为=数据。
export {};
