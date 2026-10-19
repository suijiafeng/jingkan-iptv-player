/** 跟随父信号、并在超过时间限制后中止的子信号。 */
export interface Deadline {
  readonly signal: AbortSignal;
  /** 仅由时间上限而非父信号终止任务时返回 true。 */
  readonly timedOut: boolean;
  /** 提前结束工作，例如由另一个更短的计时器触发。 */
  abort(): void;
  /** 必须在 `finally` 中调用，清除计时器并解除父信号绑定。 */
  close(): void;
}

export function linkedDeadline(
  parent: AbortSignal,
  milliseconds: number,
): Deadline {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort);
  if (parent.aborted) abort();
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) timedOut = true;
    abort();
  }, milliseconds);
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    abort,
    close() {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
      abort();
    },
  };
}

/** 等待指定时间；信号触发时立即返回，永不拒绝 Promise。 */
export function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done);
    if (signal.aborted) done();
  });
}

/** 随任务完成而解析；若信号先触发，则立即以 undefined 解析，避免已取消的调用方继续等待无法中止的任务，例如系统查询或对话框。任务本身仍会继续运行。 */
export async function untilAborted<T>(
  task: Promise<T>,
  signal: AbortSignal,
): Promise<T | undefined> {
  let abort!: () => void;
  const cancelled = new Promise<undefined>((resolve) => {
    abort = () => resolve(undefined);
    signal.addEventListener("abort", abort);
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([task, cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
