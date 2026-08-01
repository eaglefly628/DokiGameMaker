// 成就目录 = 一份**数据**（每游戏一组）。成就 = id + 展示名 + 描述；游戏在结果点用现成
// PlatformPort.unlockAchievement(id) 解锁，假 Steam / 真 Steam 同一路径。先给旗舰 game-g
// 起步目录 + 各游戏一枚「首次启动」（cartridge 启动即可见整链路）。后续成就继续往这里加数据。

export interface AchievementDef {
  id: string;     // 平台成就 API id（真 Steam 后台需登记同名）
  name: string;   // 展示名
  desc: string;   // 描述
}

export const ACHIEVEMENTS: Readonly<Record<string, readonly AchievementDef[]>> = {
  'game-g': [
    { id: 'GG_FIRST_BOOT', name: '初入命局', desc: '首次启动《翻命扑克》。' },
    { id: 'GG_FIRST_WIN',  name: '一战翻命', desc: '赢得第一场战役对决。' },
    { id: 'GG_FLAWLESS',   name: '不翻就赢', desc: '无伤通过一关。' },
  ],
  'game-e': [
    { id: 'GE_FIRST_BOOT', name: '入场', desc: '首次启动《小丑牌》。' },
    { id: 'GE_FIRST_WIN',  name: '首胜',  desc: '赢得第一局。' },
  ],
  'game-f': [
    { id: 'GF_FIRST_BOOT', name: '入主', desc: '首次启动《像素三分天下》。' },
  ],
};

/** 某游戏的「首次启动」成就 id（无目录则 undefined）。 */
export function firstBootAchievement(gameId: string): string | undefined {
  return ACHIEVEMENTS[gameId]?.find((a) => a.id.endsWith('_FIRST_BOOT'))?.id;
}
