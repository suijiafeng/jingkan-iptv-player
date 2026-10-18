import { useCallback, useEffect, useRef, useState } from "react";
import * as Network from "expo-network";
import type { Channel } from "../../domain/types";
import { isOffline, mightUseMobileData } from "../player/playbackController";
import { checkChannels, type CheckResult } from "../source/availability";

/** 每次切换内容分类时最多检测这些频道。 */
export const AUTO_CHECK_MAX = 200;
/** 比此时间更近的检测结果，不会再次检测。 */
export const CHECK_FRESH_MS = 6 * 60 * 60 * 1000;

export interface AutoCheckOptions {
  /** 标识当前分类；null 表示未选择分类。 */
  filterKey: string | null;
  /** filterKey 对应的整个结果集已经加载完毕。 */
  listComplete: boolean;
  channels: readonly Channel[];
  /** 其他操作需要网络时暂停，例如正在播放。 */
  paused: boolean;
  remoteAllowed: boolean;
  mobileWarning: boolean;
  mobileAccepted: boolean;
  save: (results: CheckResult[]) => Promise<void>;
  /** 一轮检测完成且未被取消后调用一次，用于重新排序。 */
  onFinished: () => void;
}

/** 切换内容分类后，在后台静默检测可用性，不弹确认；缺少许可、离线或尚未确认使用计费网络时不运行。切换分类、开始播放或调用 cancel() 都会停止该任务。 */
export function useAutoAvailabilityCheck(options: AutoCheckOptions) {
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  // 记录本轮已经尝试的地址：在 CHECK_FRESH_MS 内绝不重复检测，即使
  // 即使保存失败，也不能因检测结束后的重新加载而立即开始下一轮检测。
  const attempted = useRef(new Map<string, number>());
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setProgress(null);
  }, []);
  const {
    filterKey,
    listComplete,
    paused,
    remoteAllowed,
    mobileWarning,
    mobileAccepted,
  } = options;
  useEffect(() => {
    if (filterKey === null || !listComplete || paused || !remoteAllowed) return;
    const now = Date.now();
    const targets = latest.current.channels
      .filter(
        (channel) =>
          channel.active &&
          (!channel.checkedAt || now - channel.checkedAt > CHECK_FRESH_MS) &&
          now - (attempted.current.get(channel.id) ?? 0) > CHECK_FRESH_MS,
      )
      .slice(0, AUTO_CHECK_MAX);
    if (!targets.length) return;
    const abortController = new AbortController();
    controller.current?.abort();
    controller.current = abortController;
    const run = async () => {
      const net = await Network.getNetworkStateAsync();
      if (abortController.signal.aborted || isOffline(net)) return;
      if (mobileWarning && !mobileAccepted && mightUseMobileData(net)) return;
      for (const target of targets) attempted.current.set(target.id, now);
      setProgress({ done: 0, total: targets.length });
      const results = await checkChannels(targets, {
        signal: abortController.signal,
        onProgress: (done, total) => {
          if (!abortController.signal.aborted) setProgress({ done, total });
        },
      });
      if (results.length) await latest.current.save(results);
      // 只在检测结束后统一重新排序，避免检测过程中列表在用户手指下移动。
      if (!abortController.signal.aborted) latest.current.onFinished();
    };
    run()
      .catch(() => {})
      .finally(() => {
        if (controller.current === abortController) {
          controller.current = null;
          setProgress(null);
        }
      });
    return () => abortController.abort();
  }, [
    filterKey,
    listComplete,
    paused,
    remoteAllowed,
    mobileWarning,
    mobileAccepted,
  ]);
  return { progress, cancel };
}
