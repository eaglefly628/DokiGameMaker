// 本地排行榜的那点纯算术（插入 + 排序 + 名次 + 截断）——REQ-SHELL-公共壳三件 ③附件。
// 收编 game-103/leaderboard.ts:17-22 `recordScore` 的通用形；持久化不在这里——用 `localStore`
// 存那个数组即可（load → insertRanked → save 三行，见下例）。纯函数·确定性·零 IO。

/**
 * 把本局成绩并入旧榜：排序（调用方给比较器）→ 截前 `max` 条 → 返回新榜 + 本局名次（1 基·0=没进榜）。
 * 名次靠**引用识别**本局那条，故 `entry` 请传对象（成绩条目天然是对象）；不改入参。
 *
 * ```ts
 * const board = localStore<ScoreEntry[]>('game103-leaderboard-v1', () => []);
 * const { board: next, rank } = insertRanked(entry, board.get(), (a, b) => b.score - a.score || b.at - a.at, 10);
 * board.set(next);
 * ```
 */
export function insertRanked<T extends object>(
  entry: T,
  prev: readonly T[],
  compare: (a: T, b: T) => number,
  max: number,
): { board: T[]; rank: number } {
  const board = [...prev, entry].sort(compare).slice(0, Math.max(0, max));
  const i = board.indexOf(entry);
  return { board, rank: i >= 0 ? i + 1 : 0 };
}
