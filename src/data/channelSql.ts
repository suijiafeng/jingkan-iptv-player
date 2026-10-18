import { M3U_LIMITS, utf8ByteLength } from "../domain/m3u";
import type {
  Channel,
  ChannelQuery,
  ImportPreview,
  Source,
} from "../domain/types";
import { normalizeRemoteUrl } from "../domain/url";
import { UNGROUPED } from "../domain/channelLabels";
import {
  normalizeCountries,
  normalizeLanguages,
} from "../domain/channelFacets";
import { channelGroupKey } from "../domain/channelSources";
import { RepositoryError, type SqlExecutor, type SqlValue } from "./sql";

/** 仓库共用的 SQL 片段、数据行映射及批量写入。 */

export interface RawSource extends Source {
  content?: string | null;
}
export interface RawChannel extends Omit<
  Channel,
  "active" | "favorite" | "countries" | "languages"
> {
  active: number;
  favorite: number;
  countries: string;
  languages: string;
  lookupLanguages?: string;
  favoriteCreatedAt?: number | null;
  sourceCreatedAt?: number;
  groupRow?: number;
  preferredChannelId?: string | null;
}

export const SOURCE_SELECT = `SELECT s.id, s.name, s.kind, s.location, s.createdAt, s.lastSuccessAt,
  s.lastErrorCategory, s.revision,
  (SELECT COUNT(*) FROM channels c WHERE c.sourceId = s.id AND c.active = 1) AS channelCount,
  (SELECT COUNT(DISTINCT c.groupKey) FROM channels c JOIN favorite_groups f ON f.groupKey = c.groupKey
    WHERE c.sourceId = s.id AND c.active = 1) AS favoriteCount
  FROM sources s`;
export const CHANNEL_SELECT = `SELECT c.*, s.name AS sourceName, s.createdAt AS sourceCreatedAt,
  CASE WHEN fg.groupKey IS NULL THEN 0 ELSE 1 END AS favorite,
  fg.createdAt AS favoriteCreatedAt, rg.lastPlayedAt, rg.preferredChannelId
  FROM channels c JOIN sources s ON s.id = c.sourceId
  LEFT JOIN favorite_groups fg ON fg.groupKey = c.groupKey
  LEFT JOIN recent_groups rg ON rg.groupKey = c.groupKey`;
// 采用低于 SQLite 旧版 999 个变量限制的保守上限。
const MAX_INSERT_PARAMETERS = 900;
const CHANNEL_BOUND_COLUMNS = [
  "id",
  "sourceId",
  "identityKey",
  "groupKey",
  "name",
  "groupName",
  "tvgId",
  "logoUrl",
  "countries",
  "languages",
  "streamUrl",
  "qualityLabel",
  "qualityRank",
  "sortIndex",
  "lastSeenRevision",
];
// 只创建一个排序器；带区域设置的 localeCompare 会在每次比较时创建新对象，
// 这在 Hermes/Android 上曾使列出分组耗时约 100 ms。
export const groupOrder = new Intl.Collator("zh-Hans-CN");
const CLEAN_UNREFERENCED = [
  `DELETE FROM channels WHERE active = 0
    AND groupKey NOT IN (SELECT groupKey FROM favorite_groups)
    AND groupKey NOT IN (SELECT groupKey FROM recent_groups)`,
  `DELETE FROM favorite_groups WHERE NOT EXISTS (
    SELECT 1 FROM channels c WHERE c.groupKey = favorite_groups.groupKey
  )`,
  `DELETE FROM recent_groups WHERE NOT EXISTS (
    SELECT 1 FROM channels c WHERE c.groupKey = recent_groups.groupKey
  )`,
] as const;

/** 删除没有任何有效频道引用的行及收藏、最近观看状态。 */
export async function cleanUnreferenced(tx: SqlExecutor): Promise<void> {
  for (const statement of CLEAN_UNREFERENCED) await tx.runAsync(statement);
}

