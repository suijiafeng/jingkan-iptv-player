import type {
  Channel,
  ChannelQuery,
  ImportPreview,
  ImportSourceInput,
  RefreshToken,
  Source,
} from "../domain/types";
import { normalizeRemoteUrl } from "../domain/url";
import {
  buildFacetOptions,
  normalizeLanguages,
  type ChannelFacetOptions,
  type FacetChannel,
} from "../domain/channelFacets";
import { RepositoryError, type SqlDatabase } from "./sql";
import { migrateSchema } from "./schema";
import {
  assertContent,
  assertPreview,
  CHANNEL_SELECT,
  cleanUnreferenced,
  mapChannel,
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
    return this.db.getAllAsync<Source>(
      `${SOURCE_SELECT} ORDER BY s.createdAt, s.id`,
    );
  }

  async getSource(id: string): Promise<Source | null> {
    return this.db.getFirstAsync<Source>(`${SOURCE_SELECT} WHERE s.id = ?`, [
      id,
    ]);
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
        source = await tx.getFirstAsync<Source>(
          `${SOURCE_SELECT} WHERE s.id = ?`,
          [id],
        );
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
        result = await tx.getFirstAsync<Source>(
          `${SOURCE_SELECT} WHERE s.id = ?`,
          [sourceId],
        );
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
    await this.serialize(async () => {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        for (const update of updates) {
          const value = normalizeLanguages(update.languages.join(";")).join(
            ";",
          );
          if (!value) continue;
          const result = await tx.runAsync(
            "UPDATE channels SET lookupLanguages = ? WHERE id = ? AND tvgId = ?",
            [value, update.channelId, update.tvgId],
          );
          changed += result.changes;
        }
      });
    });
    return changed;
  }

  /**
   * 保存手动可用性检测结果。只有频道仍保留被检测的 URL 时结果才有效
   * （刷新可能会替换地址）。
   */
  async saveCheckResults(
    results: { channelId: string; streamUrl: string; ok: boolean }[],
  ): Promise<void> {
    if (!results.length) return;
    await this.serialize(async () => {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        const now = this.now();
        for (const result of results)
          await tx.runAsync(
            "UPDATE channels SET checkStatus = ?, checkedAt = ? WHERE id = ? AND streamUrl = ?",
            [
              result.ok ? "ok" : "unreachable",
              now,
              result.channelId,
              result.streamUrl,
            ],
          );
      });
    });
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
    await this.serialize(async () => {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync("DELETE FROM sources WHERE id = ?", [sourceId]);
        await cleanUnreferenced(tx);
      });
    });
  }

  async toggleFavorite(channelId: string): Promise<boolean> {
    return this.serialize(async () => {
      let favorite = false;
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        const channel = await tx.getFirstAsync<{
          id: string;
          groupKey: string;
        }>("SELECT id, groupKey FROM channels WHERE id = ?", [channelId]);
        if (!channel) throw new RepositoryError("channel_missing");
        const existing = await tx.getFirstAsync<{ groupKey: string }>(
          "SELECT groupKey FROM favorite_groups WHERE groupKey = ?",
          [channel.groupKey],
        );
        favorite = !existing;
        if (favorite) {
          const active = await tx.getFirstAsync<{ id: string }>(
            "SELECT id FROM channels WHERE groupKey = ? AND active = 1 LIMIT 1",
            [channel.groupKey],
          );
          if (!active) throw new RepositoryError("channel_missing");
          await tx.runAsync(
            "INSERT INTO favorite_groups(groupKey,createdAt) VALUES(?,?)",
            [channel.groupKey, this.now()],
          );
        } else
          await tx.runAsync("DELETE FROM favorite_groups WHERE groupKey = ?", [
            channel.groupKey,
          ]);
        await cleanUnreferenced(tx);
      });
      return favorite;
    });
  }

  /** 仅在当前会话真正开始播放后调用。 */
  async recordRecent(channelId: string): Promise<void> {
    await this.serialize(async () => {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        const channel = await tx.getFirstAsync<{
          id: string;
          groupKey: string;
        }>("SELECT id, groupKey FROM channels WHERE id = ? AND active = 1", [
          channelId,
        ]);
        if (!channel) return;
        await tx.runAsync(
          `INSERT INTO recent_groups(groupKey,preferredChannelId,lastPlayedAt)
           VALUES(?,?,?) ON CONFLICT(groupKey) DO UPDATE SET
           preferredChannelId=excluded.preferredChannelId,
           lastPlayedAt=excluded.lastPlayedAt`,
          [channel.groupKey, channel.id, this.now()],
        );
        await tx.runAsync(
          `DELETE FROM recent_groups WHERE groupKey NOT IN (
             SELECT groupKey FROM recent_groups
             ORDER BY lastPlayedAt DESC, groupKey LIMIT 100
           )`,
        );
        await cleanUnreferenced(tx);
      });
    });
  }

  async removeRecent(channelId: string): Promise<void> {
    await this.serialize(async () => {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          `DELETE FROM recent_groups WHERE groupKey = (
             SELECT groupKey FROM channels WHERE id = ?
           )`,
          [channelId],
        );
        await cleanUnreferenced(tx);
      });
    });
  }

  async clearRecent(): Promise<void> {
    await this.serialize(async () => {
      await this.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync("DELETE FROM recent_groups");
        await cleanUnreferenced(tx);
      });
    });
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
}
