# Skills — 引擎能力分层

所有 skill 集中在此，按「元素周期表」分层（见 `wiki/atom-skill-periodic-table.md`）。

```
src/skills/
├── atoms/   核心原子 29 个（不可变基础真理；本身不算 tier；唯一真相=atoms/index.ts）
│            空间/运动/形状/碰撞/时间/数值/标识/控制/输入/状态/生命周期/感知/世界级
├── tier1/   直接结算 (Kinematic)        — accel-apply / motion-apply / lifetime /
│            （读组件→直接写组件，无跨实体）  rotation-apply / animation / hierarchy-resolve
├── tier2/   规则与约束 (Resolution)      — collision-resolve / ground-sense / jump /
│            （消费"一份事实"产出事件/修正） bounds-clamp / trigger-zone / friction
├── tier3/   系统级玩法 (Mechanics)       — 跨实体复合机制（多个 Tier 2 串联）。待 request 拉动。
└── tier4/   心智与黑盒 (Behaviors)       — AI / 意图，用 Macro 组装。待 request 拉动。
```

## 路径别名

- `@atom-skills/*` → `src/skills/atoms/*`（历史别名，保留）
- `@skills/*` → `src/skills/*`（如 `@skills/tier2/index.js`）

## 分层判据

- **原子**：能用其他原子组合描述的，就不是原子；每个原子只回答一个问题。
- **Tier 升级方向 = 数据流复杂度**：直接结算 → 约束/感知 → 跨实体机制 → 黑盒行为。
- 新 skill 落在哪层，由"它消费什么、产出什么、是否跨实体"决定，不由游戏决定。

> 资产（贴图/立绘/UI 美术）**不是 skill**，是表现层，放 `src/assets/`，活在确定性 sim 之外。
