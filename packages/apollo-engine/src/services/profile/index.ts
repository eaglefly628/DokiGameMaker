// 玩家档案服务（REQ-C-104·三游戏共享角色卡 v1·只读通道）。
// 消费：游戏装配层 `getPlayerProfile()` 读一次成蓝图数据；写入在 launcher（PST 域·localStorage 同键）。
export { getPlayerProfile, normalizePlayerProfile, PLAYER_PROFILE_KEY } from './profile-port.js';
export type { PlayerProfile } from './profile-port.js';
