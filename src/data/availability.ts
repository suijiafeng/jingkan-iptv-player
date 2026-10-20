import { normalizeLanguages } from "../domain/channelFacets";
import type { SqlExecutor } from "./sql";

export interface StoredCheck {
  streamUrl: string;
  checkStatus: "ok" | "unreachable";
  checkedAt: number;
}

/** 检测对象按完整地址识别，而不是频道名称或逻辑分组。 */
export async function readChecks(
  db: SqlExecutor,
  urls: readonly string[],
): Promise<StoredCheck[]> {
  const unique = [...new Set(urls)];
  const results: StoredCheck[] = [];
  for (let start = 0; start < unique.length; start += 400) {
    const batch = unique.slice(start, start + 400);
    results.push(
      ...(await db.getAllAsync<StoredCheck>(
        `SELECT streamUrl, checkStatus, checkedAt FROM (
        SELECT streamUrl, checkStatus, checkedAt,
          ROW_NUMBER() OVER (PARTITION BY streamUrl ORDER BY checkedAt DESC, checkStatus DESC, id) AS rank
        FROM channels WHERE streamUrl IN (${batch.map(() => "?").join(",")})
          AND checkStatus IS NOT NULL AND checkedAt IS NOT NULL
      ) WHERE rank = 1`,
        batch,
      )),
    );
  }
  return results;
}

/** 迁移及新导入的频道继承其 URL 最近已知的检测结果。 */
export async function synchronizeChecks(
  db: SqlExecutor,
  sourceId?: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE channels AS c SET (checkStatus, checkedAt) = (
      SELECT known.checkStatus, known.checkedAt FROM channels known
      WHERE known.streamUrl = c.streamUrl AND known.checkStatus IS NOT NULL AND known.checkedAt IS NOT NULL
      ORDER BY known.checkedAt DESC, known.checkStatus DESC, known.id LIMIT 1
    ) WHERE ${sourceId === undefined ? "" : "c.sourceId = ? AND "}EXISTS (
      SELECT 1 FROM channels known WHERE known.streamUrl = c.streamUrl
        AND known.checkStatus IS NOT NULL AND known.checkedAt IS NOT NULL
    )`,
    sourceId === undefined ? [] : [sourceId],
  );
}

/** 新导入的记录也继承同地址其它记录已经识别到的音轨语言。此操作独立于 synchronizeChecks，后者还会在音轨列尚不存在的旧版本迁移中运行。 */
export async function synchronizeStreamLanguages(
  db: SqlExecutor,
  sourceId: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE channels AS c SET streamLanguages = (
      SELECT known.streamLanguages FROM channels known
      WHERE known.streamUrl = c.streamUrl AND known.streamLanguages <> ''
      ORDER BY known.checkedAt DESC, known.id LIMIT 1
    ) WHERE c.sourceId = ? AND c.streamLanguages = '' AND EXISTS (
      SELECT 1 FROM channels known
      WHERE known.streamUrl = c.streamUrl AND known.streamLanguages <> ''
    )`,
    [sourceId],
  );
}

/**
 * 按地址记录可达性。只有检测读取了主播放列表时，才用声明的音轨语言
 * 替换已保存的语言；其他情况保留最后已知的语言。
 */
export async function writeChecks(
  db: SqlExecutor,
  results: { streamUrl: string; ok: boolean; languages?: string[] }[],
  now: number,
): Promise<void> {
  for (const result of new Map(
    results.map((item) => [item.streamUrl, item]),
  ).values())
    await db.runAsync(
      result.languages
        ? "UPDATE channels SET checkStatus = ?, checkedAt = ?, streamLanguages = ? WHERE streamUrl = ?"
        : "UPDATE channels SET checkStatus = ?, checkedAt = ? WHERE streamUrl = ?",
      [
        result.ok ? "ok" : "unreachable",
        now,
        ...(result.languages
          ? [normalizeLanguages(result.languages.join(";")).join(";")]
          : []),
        result.streamUrl,
      ],
    );
}
