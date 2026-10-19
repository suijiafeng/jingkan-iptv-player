import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { AppState } from "react-native";
import type { Repository } from "../../data/repository";
import type { Source } from "../../domain/types";
import { ImportIOError } from "../../data/importIO";
import { isIptvOrgId } from "../../domain/channelFacets";
import {
  AvailabilitySaveError,
  checkAvailability,
} from "../source/availabilityCoordinator";
import { lookupIptvOrgLanguages } from "../source/iptvOrgLanguages";
import type { CheckProgress, CheckSummary } from "../source/availability";

/**
 * 用户从来源管理中启动的单来源任务，包括可用性检测和 iptv-org 语言查询。
 * 两者使用与导入相同的网络许可检查，并在撤销许可时停止。
 */
export function useSourceTasks({
  repo,
  setError,
  mounted,
  remoteRef,
  permissionEpoch,
  guardRemote,
  checkNetwork,
  changed,
}: {
  repo: Repository | null;
  setError: (message: string) => void;
  mounted: MutableRefObject<boolean>;
  remoteRef: MutableRefObject<boolean>;
  permissionEpoch: MutableRefObject<number>;
  guardRemote: (signal?: AbortSignal) => Promise<boolean>;
  checkNetwork: (signal?: AbortSignal) => Promise<boolean>;
  changed: () => void;
}) {
  const [check, setCheck] = useState<CheckProgress | null>(null),
    [checkSummaries, setCheckSummaries] = useState<
      Record<string, CheckSummary>
    >({}),
    // iptv-org 语言查询（由用户触发，只下载一次）。
    [languageLookup, setLanguageLookup] = useState<string | null>(null),
    [languageMessages, setLanguageMessages] = useState<Record<string, string>>(
      {},
    );
  const checkController = useRef<AbortController | null>(null),
    languageController = useRef<AbortController | null>(null),
    checkGeneration = useRef(0);

  useEffect(
    () => () => {
      checkController.current?.abort();
      languageController.current?.abort();
    },
    [],
  );

  const stopCheck = useCallback(() => {
    checkController.current?.abort();
    checkController.current = null;
    setCheck(null);
  }, []);
  const stopLanguageLookup = useCallback(() => {
    languageController.current?.abort();
    languageController.current = null;
    setLanguageLookup(null);
  }, []);

  /** 从 iptv-org 数据库补全此来源中符合 iptv-org 格式频道的缺失语言。联网限制与其它远程请求一致。 */
  const runLanguageLookup = async (source: Source) => {
    if (!repo || languageController.current) return;
    const abort = new AbortController();
    languageController.current = abort;
    const epoch = permissionEpoch.current;
    const current = () =>
      mounted.current &&
      languageController.current === abort &&
      !abort.signal.aborted &&
      epoch === permissionEpoch.current;
    const say = (message: string) =>
      setLanguageMessages((all) => ({ ...all, [source.id]: message }));
    setLanguageLookup(source.id);
    try {
      if (!(await guardRemote(abort.signal)) || !current()) return;
      if (!(await checkNetwork(abort.signal)) || !current()) return;
      const targets = (
        await repo.listChannels({ sourceId: source.id, includeVariants: true })
      ).filter(
        (channel) => isIptvOrgId(channel.tvgId) && !channel.languages?.length,
      );
      if (!current()) return;
      if (!targets.length) {
        say("没有需要补全的频道");
        return;
      }
      const found = await lookupIptvOrgLanguages(
        new Set(targets.map((channel) => channel.tvgId!)),
        abort.signal,
      );
      if (!current()) return;
      const changedCount = await repo.saveLookedUpLanguages(
        targets.flatMap((channel) => {
          const languages = found.get(channel.tvgId!);
          return languages
            ? [{ channelId: channel.id, tvgId: channel.tvgId!, languages }]
            : [];
        }),
      );
      say(`已补全 ${changedCount} 个频道的语言`);
      changed();
    } catch (failure) {
      if (mounted.current && epoch === permissionEpoch.current)
        say(
          failure instanceof Error && failure.message
            ? failure.message
            : "语言补全未完成，请稍后重试",
        );
    } finally {
      if (languageController.current === abort) {
        languageController.current = null;
        setLanguageLookup(null);
      }
    }
  };

  /** 由用户手动启动，对单个来源的频道进行可用性检测。 */
  const runCheck = async (source: Source, force = false) => {
    if (!repo || checkController.current || AppState.currentState !== "active")
      return;
    const abort = new AbortController();
    checkController.current = abort;
    const task = ++checkGeneration.current;
    const epoch = permissionEpoch.current;
    const current = () => mounted.current && task === checkGeneration.current;
    const allowed = () =>
      current() &&
      checkController.current === abort &&
      !abort.signal.aborted &&
      remoteRef.current &&
      epoch === permissionEpoch.current &&
      AppState.currentState === "active";
    const stillPermitted = () =>
      current() && epoch === permissionEpoch.current && remoteRef.current;
    setError("");
    setCheck({ sourceId: source.id, done: 0, total: null });
    try {
      if (!(await guardRemote(abort.signal)) || !allowed()) return;
      const targets = await repo.listChannels({
        sourceId: source.id,
        includeVariants: true,
      });
      if (!allowed()) return;
      const { results, skipped } = await checkAvailability(repo, targets, {
        signal: abort.signal,
        force,
        isPermitted: stillPermitted,
        beforeRequests: async () =>
          (await checkNetwork(abort.signal)) && allowed(),
        onProgress: (done, total) => {
          if (allowed()) setCheck({ sourceId: source.id, done, total });
        },
      });
      // 手动停止可以保存已完成的结果，但较新的检测任务或许可撤销
      // 会使当前任务过期，之后不得发布结果。
      if (skipped || !stillPermitted()) return;
      if (!stillPermitted()) return;
      const reachable = results.filter((result) => result.ok).length;
      setCheckSummaries((all) => ({
        ...all,
        [source.id]: {
          ok: reachable,
          unreachable: results.length - reachable,
          stopped: abort.signal.aborted,
        },
      }));
      changed();
    } catch (failure) {
      if (
        current() &&
        (failure instanceof AvailabilitySaveError || !abort.signal.aborted) &&
        epoch === permissionEpoch.current
      )
        setError(
          failure instanceof AvailabilitySaveError
            ? failure.message
            : failure instanceof ImportIOError
              ? failure.message
              : "检测未完成，可重新检测",
        );
    } finally {
      if (checkController.current === abort) {
        checkController.current = null;
        setCheck(null);
      }
    }
  };

  /** 停止即将删除的来源所关联的所有运行任务。 */
  const stopForSource = (sourceId: string) => {
    if (check?.sourceId === sourceId) stopCheck();
    if (languageLookup === sourceId) stopLanguageLookup();
  };

  return {
    check,
    checkSummaries,
    clearCheckSummaries: () => setCheckSummaries({}),
    languageLookup,
    languageMessages,
    runCheck,
    runLanguageLookup,
    stopCheck,
    stopLanguageLookup,
    stopForSource,
  };
}
