import type {
  Channel,
  ChannelQuery,
  ImportPreview,
  ImportSourceInput,
  RefreshToken,
  Source,
} from "../domain/types";
import { normalizeRemoteUrl } from "../domain/url";
import { parseBackup, readBackup, writeBackup } from "./backup";
import {
  buildFacetOptions,
  normalizeLanguages,
  type ChannelFacetOptions,
  type FacetChannel,
} from "../domain/channelFacets";
import { RepositoryError, type SqlDatabase, type SqlExecutor } from "./sql";
import {
  clearRecent,
  recordRecent,
  removeRecent,
  toggleFavorite,
} from "./channelLibrary";
import { migrateSchema } from "./schema";
import {
  queryLanguageLookupTargets,
  querySourceGroups,
  readSourceLanguages,
  writeSourceLanguages,
  type SourceLanguages,
} from "./sourceLanguages";
import { readChecks, writeChecks } from "./availability";
import {
  assertContent,
  assertPreview,
  CHANNEL_SELECT,
  cleanUnreferenced,
  mapChannel,
  mapSource,
  SOURCE_SELECT,
  upsertChannels,
  type RawChannel,
  type RawSource,
} from "./channelSql";
import {
  countChannelRows,
  queryChannels,
  queryChannelSources,
  queryFacetRows,
  queryGroups,
} from "./channelReads";

export interface RefreshOptions {
  content?: string;
  location?: string;
  generation?: number;
}
export interface RepositoryOptions {
  now?: () => number;
  makeId?: () => string;
}

function makeId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // 这些只是本地记录标识符，不是凭证或安全权限。
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const digit = Math.floor(Math.random() * 16);
    return (char === "x" ? digit : (digit & 3) | 8).toString(16);
  });
}

/**
 * 唯一的持久数据存储。所有写入串行执行；导入、刷新及每次多行修改
 * 都在一个事务中完成。
 */
export class Repository {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly generations = new Map<string, number>();
  private readonly now: () => number;
  private readonly makeId: () => string;

  constructor(
    private readonly db: SqlDatabase,
    options: RepositoryOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.makeId = options.makeId ?? makeId;
  }

