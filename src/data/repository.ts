// 本地数据的公共入口：仓库类、SQL 接口及
// 原生 SQLite 连接。实现拆分在 src/data 下的多个模块中。
import { Repository, type RepositoryOptions } from "./channelRepository";
import type { SqlDatabase, SqlValue } from "./sql";

export {
  Repository,
  type RefreshOptions,
  type RepositoryOptions,
} from "./channelRepository";
export {
  RepositoryError,
  type SqlDatabase,
  type SqlExecutor,
  type SqlValue,
} from "./sql";
export { SCHEMA_VERSION } from "./schema";

export async function createRepository(
  db: SqlDatabase,
  options: RepositoryOptions = {},
): Promise<Repository> {
  const repository = new Repository(db, options);
  await repository.initialize();
  return repository;
}

/** 最小原生 API；按已安装的 expo-sqlite 版本校验其结构类型。 */
export interface NativeSqliteConnection {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    params: SqlValue[],
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}
export interface NativeSqliteProvider {
  openDatabaseAsync(
    filename: string,
    options?: { useNewConnection?: boolean },
  ): Promise<NativeSqliteConnection>;
}

/** 导出此接口，便于不加载 React Native 就能测试连接级 SQLite 行为。 */
export async function createNativeRepository(
  SQLite: NativeSqliteProvider,
): Promise<Repository> {
  const filename = "jingkan-private.db";
  const db = await SQLite.openDatabaseAsync(filename);
  // Expo 的独占辅助方法会新建另一个连接。仅作用于当前连接的
  // 必须在 BEGIN 之前设置 PRAGMA，确保外键级联始终启用。
  const adapter: SqlDatabase = {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params),
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params),
    async withExclusiveTransactionAsync(task) {
      const tx = await SQLite.openDatabaseAsync(filename, {
        useNewConnection: true,
      });
      try {
        await tx.execAsync(
          "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON; BEGIN IMMEDIATE;",
        );
        await task({
          execAsync: (sql) => tx.execAsync(sql),
          runAsync: (sql, params = []) => tx.runAsync(sql, params),
          getFirstAsync: (sql, params = []) => tx.getFirstAsync(sql, params),
          getAllAsync: (sql, params = []) => tx.getAllAsync(sql, params),
        });
        await tx.execAsync("COMMIT;");
      } catch (error) {
        try {
          await tx.execAsync("ROLLBACK;");
        } catch {
          /* 保留最初的错误。 */
        }
        throw error;
      } finally {
        await tx.closeAsync();
      }
    },
  };
  try {
    return await createRepository(adapter);
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

let repositoryPromise: Promise<Repository> | undefined;
export function openRepository(): Promise<Repository> {
  if (!repositoryPromise) {
    repositoryPromise = import("expo-sqlite")
      .then(createNativeRepository)
      .catch((error: unknown) => {
        repositoryPromise = undefined;
        throw error;
      });
  }
  return repositoryPromise;
}
