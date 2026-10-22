import { probeStream, type StreamCheck } from "./streamProbe";

export const CHECK_CONCURRENCY = 4;
/** Wi-Fi 或以太网下，手动检测的并发探测数量加倍。 */
export const UNMETERED_CHECK_CONCURRENCY = 8;

export interface CheckTarget {
  id: string;
  streamUrl: string;
}
/** 来源管理页展示的手动批量检测任务。 */
export interface CheckProgress {
  sourceId: string;
  done: number;
  /** 仓库正在加载完整且未分组的目标集合时为 null。 */
  total: number | null;
}
export interface CheckSummary {
  ok: number;
  unreachable: number;
  stopped: boolean;
}
export interface CheckResult {
  channelId: string;
  streamUrl: string;
  ok: boolean;
  /** 本次探测开始的时间，防止迟到批次覆盖更新的播放结果。 */
  observedAt?: number;
  /** 流声明的音轨语言；未声明时缺省。 */
  languages?: string[];
}

/** 限制并发数的批量检测；停止时只返回已完成的结果。 */
export async function checkChannels(
  targets: CheckTarget[],
  options: {
    signal: AbortSignal;
    concurrency?: number;
    /** 观测时钟：每次请求开始前取值，而非请求结束时。 */
    now?: () => number;
    onProgress?: (done: number, total: number) => void;
    /** 每个结果一到达就回调，最终返回列表中使用的也是同一对象。 */
    onResult?: (result: CheckResult) => void;
    check?: (
      url: string,
      signal: AbortSignal,
    ) => Promise<boolean | StreamCheck>;
  },
): Promise<CheckResult[]> {
  const check = options.check ?? probeStream;
  const results: CheckResult[] = [];
  let next = 0;
  const worker = async () => {
    while (!options.signal.aborted && next < targets.length) {
      const target = targets[next++];
      const observedAt = (options.now ?? Date.now)();
      const answer = await check(target.streamUrl, options.signal);
      if (options.signal.aborted) return;
      const { ok, languages } =
        typeof answer === "boolean"
          ? { ok: answer, languages: undefined }
          : answer;
      const result: CheckResult = {
        channelId: target.id,
        streamUrl: target.streamUrl,
        ok,
        observedAt,
        ...(languages ? { languages } : {}),
      };
      results.push(result);
      options.onResult?.(result);
      options.onProgress?.(results.length, targets.length);
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          options.concurrency ?? CHECK_CONCURRENCY,
          targets.length,
        ),
      },
      worker,
    ),
  );
  return results;
}
