import { isIptvOrgId, normalizeLanguages } from "../domain/channelFacets";
import { splitGroups, UNGROUPED } from "../domain/channelLabels";
import { groupOrder } from "./channelSql";
import { RepositoryError, type SqlExecutor } from "./sql";

/**
 * 用户手动为一个来源指定的语言：整个来源的默认语言及每个分组的语言。
 * 每项都是一个规范化代码（空字符串表示无），只用于节目单和 iptv-org
 * 查询均未标注语言的频道，见 EFFECTIVE_LANGUAGES。
 */
export interface SourceLanguages {
  defaultLanguage: string;
  /** 分组名称 → 语言；未选择语言的分组不保存在映射中。 */
  groups: Record<string, string>;
}

/** 只接受一个语言代码或空值；无法规范化的内容一律拒绝。 */
function languageCode(raw: string): string {
  if (!raw) return "";
  const [code, ...rest] = normalizeLanguages(raw);
  if (!code || rest.length) throw new RepositoryError("invalid_input");
  return code;
}

export async function readSourceLanguages(
  db: SqlExecutor,
  sourceId: string,
): Promise<SourceLanguages> {
  const source = await db.getFirstAsync<{ defaultLanguage: string }>(
    "SELECT defaultLanguage FROM sources WHERE id = ?",
    [sourceId],
  );
  if (!source) throw new RepositoryError("source_missing");
  const rows = await db.getAllAsync<{ groupName: string; language: string }>(
    "SELECT groupName, language FROM source_group_languages WHERE sourceId = ?",
    [sourceId],
  );
  return {
    defaultLanguage: source.defaultLanguage,
    groups: Object.fromEntries(
      rows.map((row) => [row.groupName, row.language]),
    ),
  };
}

/** 替换来源的设置；事务由调用方持有。 */
export async function writeSourceLanguages(
  tx: SqlExecutor,
  sourceId: string,
  languages: SourceLanguages,
): Promise<void> {
  const result = await tx.runAsync(
    "UPDATE sources SET defaultLanguage = ? WHERE id = ?",
    [languageCode(languages.defaultLanguage), sourceId],
  );
  if (!result.changes) throw new RepositoryError("source_missing");
  await tx.runAsync("DELETE FROM source_group_languages WHERE sourceId = ?", [
    sourceId,
  ]);
  for (const [groupName, raw] of Object.entries(languages.groups)) {
    const language = languageCode(raw);
    if (!groupName.trim() || groupName.includes(";") || !language) continue;
    await tx.runAsync(
      "INSERT INTO source_group_languages(sourceId, groupName, language) VALUES(?,?,?)",
      [sourceId, groupName, language],
    );
  }
}

/**
 * 列出某个来源的分组，不论来源是否启用，排序与分组标签一致。
 * 未分组频道没有可单独设置的分组，使用来源默认语言。
 */
export async function querySourceGroups(
  db: SqlExecutor,
  sourceId: string,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ groupName: string }>(
    "SELECT DISTINCT groupName FROM channels WHERE sourceId = ? AND active = 1",
    [sourceId],
  );
  const groups = new Set(rows.flatMap((row) => splitGroups(row.groupName)));
  groups.delete(UNGROUPED);
  return [...groups].sort((left, right) => groupOrder.compare(left, right));
}

/** 可由 iptv-org 查询补全的频道：具有 iptv-org 格式 tvg-id，并且节目单或此前查询均未提供语言。用户指定的来源和分组语言优先级低于查询结果，因此不会排除这些记录。 */
export async function queryLanguageLookupTargets(
  db: SqlExecutor,
  sourceId: string,
): Promise<{ id: string; tvgId: string }[]> {
  const rows = await db.getAllAsync<{ id: string; tvgId: string }>(
    `SELECT id, tvgId FROM channels WHERE sourceId = ? AND active = 1
       AND tvgId IS NOT NULL AND languages = '' AND lookupLanguages = ''`,
    [sourceId],
  );
  return rows.filter((row) => isIptvOrgId(row.tvgId));
}