  /** 一个独占事务，排在此前所有写入之后。 */
  private transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      let result!: T;
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        result = await work(tx);
      });
      return result;
    });
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async initialize(): Promise<void> {
    await this.serialize(async () => {
      await this.db.execAsync(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;",
      );
      await this.db.withExclusiveTransactionAsync(migrateSchema);
    });
  }

  async listSources(): Promise<Source[]> {
    const rows = await this.db.getAllAsync<RawSource>(
      `${SOURCE_SELECT} ORDER BY s.createdAt, s.id`,
    );
    return rows.map(mapSource);
  }

  async getSource(id: string): Promise<Source | null> {
    const row = await this.db.getFirstAsync<RawSource>(
      `${SOURCE_SELECT} WHERE s.id = ?`,
      [id],
    );
    return row ? mapSource(row) : null;
  }

  async getSourceContent(id: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ content: string | null }>(
      "SELECT content FROM sources WHERE id = ?",
      [id],
    );
    return row?.content ?? null;
  }

  listChannels(query: ChannelQuery = {}): Promise<Channel[]> {
    return queryChannels(this.db, query);
  }

  /** 与 listChannels 使用相同筛选条件的行数，忽略分页。 */
  countChannels(query: ChannelQuery = {}): Promise<number> {
    return countChannelRows(this.db, query);
  }

  /** 按 id 读取单个频道（任意状态），用于不加载整个目录就开始播放。 */
  async getChannel(id: string): Promise<Channel | null> {
    const row = await this.db.getFirstAsync<RawChannel>(
      `${CHANNEL_SELECT} WHERE c.id = ?`,
      [id],
    );
    return row ? mapChannel(row) : null;
  }

  /** 有效备选来源：上次播放的优先，其次是未标注版本的主线路，最后按清晰度从低到高排列。 */
  listChannelSources(groupKey: string): Promise<Channel[]> {
    return queryChannelSources(this.db, groupKey);
  }

  listFavorites(): Promise<Channel[]> {
    return this.listChannels({ mode: "favorites" });
  }
  listRecent(): Promise<Channel[]> {
    return this.listChannels({ mode: "recent" });
  }

  listGroups(sourceId?: string): Promise<string[]> {
    return queryGroups(this.db, sourceId);
  }

  /** 来源中的所有分组，不论来源启用与否，都可设置语言。 */
  listSourceGroups(sourceId: string): Promise<string[]> {
    return querySourceGroups(this.db, sourceId);
  }

  getSourceLanguages(sourceId: string): Promise<SourceLanguages> {
    return readSourceLanguages(this.db, sourceId);
  }

  /** 用户为来源及其分组指定的语言设置，整份替换。 */
  setSourceLanguages(
    sourceId: string,
    languages: SourceLanguages,
  ): Promise<void> {
    return this.transaction((tx) =>
      writeSourceLanguages(tx, sourceId, languages),
    );
  }

  listLanguageLookupTargets(sourceId: string) {
    return queryLanguageLookupTargets(this.db, sourceId);
  }

  async listFacets(sourceId?: string): Promise<ChannelFacetOptions> {
    return buildFacetOptions(await this.listFacetRows(sourceId));
  }

  /** 活跃频道的不同维度组合，用于缩小筛选选项。 */
  listFacetRows(sourceId?: string): Promise<FacetChannel[]> {
    return queryFacetRows(this.db, sourceId);
  }

  async importSource(input: ImportSourceInput): Promise<Source> {
    assertPreview(input.preview);
    if (!input.name.trim() || !input.location.trim())
      throw new RepositoryError("invalid_input");
    const location =
      input.kind === "url"
        ? normalizeRemoteUrl(input.location)
        : input.location;
    if (input.kind === "file") {
      if (input.content === undefined)
        throw new RepositoryError("invalid_input");
      assertContent(input.content);
    }
    return this.serialize(async () => {
      const id = this.makeId();
      const now = this.now();
      let source: Source | null = null;
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          "INSERT INTO sources(id,name,kind,location,content,createdAt,lastSuccessAt,lastErrorCategory,revision) VALUES(?,?,?,?,?,?,?,NULL,1)",
          [
            id,
            input.name.trim(),
            input.kind,
            location,
            input.kind === "file" ? input.content! : null,
            now,
            now,
          ],
        );
        await upsertChannels(tx, id, 1, input.preview, this.makeId);
        const row = await tx.getFirstAsync<RawSource>(
          `${SOURCE_SELECT} WHERE s.id = ?`,
          [id],
        );
        source = row ? mapSource(row) : null;
      });
      return source!;
    });
  }

  /** 刷新开始、下载之前调用；只有最新令牌可以提交。 */
  async beginRefresh(sourceId: string): Promise<RefreshToken> {
    return this.serialize(async () => {
      const source = await this.getSource(sourceId);
      if (!source) throw new RepositoryError("source_missing");
      const generation = (this.generations.get(sourceId) ?? 0) + 1;
      this.generations.set(sourceId, generation);
      return { sourceId, revision: source.revision, generation };
    });
  }

  cancelRefresh(sourceId: string): void {
    this.generations.set(sourceId, (this.generations.get(sourceId) ?? 0) + 1);
  }

  async refreshSource(
    sourceId: string,
    expectedRevision: number,
    preview: ImportPreview,
    options: RefreshOptions = {},
  ): Promise<Source> {
    assertPreview(preview);
    if (options.content !== undefined) assertContent(options.content);
    return this.serialize(async () => {
      let result: Source | null = null;
      const checkGeneration = () => {
        if (
          options.generation !== undefined &&
          this.generations.get(sourceId) !== options.generation
        )
          throw new RepositoryError("stale_refresh");
      };
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        checkGeneration();
        const source = await tx.getFirstAsync<RawSource>(
          "SELECT * FROM sources WHERE id = ?",
          [sourceId],
        );
        if (!source) throw new RepositoryError("source_missing");
        if (source.revision !== expectedRevision)
          throw new RepositoryError("stale_refresh");
        const revision = source.revision + 1;
        const location =
          options.location === undefined
            ? source.location
            : source.kind === "url"
              ? normalizeRemoteUrl(options.location)
              : options.location;
        await tx.runAsync("UPDATE channels SET active = 0 WHERE sourceId = ?", [
          sourceId,
        ]);
        await upsertChannels(tx, sourceId, revision, preview, this.makeId);
        await tx.runAsync(
          "UPDATE sources SET revision = ?, lastSuccessAt = ?, lastErrorCategory = NULL, location = ?, content = ? WHERE id = ?",
          [
            revision,
            this.now(),
            location,
            source.kind === "file"
              ? (options.content ?? source.content ?? null)
              : null,
            sourceId,
          ],
        );
        await cleanUnreferenced(tx);
        const row = await tx.getFirstAsync<RawSource>(
          `${SOURCE_SELECT} WHERE s.id = ?`,
          [sourceId],
        );
        result = row ? mapSource(row) : null;
        checkGeneration();
      });
      return result!;
    });
  }

  /**
   * 填入用户触发的 iptv-org 数据库查询所得语言。
   * 与节目单标注分开保存，仅当频道仍使用查询时的 tvg-id 才生效；
   * 节目单显式标注始终优先。
   */
  async saveLookedUpLanguages(
    updates: { channelId: string; tvgId: string; languages: string[] }[],
  ): Promise<number> {
    let changed = 0;
    await this.transaction(async (tx) => {
      for (const update of updates) {
        const value = normalizeLanguages(update.languages.join(";")).join(";");
        if (!value) continue;
        const result = await tx.runAsync(
          "UPDATE channels SET lookupLanguages = ? WHERE id = ? AND tvgId = ?",
          [value, update.channelId, update.tvgId],
        );
        changed += result.changes;
      }
    });
    return changed;
  }

  /** 结果属于完整的特定 URL；所有相同地址的记录共享状态，刷新后地址已变化的行不受影响。 */
  async saveCheckResults(
    results: {
      channelId: string;
      streamUrl: string;
      ok: boolean;
    }[],
  ): Promise<void> {
    if (!results.length) return;
    await this.transaction(async (tx) => {
      await writeChecks(tx, results, this.now());
    });
  }

  getCheckResults(urls: readonly string[]) {
    return readChecks(this.db, urls);
  }

  async renameSource(sourceId: string, name: string): Promise<void> {
    if (!name.trim()) throw new RepositoryError("invalid_input");
    await this.serialize(async () => {
      const result = await this.db.runAsync(
        "UPDATE sources SET name = ? WHERE id = ?",
        [name.trim(), sourceId],
      );
      if (!result.changes) throw new RepositoryError("source_missing");
    });
  }

  async setSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
    if (!enabled) this.cancelRefresh(sourceId);
    await this.serialize(async () => {
      const result = await this.db.runAsync(
        "UPDATE sources SET enabled = ? WHERE id = ?",
        [enabled ? 1 : 0, sourceId],
      );
      if (!result.changes) throw new RepositoryError("source_missing");
    });
  }

  async setSourceError(
    sourceId: string,
    category: string,
    expectedRevision?: number,
  ): Promise<void> {
    // 调用方只提供错误类别，绝不传入可能包含 URL 的异常字符串。
    if (!/^[a-z_]{1,40}$/.test(category))
      throw new RepositoryError("invalid_input");
    await this.serialize(async () => {
      await this.db.runAsync(
        `UPDATE sources SET lastErrorCategory = ? WHERE id = ?${expectedRevision === undefined ? "" : " AND revision = ?"}`,
        expectedRevision === undefined
          ? [category, sourceId]
          : [category, sourceId, expectedRevision],
      );
    });
  }

  async deleteSource(sourceId: string): Promise<void> {
    this.cancelRefresh(sourceId);
    await this.transaction(async (tx) => {
      await tx.runAsync("DELETE FROM sources WHERE id = ?", [sourceId]);
      await cleanUnreferenced(tx);
    });
  }

  toggleFavorite(channelId: string): Promise<boolean> {
    return this.transaction((tx) => toggleFavorite(tx, channelId, this.now()));
  }

  /** 仅在当前会话真正开始播放后调用。 */
  recordRecent(channelId: string): Promise<void> {
    return this.transaction((tx) => recordRecent(tx, channelId, this.now()));
  }

  removeRecent(channelId: string): Promise<void> {
    return this.transaction((tx) => removeRecent(tx, channelId));
  }

  clearRecent(): Promise<void> {
    return this.transaction(clearRecent);
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    if (!row) return fallback;
    try {
      const value: unknown = JSON.parse(row.value);
      return typeof value === typeof fallback &&
        (value !== null || fallback === null)
        ? (value as T)
        : fallback;
    } catch {
      return fallback;
    }
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    if (!json) throw new RepositoryError("invalid_input");
    await this.serialize(async () => {
      await this.db.runAsync(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, json],
      );
    });
  }

  async clearAll(): Promise<void> {
    for (const key of this.generations.keys()) this.cancelRefresh(key);
    await this.serialize(async () => {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync("DELETE FROM sources");
        await tx.runAsync("DELETE FROM favorite_groups");
        await tx.runAsync("DELETE FROM recent_groups");
        await tx.runAsync("DELETE FROM settings");
      });
      // 尽力截断 WAL；secure_delete 会擦除已释放的单元，但不保证物理介质已彻底清除。
      try {
        await this.db.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
      } catch {
        // 删除已经提交；检查点失败时不能将删除报告为失败。
      }
    });
  }

  /** 一致的离线快照，不包含观看历史和许可。 */
  exportBackup(): Promise<string> {
    return this.serialize(async () => {
      let text = "";
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        text = JSON.stringify(await readBackup(tx, this.now()));
        parseBackup(text);
      });
      return text;
    });
  }

  async restoreBackup(text: string): Promise<void> {
    const backup = parseBackup(text);
    for (const key of this.generations.keys()) this.cancelRefresh(key);
    return this.serialize(() =>
      this.db.withExclusiveTransactionAsync((tx) => writeBackup(tx, backup)),
    );
  }
}
