import { checkStream } from "./streamProbe";

export const CHECK_CONCURRENCY = 4;

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
}

/** 限制并发数的批量检测；停止时只返回已完成的结果。 */
export async function checkChannels(
  targets: CheckTarget[],
  options: {
    signal: AbortSignal;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    check?: (url: string, signal: AbortSignal) => Promise<boolean>;
  },
): Promise<CheckResult[]> {
  const check = options.check ?? checkStream;
  const results: CheckResult[] = [];
  let next = 0;
  const worker = async () => {
    while (!options.signal.aborted && next < targets.length) {
      const target = targets[next++];
      const ok = await check(target.streamUrl, options.signal);
      if (options.signal.aborted) return;
      results.push({ channelId: target.id, streamUrl: target.streamUrl, ok });
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
