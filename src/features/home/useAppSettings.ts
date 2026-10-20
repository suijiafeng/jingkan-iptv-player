import { useEffect, useRef, useState } from "react";
import * as Network from "expo-network";
import { openRepository, Repository } from "../../data/repository";
import { ImportIOError } from "../../data/importIO";
import { confirm } from "../common/confirm";
import { askConsent } from "../common/ConsentDialog";
import { ARTWORK_CONSENT, BACKGROUND_CONSENT } from "../common/consents";
import { isOffline, mightUseMobileData } from "../player/playbackController";
import type { Tab } from "../channel/ChannelListParts";

/** 布尔设置立即显示新值，保存失败时回退。 */
export type SavedToggleKey =
  "mobileWarning" | "swipeReverse" | "miniPlayer" | "backgroundPlayback";

/**
 * 打开本地数据库，并持有设置与网络许可；
 * 首页的其它部分在联网之前都会检查这些状态。
 */
export function useAppSettings({
  setError,
  setTab,
}: {
  setError: (message: string) => void;
  setTab: (tab: Tab) => void;
}) {
  const [repo, setRepo] = useState<Repository | null>(null),
    [startupAttempt, setStartupAttempt] = useState(0),
    [remoteAllowed, setRemoteAllowed] = useState(false),
    [revokePending, setRevokePending] = useState(false),
    [mobileWarning, setMobileWarning] = useState(true),
    [backgroundPlayback, setBackgroundPlayback] = useState(false),
    [backgroundSaving, setBackgroundSaving] = useState(false),
    [swipeReverse, setSwipeReverse] = useState(false),
    // 离开播放器时，将其停靠为小浮窗。
    [miniPlayer, setMiniPlayer] = useState(true),
    [artworkAllowed, setArtworkAllowed] = useState(false),
    [artworkSaving, setArtworkSaving] = useState(false),
    [artworkRevokePending, setArtworkRevokePending] = useState(false),
    [guideOrigin, setGuideOrigin] = useState<"firstRun" | "settings" | null>(
      null,
    ),
    // 一次确认覆盖当前可能计费的连接，重新连上 Wi-Fi 后重置。
    [mobileAccepted, setMobileAcceptedState] = useState(false),
    // 网络许可对话框：隐藏时为 null，否则表示是否同时
    // 同时作为移动数据使用确认。
    [consentCellular, setConsentCellular] = useState<boolean | null>(null);
  const mounted = useRef(true),
    consentAnswer = useRef<((allowed: boolean) => void) | null>(null),
    // 供同一任务中紧接知情确认执行的检查读取，早于
    // 重新渲染才会让它们拿到新状态。
    mobileAcceptedRef = useRef(false),
    preserveTabOnReload = useRef(false),
    remoteRef = useRef(false),
    // 撤销许可时递增；基于旧许可世代启动的异步任务会停止。
    permissionEpoch = useRef(0),
    artworkMutation = useRef(false);

  const setMobileAccepted = (accepted: boolean) => {
    mobileAcceptedRef.current = accepted;
    setMobileAcceptedState(accepted);
  };

  useEffect(() => {
    mounted.current = true;
    let active = true;
    openRepository()
      .then(async (opened) => {
        const allowed = await opened.getSetting("remoteAllowed", false);
        const warning = await opened.getSetting("mobileWarning", true);
        const background = await opened.getSetting("backgroundPlayback", false);
        const reverse = await opened.getSetting("swipeReverse", false);
        const docking = await opened.getSetting("miniPlayer", true);
        const artwork = await opened.getSetting("artworkAllowed", false);
        const favorites = await opened.listChannels({ mode: "favorites" });
        const guideSeen = await opened.getSetting("guideSeen", false);
        if (active) {
          remoteRef.current = allowed;
          setRemoteAllowed(allowed);
          setMobileWarning(warning);
          setBackgroundPlayback(background);
          setSwipeReverse(reverse);
          setMiniPlayer(docking);
          setArtworkAllowed(artwork);
          // 只在真正首次运行时显示；已添加来源的用户跳过
          // 此操作；这项检查不会阻塞主页面的打开。
          if (!guideSeen)
            void opened
              .listSources()
              .then((saved) => {
                if (active && !saved.length) setGuideOrigin("firstRun");
              })
              .catch(() => undefined);
          if (!preserveTabOnReload.current)
            setTab(favorites.length ? "favorites" : "all");
          preserveTabOnReload.current = false;
          setRepo(opened);
        }
      })
      .catch(() => {
        if (active) setError("本地资料未能打开，数据未清空");
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [startupAttempt, setError, setTab]);

  useEffect(() => {
    const subscription = Network.addNetworkStateListener((network) => {
      if (!isOffline(network) && !mightUseMobileData(network))
        setMobileAccepted(false);
    });
    return () => subscription.remove();
  }, []);

  const guardRemote = async (signal?: AbortSignal) => {
    if (signal?.aborted) return false;
    if (remoteRef.current) return true;
    if (revokePending) {
      setError("请先在设置中完成撤销联网许可");
      return false;
    }
    const epoch = permissionEpoch.current;
    // 使用移动数据时，联网许可也涵盖流量提醒，只询问一次
    // 首次播放只需要一次确认，避免连续询问两次。
    const network = await Network.getNetworkStateAsync().catch(() => null);
    const cellular =
      mobileWarning &&
      !mobileAcceptedRef.current &&
      !!network &&
      !isOffline(network) &&
      mightUseMobileData(network);
    const accepted = await new Promise<boolean>((resolve) => {
      consentAnswer.current?.(false);
      consentAnswer.current = resolve;
      setConsentCellular(cellular);
    });
    if (
      !accepted ||
      !repo ||
      signal?.aborted ||
      epoch !== permissionEpoch.current ||
      !mounted.current
    )
      return false;
    try {
      await repo.setSetting("remoteAllowed", true);
    } catch {
      setError("联网许可未保存，请重试");
      return false;
    }
    if (epoch !== permissionEpoch.current || !mounted.current) return false;
    remoteRef.current = true;
    setRemoteAllowed(true);
    if (cellular) setMobileAccepted(true);
    return true;
  };

  const checkNetwork = async (signal?: AbortSignal) => {
    const network = await Network.getNetworkStateAsync();
    if (signal?.aborted) return false;
    if (isOffline(network))
      throw new ImportIOError("当前没有可用网络，请连接后重试");
    // 与播放采用相同规则：VPN 或未知网络也可能按流量计费。
    if (
      mobileWarning &&
      !mobileAcceptedRef.current &&
      mightUseMobileData(network)
    ) {
      const accepted = await confirm(
        "可能使用移动数据？",
        "下载节目单或播放直播会消耗流量。确认后，在连回 Wi-Fi 之前不再询问。",
        "继续",
      );
      if (signal?.aborted) return false;
      if (accepted) setMobileAccepted(true);
      return accepted;
    }
    return true;
  };

  const changeArtwork = async (enabled: boolean) => {
    if (!repo || artworkMutation.current) return;
    artworkMutation.current = true;
    setArtworkSaving(true);
    const epoch = permissionEpoch.current;
    try {
      if (enabled) {
        if (!remoteRef.current || revokePending || artworkRevokePending) return;
        const accepted = (await askConsent(ARTWORK_CONSENT)) === "allow";
        if (
          !accepted ||
          epoch !== permissionEpoch.current ||
          !remoteRef.current ||
          !mounted.current
        )
          return;
      } else {
        // 立即停止可见请求，即使撤销许可暂时未能写入数据库。
        setArtworkAllowed(false);
        setArtworkRevokePending(true);
      }
      await repo.setSetting("artworkAllowed", enabled);
      if (mounted.current && epoch === permissionEpoch.current) {
        setArtworkAllowed(enabled);
        setArtworkRevokePending(false);
      }
    } catch {
      if (mounted.current)
        setError(enabled ? "台标开启未保存，请重试" : "台标关闭未保存，请重试");
    } finally {
      artworkMutation.current = false;
      if (mounted.current) setArtworkSaving(false);
    }
  };

  const toggleSetters: Record<SavedToggleKey, (value: boolean) => void> = {
    mobileWarning: setMobileWarning,
    backgroundPlayback: setBackgroundPlayback,
    swipeReverse: setSwipeReverse,
    miniPlayer: setMiniPlayer,
  };
  const saveToggle = (key: SavedToggleKey, value: boolean) => {
    const setValue = toggleSetters[key];
    setValue(value);
    void repo?.setSetting(key, value).catch(() => {
      setValue(!value);
      setError("设置未保存，请重试");
    });
  };

  const changeBackgroundPlayback = async (enabled: boolean) => {
    if (!repo || backgroundSaving || enabled === backgroundPlayback) return;
    if (enabled) {
      const accepted = (await askConsent(BACKGROUND_CONSENT)) === "allow";
      if (!accepted || !mounted.current) return;
    }
    setBackgroundSaving(true);
    setBackgroundPlayback(enabled);
    try {
      await repo.setSetting("backgroundPlayback", enabled);
    } catch {
      if (mounted.current) {
        setBackgroundPlayback(!enabled);
        setError("后台播放设置未保存，请重试");
      }
    } finally {
      if (mounted.current) setBackgroundSaving(false);
    }
  };

  /** 先在内存中撤销联网许可，阻止任何新联网操作。 */
  const withdrawRemote = () => {
    permissionEpoch.current++;
    remoteRef.current = false;
    setRemoteAllowed(false);
    setRevokePending(true);
  };

  /**
   * 永久关闭引导；保存失败只会使下次启动再次显示，
   * 因此不单独报告这个错误。
   */
  const finishGuide = () => {
    setGuideOrigin(null);
    void repo?.setSetting("guideSeen", true).catch(() => undefined);
  };

  /** 执行“清空全部”后，将所有设置恢复为首次运行的默认值。 */
  const resetToDefaults = () => {
    setRevokePending(false);
    setMobileWarning(true);
    setBackgroundPlayback(false);
    setMobileAccepted(false);
    setSwipeReverse(false);
    setMiniPlayer(true);
    setArtworkAllowed(false);
    setArtworkRevokePending(false);
  };

  return {
    repo,
    retryStartup: () => setStartupAttempt((attempt) => attempt + 1),
    reloadSettings: () => {
      preserveTabOnReload.current = true;
      setStartupAttempt((attempt) => attempt + 1);
    },
    mounted,
    remoteRef,
    permissionEpoch,
    remoteAllowed,
    revokePending,
    setRevokePending,
    mobileWarning,
    backgroundPlayback,
    backgroundSaving,
    mobileAccepted,
    setMobileAccepted,
    swipeReverse,
    miniPlayer,
    artworkAllowed,
    artworkSaving,
    artworkRevokePending,
    /** 只有台标专属许可和当前联网许可同时有效时，才加载台标。 */
    artworkEnabled: artworkAllowed && remoteAllowed && !revokePending,
    guardRemote,
    /** 是否显示许可对话框，以及是否显示移动数据说明行。 */
    consentCellular,
    answerConsent: (allowed: boolean) => {
      const answer = consentAnswer.current;
      consentAnswer.current = null;
      setConsentCellular(null);
      answer?.(allowed);
    },
    checkNetwork,
    changeArtwork,
    saveToggle,
    changeBackgroundPlayback,
    withdrawRemote,
    resetToDefaults,
    guideVisible: guideOrigin !== null,
    /** 从“设置 › 使用指引”打开时，引导页左上角提供返回。 */
    guideFromSettings: guideOrigin === "settings",
    showGuide: () => setGuideOrigin("settings"),
    finishGuide,
  };
}

export type AppSettings = ReturnType<typeof useAppSettings>;
