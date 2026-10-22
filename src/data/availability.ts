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
          ROW_NUMBER() OVER (PARTITION BY streamUrl ORDER BY checkedAt DESC, (checkStatus = 'ok') DESC, id) AS rank
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
      ORDER BY known.checkedAt DESC, (known.checkStatus = 'ok') DESC, known.id LIMIT 1
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

/** 按观察发生的顺序记录地址可达性，而非按保存顺序。同一时间戳下，无论哪次保存先到，成功结果优先。只有检测读取过主清单时，才替换已保存的音轨语言；否则保留上次已知的语言。 */
export async function writeChecks(
  db: SqlExecutor,
  results: {
    streamUrl: string;
    ok: boolean;
    observedAt: number;
    languages?: string[];
  }[],
  now: number,
): Promise<void> {
  for (const result of results) {
    // 时钟回拨会使来自旧时钟、仍在途中的观测结果
    // 无法确定；丢弃这些结果，等待新的明确检测重新观测。
    if (!Number.isFinite(result.observedAt) || result.observedAt > now)
      continue;
    const status = result.ok ? "ok" : "unreachable";
    await db.runAsync(
      `UPDATE channels SET checkStatus = ?, checkedAt = ?${result.languages ? ", streamLanguages = ?" : ""}
      WHERE streamUrl = ? AND (
        checkedAt IS NULL OR checkedAt > ? OR checkedAt < ? OR
        (checkedAt = ? AND (checkStatus IS NULL OR checkStatus <> 'ok' OR ? = 'ok'))
      )`,
      [
        status,
        result.observedAt,
        ...(result.languages
          ? [normalizeLanguages(result.languages.join(";")).join(";")]
          : []),
        result.streamUrl,
        // 保存在未来的时间戳也属于原先的时钟；
        // 回拨后产生的新观测可以覆盖它。
        now,
        result.observedAt,
        result.observedAt,
        status,
      ],
    );
  }
}
