import type { StoredCheck } from "../../data/availability";
import { untilAborted } from "../../lib/abort";
import type { Repository } from "../../data/repository";
import {
  checkChannels,
  type CheckResult,
  type CheckTarget,
} from "./availability";

export type CheckStore = Pick<
  Repository,
  "getCheckResults" | "saveCheckResults"
>;
export class AvailabilitySaveError extends Error {
  constructor() {
    super("测试结果未保存，可重新测试");
  }
}
interface Options {
  signal: AbortSignal;
  isPermitted: () => boolean;
  beforeRequests?: () => Promise<boolean>;
  force?: boolean;
  maxRequests?: number;
  /**
   * 同时执行的检测数，在 beforeRequests 通过后读取；调用方根据
   * 该步骤获取的网络类型选择并发数。
   */
  concurrency?: () => number;
  onProgress?: (done: number, total: number) => void;
  /** 判断结果新鲜度所用的时钟；测试时注入固定时间。 */
  now?: () => number;
}

/** 地址检测成功后，一天内复用结果，之后才再次探测。 */
export const OK_RESULT_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * 故障往往是暂时的，例如服务器重启或令牌轮换。不可达标记会让频道排到
 * 列表末尾，并在换台时跳过，因此该标记应更早过期。
 */
export const UNREACHABLE_RESULT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * 每完成指定数量就写入一次结果。即使系统中途结束检测，
 * 已完成的结果仍能保留，下次可从剩余部分继续。
 */
export const CHECK_SAVE_BATCH = 100;

/** 时钟回退会使结果年龄不可知，因此需要重新探测。 */
function isFresh(entry: StoredCheck, now: number): boolean {
  const age = now - entry.checkedAt;
  const ttl =
    entry.checkStatus === "ok" ? OK_RESULT_TTL_MS : UNREACHABLE_RESULT_TTL_MS;
  return age >= 0 && age < ttl;
}

/** 每个已打开数据库共用一个队列，由全部 UI 入口共享。 */
const queues = new WeakMap<CheckStore, Promise<void>>();

export async function checkAvailability(
  store: CheckStore,
  targets: readonly CheckTarget[],
  options: Options,
): Promise<{ results: CheckResult[]; refreshed: boolean; skipped?: boolean }> {
  const previous = queues.get(store) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  queues.set(store, tail);
  await previous;
  try {
    if (options.signal.aborted || !options.isPermitted())
      return { results: [], refreshed: false };
    const unique = [
      ...new Map(targets.map((target) => [target.streamUrl, target])).values(),
    ];
    const stored = await store.getCheckResults(
      unique.map((target) => target.streamUrl),
    );
    if (options.signal.aborted || !options.isPermitted())
      return { results: [], refreshed: false };
    // 复用尚未过期的持久化结果；已过期结果以及显式强制
    // 再次执行可用性探测。
    const now = (options.now ?? Date.now)();
    const cached = new Map(
      stored
        .filter((entry) => isFresh(entry, now))
        .map((entry) => [entry.streamUrl, entry]),
    );
    const reused: CheckResult[] = [];
    const pending: CheckTarget[] = [];
    for (const target of unique) {
      const entry = options.force ? undefined : cached.get(target.streamUrl);
      if (entry)
        reused.push({
          channelId: target.id,
          streamUrl: target.streamUrl,
          ok: entry.checkStatus === "ok",
        });
      else pending.push(target);
    }
    const selected = pending.slice(0, options.maxRequests ?? pending.length);
    const total = reused.length + selected.length;
    options.onProgress?.(reused.length, total);
    if (
      selected.length &&
      (!(await untilAborted(
        options.beforeRequests?.() ?? Promise.resolve(true),
        options.signal,
      )) ||
        options.signal.aborted ||
        !options.isPermitted())
    )
      return { results: reused, refreshed: false, skipped: true };
    // 探测继续执行时，按顺序逐批保存；每次保存
    // 执行时检查许可，因此撤销后不会继续写入。
    const saved = new Set<CheckResult>();
    let unsaved: CheckResult[] = [],
      saving = Promise.resolve(),
      saveFailed = false;
    const save = (batch: CheckResult[]) => {
      saving = saving
        .then(async () => {
          if (saveFailed || !options.isPermitted()) return;
          await store.saveCheckResults(batch);
          for (const result of batch) saved.add(result);
        })
        .catch(() => {
          saveFailed = true;
        });
    };
    const checked = selected.length
      ? await checkChannels(selected, {
          signal: options.signal,
          concurrency: options.concurrency?.(),
          onResult: (result) => {
            unsaved.push(result);
            if (unsaved.length < CHECK_SAVE_BATCH) return;
            save(unsaved);
            unsaved = [];
          },
          onProgress: (done) =>
            options.onProgress?.(reused.length + done, total),
        })
      : [];
    // 持久化期间仍占用队列；下一位调用方从 SQLite 读取
    // 在本次提交完成之后执行，而不是让第二个请求与保存操作争抢。
    await saving;
    if (saveFailed) throw new AvailabilitySaveError();
    if (!options.isPermitted()) return { results: [], refreshed: false };
    const rest = checked.filter((result) => !saved.has(result));
    if (rest.length) {
      try {
        await store.saveCheckResults(rest);
      } catch {
        throw new AvailabilitySaveError();
      }
    }
    return { results: [...reused, ...checked], refreshed: checked.length > 0 };
  } finally {
    release();
    if (queues.get(store) === tail) queues.delete(store);
  }
}
