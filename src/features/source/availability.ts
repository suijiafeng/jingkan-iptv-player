import { fetch as expoFetch } from "expo/fetch";

export const CHECK_TIMEOUT_MS = 8000;
export const CHECK_CONCURRENCY = 4;

export interface CheckTarget {
  id: string;
  streamUrl: string;
}
export interface CheckResult {
  channelId: string;
  streamUrl: string;
  ok: boolean;
}

/** 只能由用户触发。每个地址只发起一次 Range 0-1023 请求：“ok”只表示服务器返回成功状态，不代表流媒体可解码或播放。 */
export async function checkStream(
  url: string,
  signal: AbortSignal,
): Promise<boolean> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort);
  if (signal.aborted) abort();
  const timer = setTimeout(abort, CHECK_TIMEOUT_MS);
  try {
    const response = await expoFetch(url, {
      signal: controller.signal,
      headers: { Range: "bytes=0-1023" },
    });
    void response.body?.cancel().catch(() => {});
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.abort();
  }
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
