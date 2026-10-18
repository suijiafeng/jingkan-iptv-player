import type { Channel, ChannelQuery } from "../domain/types";
import { splitGroups, UNGROUPED } from "../domain/channelLabels";
import {
  normalizeCountries,
  normalizeLanguages,
  type FacetChannel,
} from "../domain/channelFacets";
import type { SqlExecutor } from "./sql";
import {
  CHANNEL_SELECT,
  channelFilter,
  groupOrder,
  mapChannel,
  type RawChannel,
} from "./channelSql";

/** 仓库列表方法背后的只读频道查询。 */

/** 匹配筛选条件的频道；未请求备用线路时，每个逻辑频道只返回一行。 */
export async function queryChannels(
  db: SqlExecutor,
  query: ChannelQuery,
): Promise<Channel[]> {
  const { where, params } = channelFilter(query);
  const representativeOrder =
    query.mode === "recent"
      ? "COALESCE(checkStatus = 'unreachable', 0), (id = preferredChannelId) DESC, qualityRank IS NULL, qualityRank, sourceCreatedAt, sourceId, sortIndex, id"
      : "COALESCE(checkStatus = 'unreachable', 0), qualityRank IS NULL, qualityRank, sourceCreatedAt, sourceId, sortIndex, id";
  const order =
    query.mode === "recent"
      ? "lastPlayedAt DESC, id"
      : query.mode === "favorites"
        ? "COALESCE(checkStatus = 'unreachable', 0), favoriteCreatedAt DESC, id"
        : "COALESCE(checkStatus = 'unreachable', 0), sourceCreatedAt, sourceId, sortIndex, id";
  let page = "";
  if (query.limit !== undefined || query.offset) {
    page = " LIMIT ? OFFSET ?";
    params.push(query.limit ?? -1, query.offset ?? 0);
  }
  const groupedSql = `WITH candidates AS (${CHANNEL_SELECT}${where}), ranked AS (
      SELECT candidates.*, ROW_NUMBER() OVER (
        PARTITION BY groupKey ORDER BY ${representativeOrder}
      ) AS groupRow FROM candidates
    ) SELECT * FROM ranked WHERE groupRow = 1 ORDER BY ${order}${page}`;
  const rows = await db.getAllAsync<RawChannel>(
    query.includeVariants
      ? `${CHANNEL_SELECT}${where} ORDER BY ${order}${page}`
      : groupedSql,
    params,
  );
  return rows.map(mapChannel);
}

/** 与 queryChannels 使用相同筛选条件的行数，忽略分页。 */
export async function countChannelRows(
  db: SqlExecutor,
  query: ChannelQuery,
): Promise<number> {
  const { where, params } = channelFilter(query);
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(${query.includeVariants ? "*" : "DISTINCT c.groupKey"}) AS total
     FROM channels c JOIN sources s ON s.id = c.sourceId${where}`,
    params,
  );
  return row?.total ?? 0;
}

/** 有效备选来源：上次播放的优先，其次是未标注版本的主线路，最后按清晰度从低到高排列。 */
export async function queryChannelSources(
  db: SqlExecutor,
  groupKey: string,
): Promise<Channel[]> {
  if (!groupKey) return [];
  const rows = await db.getAllAsync<RawChannel>(
    `${CHANNEL_SELECT} WHERE c.groupKey = ? AND c.active = 1 AND s.enabled = 1
     ORDER BY COALESCE(c.checkStatus = 'unreachable', 0),
       COALESCE(c.id = rg.preferredChannelId, 0) DESC,
       c.qualityRank IS NOT NULL, c.qualityRank,
       s.createdAt, c.sourceId, c.sortIndex, c.id`,
    [groupKey],
  );
  return rows.map(mapChannel);
}

/** 有效频道的分组名称，排序后将“未分组”放在最后。 */
export async function queryGroups(
  db: SqlExecutor,
  sourceId?: string,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ groupName: string }>(
    `SELECT DISTINCT c.groupName FROM channels c JOIN sources s ON s.id = c.sourceId
     WHERE c.active = 1 AND s.enabled = 1${sourceId ? " AND c.sourceId = ?" : ""}`,
    sourceId ? [sourceId] : [],
  );
  const groups = new Set(rows.flatMap((row) => splitGroups(row.groupName)));
  const ungrouped = groups.delete(UNGROUPED);
  const sorted = [...groups].sort((left, right) =>
    groupOrder.compare(left, right),
  );
  return ungrouped ? [...sorted, UNGROUPED] : sorted;
}

/** 活跃频道的不同维度组合，用于缩小筛选选项。 */
export async function queryFacetRows(
  db: SqlExecutor,
  sourceId?: string,
): Promise<FacetChannel[]> {
  const rows = await db.getAllAsync<{
    countries: string;
    languages: string;
    groupName: string;
  }>(
    `SELECT DISTINCT c.countries, CASE WHEN c.languages <> '' THEN c.languages ELSE c.lookupLanguages END AS languages, c.groupName
     FROM channels c JOIN sources s ON s.id = c.sourceId
     WHERE c.active = 1 AND s.enabled = 1${sourceId ? " AND c.sourceId = ?" : ""}`,
    sourceId ? [sourceId] : [],
  );
  return rows.map((row) => ({
    ...row,
    countries: normalizeCountries(row.countries),
    languages: normalizeLanguages(row.languages),
  }));
}
