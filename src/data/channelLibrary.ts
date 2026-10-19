import { cleanUnreferenced } from "./channelSql";
import { RepositoryError, type SqlExecutor } from "./sql";

/**
 * 收藏和最近观看按逻辑频道（groupKey）保存，同一频道的其它来源可继续使用。
 * 每个函数都在调用方的独占事务中执行。
 */

export async function toggleFavorite(
  tx: SqlExecutor,
  channelId: string,
  now: number,
): Promise<boolean> {
  const channel = await tx.getFirstAsync<{
    id: string;
    groupKey: string;
  }>("SELECT id, groupKey FROM channels WHERE id = ?", [channelId]);
  if (!channel) throw new RepositoryError("channel_missing");
  const existing = await tx.getFirstAsync<{ groupKey: string }>(
    "SELECT groupKey FROM favorite_groups WHERE groupKey = ?",
    [channel.groupKey],
  );
  const favorite = !existing;
  if (favorite) {
    const active = await tx.getFirstAsync<{ id: string }>(
      `SELECT c.id FROM channels c JOIN sources s ON s.id = c.sourceId
       WHERE c.groupKey = ? AND c.active = 1 AND s.enabled = 1 LIMIT 1`,
      [channel.groupKey],
    );
    if (!active) throw new RepositoryError("channel_missing");
    await tx.runAsync(
      "INSERT INTO favorite_groups(groupKey,createdAt) VALUES(?,?)",
      [channel.groupKey, now],
    );
  } else
    await tx.runAsync("DELETE FROM favorite_groups WHERE groupKey = ?", [
      channel.groupKey,
    ]);
  await cleanUnreferenced(tx);
  return favorite;
}

/** 保留最近的 100 个逻辑频道。 */
export async function recordRecent(
  tx: SqlExecutor,
  channelId: string,
  now: number,
): Promise<void> {
  const channel = await tx.getFirstAsync<{
    id: string;
    groupKey: string;
  }>(
    `SELECT c.id, c.groupKey FROM channels c JOIN sources s ON s.id = c.sourceId
     WHERE c.id = ? AND c.active = 1 AND s.enabled = 1`,
    [channelId],
  );
  if (!channel) return;
  await tx.runAsync(
    `INSERT INTO recent_groups(groupKey,preferredChannelId,lastPlayedAt)
     VALUES(?,?,?) ON CONFLICT(groupKey) DO UPDATE SET
     preferredChannelId=excluded.preferredChannelId,
     lastPlayedAt=excluded.lastPlayedAt`,
    [channel.groupKey, channel.id, now],
  );
  await tx.runAsync(
    `DELETE FROM recent_groups WHERE groupKey NOT IN (
       SELECT groupKey FROM recent_groups
       ORDER BY lastPlayedAt DESC, groupKey LIMIT 100
     )`,
  );
  await cleanUnreferenced(tx);
}

export async function removeRecent(
  tx: SqlExecutor,
  channelId: string,
): Promise<void> {
  await tx.runAsync(
    `DELETE FROM recent_groups WHERE groupKey = (
       SELECT groupKey FROM channels WHERE id = ?
     )`,
    [channelId],
  );
  await cleanUnreferenced(tx);
}

export async function clearRecent(tx: SqlExecutor): Promise<void> {
  await tx.runAsync("DELETE FROM recent_groups");
  await cleanUnreferenced(tx);
}
