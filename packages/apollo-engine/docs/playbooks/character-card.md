# 平台角色卡桥手册（CharacterCard）

> 做 X：把**网页平台**的角色卡（`CharacterDraft`）接进游戏席位。REQ-CHARCARD·三游戏（a/b/c）共用。
> 机读真相：`src/services/character-card/`（`normalizeCharacterCard` / `toSeatCard` / `isCardUsable`）。
> 层级：services 基础设施（profile/voice 同层）·**不进 skills tier**——外部平台数据 ≠ sim capability。
> 红线：**纯确定性**（零网络/零时钟/零随机·同输入深等输出）；媒体/DataUrl **不入美术台账·不入 sim hash**；卡文本=外部**不可信**输入（展示层自行长度截断/转义）。

## ① 平台字段 → 规范卡映射

| 平台 CharacterDraft | 规范卡 ZeroCraftCharacterCard | 说明 |
|---|---|---|
| name | name（trim·空=error·不可用） | 显示名 |
| id | id（`opts.id > draft.id > name`） | 回退到 name 记 warn |
| gender/kind | gender?/kind? | 分类 |
| opening/description/cardDescription/personality/speakingStyle/boundaries/backstory/worldView/eraBackground/rules/coreConflicts/exampleDialogues/conversationStyle/replySettings | persona.* | 文本群·逐个 trim·空串弃 |
| catchphrases[]/tags[] | persona.catchphrases[]/tags[] | 滤空 + **按序去重（不排序·保作者序）** |
| adultConfirmed | adultConfirmed | 成年硬闸见 ③ |
| visibility/backgroundPublic/updatedAt | 同名（可选） | 原样携带 |
| （平铺媒体键）`{avatar,image,animation}{Url,DataUrl,OssKey}` + imageName/animationName | media.{avatarUrl,imageUrl,animationUrl,imageName,animationName} | 取优见 ②（**平台无 animationUrl·宽容读容忍**） |
| 其余（imageMode/format/moreSettings/未知字段） | passthrough | 原样保留·见 ④ |

> **媒体键=平台真格式的平铺键**（`avatarUrl/avatarDataUrl/avatarOssKey/imageUrl/…`·**无嵌套对象**）；桥只认平铺、不做双形读。

## ② 媒体取优（每槽独立）

每槽三键取优 **Url > DataUrl > OssKey**（如 avatar 槽=`avatarUrl > avatarDataUrl > avatarOssKey`；image/animation 同构）：
- 仅 `OssKey` → 需 `opts.resolveOssKey(key)=>url`；无解析器 / 解析空 / 解析器抛错 → 该源**弃 + warn**（field=真实键名如 `avatarOssKey`·绝不炸）。
- 三槽全空 → warn「零头像媒体」（游戏侧用占位头像降级）。

## ②b 类型不符 → passthrough + warn（Lead 裁决·不静默丢弃）

任何**已消费键**值类型不符预期（replySettings 为对象 / catchphrases 非数组 / name 为数字 / adultConfirmed 非布尔…）→ **原始值转存 passthrough + 记 warn**（保 SessionOut 回传完整性），该键在规范卡按缺失处理（name 另触发空 error）。

## ③ 成年硬闸（a/b/c 姨太题材必开）

`normalizeCharacterCard(input, { requireAdult: true })`：`adultConfirmed !== true` → **error**（`isCardUsable` 为 false）。
三游戏（掼蛋夜宴 / 雀宴 / 德州·姨太题材）接卡时**必须 `requireAdult:true`**——不得省。requireAdult 关时默认放行（信任边界上移调用方）。

## ④ passthrough 与 SessionOut id 对账

`passthrough` = 桥**不消费**的字段（imageMode/format/moreSettings/未知自留字段·如纹身图）+ 类型不符的已消费键（②b）原样保留。
纪律：终局回传 SessionOut 以 **`card.id`** 键控（顺位/点数/事件摘要 + passthrough 原样带回）；id 稳定性 = 唯一硬要求（无 id 回退 name 已记 warn，需上报风险）。

## ⑤ 三游戏消费样板

```ts
import { normalizeCharacterCard, toSeatCard, isCardUsable } from '../../services/character-card/index.js';
const res = normalizeCharacterCard(seatDraft, { requireAdult: true, resolveOssKey });
if (!isCardUsable(res)) { /* 拒入局 / 用内置默认卡 */ }
const seat = toSeatCard(res.card); // v1 {id,name,avatar}·既有席位 adapter 零改动
// 游戏侧附加数据（牌风/立绘档/语音包）不入共享卡——各游戏本地投影自持。
```

- `toSeatCard(card)` = v1 席位投影 `{id,name,avatar}`（avatar 取头像·退回主图）；游戏用它填 Text/Sprite/铭牌。
- **牌风/立绘/语音仍属游戏侧附加数据**·不进共享规范卡（消费方愿望单参考 `docs/design/game-b/character-card-format-needs.md`）。

## 查不到怎么办

缺字段/缺取优规则 → 提 `docs/workflow/requests.md`（REQ-CHARCARD 域）等 Lead 裁决，**绝不在游戏层手写解释器**。
