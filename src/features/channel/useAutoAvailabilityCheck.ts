import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import type { Channel } from "../../domain/types";
import { isOffline, mightUseMobileData } from "../player/playbackController";
import {
  checkAvailability,
  type CheckStore,
} from "../source/availabilityCoordinator";

/** 每次切换内容分类时最多检测这些频道。 */
export const AUTO_CHECK_MAX = 200;

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
  repo: CheckStore | null;
  /** 一轮检测完成且未被取消后调用一次，用于重新排序。 */
  onFinished: () => void;
  onError: (message: string) => void;
}

/** 切换内容分类后，在后台静默检测可用性，不弹确认；缺少许可、离线或尚未确认使用计费网络时不运行。切换分类、开始播放或调用 cancel() 都会停止该任务。 */
export function useAutoAvailabilityCheck(options: AutoCheckOptions) {
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastFilter = useRef<string | null>(null);
  const completedFilter = useRef<string | null>(null);
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
    repo,
  } = options;
  useEffect(() => {
    if (lastFilter.current !== filterKey) {
      lastFilter.current = filterKey;
      completedFilter.current = null;
    }
    if (
      filterKey === null ||
      !listComplete ||
      paused ||
      !remoteAllowed ||
      !repo ||
      completedFilter.current === filterKey
    )
      return;
    const targets = latest.current.channels.filter((channel) => channel.active);
    if (!targets.length) return;
    const abortController = new AbortController();
    controller.current?.abort();
    controller.current = abortController;
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") abortController.abort();
    });
    const run = async () => {
      const { refreshed, skipped } = await checkAvailability(repo, targets, {
        signal: abortController.signal,
        maxRequests: AUTO_CHECK_MAX,
        beforeRequests: async () => {
          const net = await Network.getNetworkStateAsync();
          return (
            !abortController.signal.aborted &&
            !isOffline(net) &&
            !(mobileWarning && !mobileAccepted && mightUseMobileData(net))
          );
        },
        isPermitted: () =>
          !abortController.signal.aborted &&
          latest.current.remoteAllowed &&
          AppState.currentState === "active",
        onProgress: (done, total) => {
          if (!abortController.signal.aborted) setProgress({ done, total });
        },
      });
      // 只在检测结束后统一重新排序，避免检测过程中列表在用户手指下移动。
      if (!abortController.signal.aborted && !skipped) {
        completedFilter.current = filterKey;
        if (refreshed) latest.current.onFinished();
      }
    };
    run()
      .catch(() => {
        if (!abortController.signal.aborted)
          latest.current.onError("连通测试未完成，可在来源管理中重试");
      })
      .finally(() => {
        if (controller.current === abortController) {
          controller.current = null;
          setProgress(null);
        }
      });
    return () => {
      app.remove();
      abortController.abort();
    };
  }, [
    filterKey,
    listComplete,
    paused,
    remoteAllowed,
    mobileWarning,
    mobileAccepted,
    repo,
  ]);
  return { progress, cancel };
}