export function channelFilter(query: ChannelQuery): {
  where: string;
  params: SqlValue[];
} {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (!query.includeInactive) where.push("c.active = 1");
  if (query.sourceId) {
    where.push("c.sourceId = ?");
    params.push(query.sourceId);
  }
  if (query.groupName !== undefined) {
    if (!query.groupName || query.groupName === UNGROUPED) {
      where.push("(c.groupName = ? OR c.groupName = '')");
      params.push(UNGROUPED);
    } else {
      // groupName 保存以“;”拼接的列表；匹配时必须命中完整成员。
      where.push("(';' || c.groupName || ';') LIKE ? ESCAPE '\\'");
      params.push(`%;${query.groupName.replace(/[\\%_]/g, "\\$&")};%`);
    }
  }
  for (const [column, value] of [
    ["c.countries", query.country],
    [EFFECTIVE_LANGUAGES, query.language],
  ] as const) {
    if (value === undefined) continue;
    if (value === "") where.push(`${column} = ''`);
    else {
      where.push(`(';' || ${column} || ';') LIKE ? ESCAPE '\\'`);
      params.push(`%;${value.replace(/[\\%_]/g, "\\$&")};%`);
    }
  }
  if (query.search?.trim()) {
    where.push("c.name LIKE ? ESCAPE '\\' COLLATE NOCASE");
    params.push(`%${query.search.trim().replace(/[\\%_]/g, "\\$&")}%`);
  }
  if (query.mode === "favorites")
    where.push(
      "EXISTS (SELECT 1 FROM favorite_groups f WHERE f.groupKey = c.groupKey)",
    );
  if (query.mode === "recent")
    where.push(
      "EXISTS (SELECT 1 FROM recent_groups r WHERE r.groupKey = c.groupKey)",
    );
  return {
    where: where.length ? ` WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export function assertPreview(preview: ImportPreview): void {
  if (!preview.channels.length) throw new RepositoryError("empty_import");
  if (preview.channels.length > M3U_LIMITS.maxEntries)
    throw new RepositoryError("invalid_input");
  const seen = new Set<string>();
  for (const channel of preview.channels) {
    if (!channel.identityKey || !channel.name || seen.has(channel.identityKey))
      throw new RepositoryError("invalid_input");
    normalizeRemoteUrl(channel.streamUrl);
    seen.add(channel.identityKey);
  }
}
export function assertContent(content: string): void {
  if (
    content.length > M3U_LIMITS.maxBytes ||
    utf8ByteLength(content) > M3U_LIMITS.maxBytes
  )
    throw new RepositoryError("invalid_input");
}
// 优先采用节目单标注，否则使用用户已执行的 iptv-org 查询结果。
const EFFECTIVE_LANGUAGES =
  "(CASE WHEN c.languages <> '' THEN c.languages ELSE c.lookupLanguages END)";

export function mapChannel(row: RawChannel): Channel {
  const {
    lookupLanguages,
    favoriteCreatedAt: _favoriteCreatedAt,
    sourceCreatedAt: _sourceCreatedAt,
    groupRow: _groupRow,
    preferredChannelId: _preferredChannelId,
    ...rest
  } = row;
  return {
    ...rest,
    countries: normalizeCountries(row.countries),
    languages: normalizeLanguages(row.languages || lookupLanguages),
    active: row.active === 1,
    favorite: row.favorite === 1,
  };
}

/**
 * 按稳定身份（可靠的 tvg-id 或完整 URL）插入或更新节目单频道，
 * 分批写入，保持低于 SQLite 的变量数量上限。
 */
export async function upsertChannels(
  tx: SqlExecutor,
  sourceId: string,
  revision: number,
  preview: ImportPreview,
  makeId: () => string,
): Promise<void> {
  const existing = await tx.getAllAsync<{ id: string; identityKey: string }>(
    "SELECT id, identityKey FROM channels WHERE sourceId = ?",
    [sourceId],
  );
  const identities = new Map(existing.map((row) => [row.identityKey, row.id]));
  // 根据绑定列数推导每批容量，避免增加元数据后
  // 悄悄超出 SQLite 的变量限制。
  const batchSize = Math.floor(
    MAX_INSERT_PARAMETERS / CHANNEL_BOUND_COLUMNS.length,
  );
  for (let start = 0; start < preview.channels.length; start += batchSize) {
    const batch = preview.channels.slice(start, start + batchSize);
    const params: SqlValue[] = [];
    batch.forEach((channel, offset) => {
      params.push(
        identities.get(channel.identityKey) ?? makeId(),
        sourceId,
        channel.identityKey,
        channelGroupKey(sourceId, channel.identityKey, channel.tvgId),
        channel.name,
        channel.groupName,
        channel.tvgId,
        channel.logoUrl,
        normalizeCountries(channel.countries?.join(";")).join(";"),
        normalizeLanguages(channel.languages?.join(";")).join(";"),
        channel.streamUrl,
        channel.qualityLabel ?? null,
        channel.qualityRank ?? null,
        start + offset,
        revision,
      );
    });
    await tx.runAsync(
      `INSERT INTO channels(${CHANNEL_BOUND_COLUMNS.join(",")},active)
      VALUES${batch.map(() => `(${CHANNEL_BOUND_COLUMNS.map(() => "?").join(",")},1)`).join(",")} ON CONFLICT(sourceId, identityKey) DO UPDATE SET
      name=excluded.name,groupKey=excluded.groupKey,groupName=excluded.groupName,tvgId=excluded.tvgId,logoUrl=excluded.logoUrl,
      countries=excluded.countries,languages=excluded.languages,
      lookupLanguages=CASE WHEN channels.tvgId IS excluded.tvgId THEN channels.lookupLanguages ELSE '' END,
      checkStatus=CASE WHEN channels.streamUrl=excluded.streamUrl THEN channels.checkStatus END,
      checkedAt=CASE WHEN channels.streamUrl=excluded.streamUrl THEN channels.checkedAt END,
      streamUrl=excluded.streamUrl,qualityLabel=excluded.qualityLabel,qualityRank=excluded.qualityRank,
      sortIndex=excluded.sortIndex,active=1,lastSeenRevision=excluded.lastSeenRevision`,
      params,
    );
  }
  // 收藏和最近观看按 groupKey 保存，因此新导入的
  // 备用线路继承该状态，无需复制每条播放地址的数据行。
}
