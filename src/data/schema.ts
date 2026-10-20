import { normalizeGroups } from "../domain/channelLabels";
import { countryFromIptvOrgId } from "../domain/channelFacets";
import {
  channelGroupKey,
  qualityFromIptvOrgId,
} from "../domain/channelSources";
import { RepositoryError, type SqlExecutor } from "./sql";
import { synchronizeChecks } from "./availability";

export const SCHEMA_VERSION = 9;

/**
 * 在调用方的独占事务中，将任意较旧 user_version 的数据库升级至
 * SCHEMA_VERSION；拒绝打开版本更高的数据库。
 */
export async function migrateSchema(tx: SqlExecutor): Promise<void> {
  const version = await tx.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const current = version?.user_version ?? 0;
  if (current > SCHEMA_VERSION) throw new RepositoryError("newer_schema");
  if (current === SCHEMA_VERSION) return;
  if (current < 1) await createV1(tx);
  if (current < 2) await migrateV2(tx);
  if (current < 3) await migrateV3(tx);
  if (current < 4) await migrateV4(tx);
  if (current < 5) await migrateV5(tx);
  if (current < 6) await migrateV6(tx);
  if (current < 7) await migrateV7(tx);
  if (current < 8) {
    await tx.execAsync(
      "CREATE INDEX IF NOT EXISTS channels_stream_check ON channels(streamUrl, checkedAt DESC);",
    );
    await synchronizeChecks(tx);
  }
  if (current < 9) await migrateV9(tx);
  await tx.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/** v9：针对节目单和 iptv-org 查询均未标注语言的频道，新增两类语言来源：可用性检测从流媒体主清单读取并按地址记录的音轨语言，以及用户为整个来源或来源内某个分组手动指定的语言。绝不推断；删除来源时一并删除这些选择。 */
async function migrateV9(tx: SqlExecutor): Promise<void> {
  const channelColumns = new Set(
    (await tx.getAllAsync<{ name: string }>("PRAGMA table_info(channels)")).map(
      (column) => column.name,
    ),
  );
  if (!channelColumns.has("streamLanguages"))
    await tx.execAsync(
      "ALTER TABLE channels ADD COLUMN streamLanguages TEXT NOT NULL DEFAULT '';",
    );
  const columns = new Set(
    (await tx.getAllAsync<{ name: string }>("PRAGMA table_info(sources)")).map(
      (column) => column.name,
    ),
  );
  if (!columns.has("defaultLanguage"))
    await tx.execAsync(
      "ALTER TABLE sources ADD COLUMN defaultLanguage TEXT NOT NULL DEFAULT '';",
    );
  await tx.execAsync(`
    CREATE TABLE IF NOT EXISTS source_group_languages (
      sourceId TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      groupName TEXT NOT NULL, language TEXT NOT NULL,
      PRIMARY KEY (sourceId, groupName)
    );
  `);
}

/** v7：来源可以隐藏，而不删除其频道和用户数据。 */
async function migrateV7(tx: SqlExecutor): Promise<void> {
  const columns = new Set(
    (await tx.getAllAsync<{ name: string }>("PRAGMA table_info(sources)")).map(
      (column) => column.name,
    ),
  );
  if (!columns.has("enabled"))
    await tx.execAsync(
      "ALTER TABLE sources ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1));",
    );
}

async function createV1(tx: SqlExecutor): Promise<void> {
  await tx.execAsync(`
        CREATE TABLE sources (
          id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('url','file')),
          location TEXT NOT NULL, content TEXT, createdAt INTEGER NOT NULL, lastSuccessAt INTEGER NOT NULL,
          lastErrorCategory TEXT, revision INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE channels (
          id TEXT PRIMARY KEY NOT NULL, sourceId TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          identityKey TEXT NOT NULL, name TEXT NOT NULL, groupName TEXT NOT NULL, tvgId TEXT, logoUrl TEXT,
          streamUrl TEXT NOT NULL, sortIndex INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
          lastSeenRevision INTEGER NOT NULL, UNIQUE(sourceId, identityKey)
        );
        CREATE INDEX channels_source ON channels(sourceId, active, sortIndex);
        CREATE INDEX channels_name ON channels(name COLLATE NOCASE);
        CREATE TABLE favorites (channelId TEXT PRIMARY KEY NOT NULL REFERENCES channels(id) ON DELETE CASCADE, createdAt INTEGER NOT NULL);
        CREATE TABLE recents (channelId TEXT PRIMARY KEY NOT NULL REFERENCES channels(id) ON DELETE CASCADE, lastPlayedAt INTEGER NOT NULL);
        CREATE INDEX recents_time ON recents(lastPlayedAt DESC);
        CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      `);
}

/** v2：增加手动可用性检测字段；分组先翻译，再按 ";" 拆分。 */
async function migrateV2(tx: SqlExecutor): Promise<void> {
  await tx.execAsync(`
    ALTER TABLE channels ADD COLUMN checkStatus TEXT CHECK(checkStatus IN ('ok','unreachable'));
    ALTER TABLE channels ADD COLUMN checkedAt INTEGER;
  `);
  const groups = await tx.getAllAsync<{ groupName: string }>(
    "SELECT DISTINCT groupName FROM channels",
  );
  for (const { groupName } of groups) {
    const normalized = normalizeGroups(groupName);
    if (normalized !== groupName)
      await tx.runAsync(
        "UPDATE channels SET groupName = ? WHERE groupName = ?",
        [normalized, groupName],
      );
  }
}

/** 元数据只在显式导入或刷新时填充，绝不猜测。 */
async function migrateV3(tx: SqlExecutor): Promise<void> {
  await tx.execAsync(`
    ALTER TABLE channels ADD COLUMN countries TEXT NOT NULL DEFAULT '';
    ALTER TABLE channels ADD COLUMN languages TEXT NOT NULL DEFAULT '';
  `);
}

/**
 * v4：从 iptv-org 数据库查询到的语言与节目单标注分开保存，
 * 这样刷新既能移除已删去的显式标注，又能保留查询结果。
 */
async function migrateV4(tx: SqlExecutor): Promise<void> {
  await tx.execAsync(
    "ALTER TABLE channels ADD COLUMN lookupLanguages TEXT NOT NULL DEFAULT '';",
  );
  // 为已经导入的 iptv-org ID 补填国家/地区（离线，遵循相同的
  // 与导入相同的严格规则，使现有列表不必刷新。
  const rows = await tx.getAllAsync<{ id: string; tvgId: string }>(
    "SELECT id, tvgId FROM channels WHERE countries = '' AND tvgId IS NOT NULL",
  );
  // 按国家分组并分批写入：每约 900 行使用一条语句，而不是
  // 每个频道执行一次（一万一千次独立更新会让启动页停留数秒）。
  const byCountry = new Map<string, string[]>();
  for (const row of rows) {
    const [country] = countryFromIptvOrgId(row.tvgId);
    if (country)
      byCountry.set(country, [...(byCountry.get(country) ?? []), row.id]);
  }
  for (const [country, ids] of byCountry)
    for (let start = 0; start < ids.length; start += 900) {
      const chunk = ids.slice(start, start + 900);
      await tx.runAsync(
        `UPDATE channels SET countries = ? WHERE id IN (${chunk.map(() => "?").join(",")})`,
        [country, ...chunk],
      );
    }
}

/** v5：可靠的逻辑频道分组和显式流清晰度。 */
async function migrateV5(tx: SqlExecutor): Promise<void> {
  // 逐列检查，确保迁移重试或此前只应用了一部分时仍然安全。
  // 正常升级仍在事务中原子执行；这也保护修复后的
  // 或实际表结构比 user_version 更新的开发数据库。
  const columns = new Set(
    (await tx.getAllAsync<{ name: string }>("PRAGMA table_info(channels)")).map(
      (column) => column.name,
    ),
  );
  if (!columns.has("groupKey"))
    await tx.execAsync(
      "ALTER TABLE channels ADD COLUMN groupKey TEXT NOT NULL DEFAULT '';",
    );
  if (!columns.has("qualityLabel"))
    await tx.execAsync("ALTER TABLE channels ADD COLUMN qualityLabel TEXT;");
  if (!columns.has("qualityRank"))
    await tx.execAsync("ALTER TABLE channels ADD COLUMN qualityRank INTEGER;");
  const rows = await tx.getAllAsync<{
    id: string;
    sourceId: string;
    identityKey: string;
    tvgId: string | null;
  }>("SELECT id, sourceId, identityKey, tvgId FROM channels");
  for (let start = 0; start < rows.length; start += 120) {
    const chunk = rows.slice(start, start + 120);
    await tx.runAsync(
      `UPDATE channels SET
        groupKey = CASE id ${chunk
          .map(() => "WHEN ? THEN ?")
          .join(" ")} ELSE groupKey END,
        qualityLabel = CASE id ${chunk
          .map(() => "WHEN ? THEN ?")
          .join(" ")} ELSE qualityLabel END,
        qualityRank = CASE id ${chunk
          .map(() => "WHEN ? THEN ?")
          .join(" ")} ELSE qualityRank END
        WHERE id IN (${chunk.map(() => "?").join(",")})`,
      [
        ...chunk.flatMap((row) => [
          row.id,
          channelGroupKey(row.sourceId, row.identityKey, row.tvgId),
        ]),
        ...chunk.flatMap((row) => [
          row.id,
          qualityFromIptvOrgId(row.tvgId)?.label ?? null,
        ]),
        ...chunk.flatMap((row) => [
          row.id,
          qualityFromIptvOrgId(row.tvgId)?.rank ?? null,
        ]),
        ...chunk.map((row) => row.id),
      ],
    );
  }
  await tx.execAsync(
    "CREATE INDEX IF NOT EXISTS channels_group ON channels(groupKey, active, qualityRank, sortIndex);",
  );
}

/** v6：收藏和最近观看状态属于逻辑频道，而非单条流地址记录；recent_groups 同时记住上次实际播放的来源。 */
async function migrateV6(tx: SqlExecutor): Promise<void> {
  await tx.execAsync(`
    CREATE TABLE IF NOT EXISTS favorite_groups (
      groupKey TEXT PRIMARY KEY NOT NULL, createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recent_groups (
      groupKey TEXT PRIMARY KEY NOT NULL, preferredChannelId TEXT,
      lastPlayedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS favorite_groups_time ON favorite_groups(createdAt DESC);
    CREATE INDEX IF NOT EXISTS recent_groups_time ON recent_groups(lastPlayedAt DESC);
  `);
  const legacyTables = new Set(
    (
      await tx.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('favorites','recents')",
      )
    ).map((table) => table.name),
  );
  if (legacyTables.has("favorites"))
    await tx.execAsync(`
      INSERT OR IGNORE INTO favorite_groups(groupKey, createdAt)
      SELECT c.groupKey, MIN(f.createdAt) FROM favorites f
      JOIN channels c ON c.id = f.channelId GROUP BY c.groupKey;
      DROP TABLE favorites;
    `);
  if (legacyTables.has("recents"))
    await tx.execAsync(`
      INSERT OR IGNORE INTO recent_groups(groupKey, preferredChannelId, lastPlayedAt)
      SELECT c.groupKey,
        (SELECT r2.channelId FROM recents r2
           JOIN channels c2 ON c2.id = r2.channelId
           WHERE c2.groupKey = c.groupKey
           ORDER BY r2.lastPlayedAt DESC, r2.channelId LIMIT 1),
        MAX(r.lastPlayedAt)
      FROM recents r JOIN channels c ON c.id = r.channelId
      GROUP BY c.groupKey;
      DROP TABLE recents;
    `);
}
