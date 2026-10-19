import { useEffect, useRef, useState } from "react";
import * as Network from "expo-network";
import { openRepository, Repository } from "../../data/repository";
import { ImportIOError } from "../../data/importIO";
import { confirm, RISK } from "../common/confirm";
import { isOffline, mightUseMobileData } from "../player/playbackController";
import type { Tab } from "../channel/ChannelListParts";

/** 布尔设置立即显示新值，保存失败时回退。 */
export type SavedToggleKey =
  "mobileWarning" | "swipeReverse" | "skipUnreachable" | "backgroundPlayback";

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
    [skipUnreachable, setSkipUnreachable] = useState(true),
    [artworkAllowed, setArtworkAllowed] = useState(false),
    [artworkSaving, setArtworkSaving] = useState(false),
    [artworkRevokePending, setArtworkRevokePending] = useState(false),
    // 一次确认覆盖当前可能计费的连接，重新连上 Wi-Fi 后重置。
    [mobileAccepted, setMobileAccepted] = useState(false);
  const mounted = useRef(true),
    preserveTabOnReload = useRef(false),
    remoteRef = useRef(false),
    // 撤销许可时递增；基于旧许可世代启动的异步任务会停止。
    permissionEpoch = useRef(0),
    artworkMutation = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    openRepository()
      .then(async (opened) => {
        const allowed = await opened.getSetting("remoteAllowed", false);
        const warning = await opened.getSetting("mobileWarning", true);
        const background = await opened.getSetting("backgroundPlayback", false);
        const reverse = await opened.getSetting("swipeReverse", false);
        const skipDead = await opened.getSetting("skipUnreachable", true);
        const artwork = await opened.getSetting("artworkAllowed", false);
        const favorites = await opened.listChannels({ mode: "favorites" });
        if (active) {
          remoteRef.current = allowed;
          setRemoteAllowed(allowed);
          setMobileWarning(warning);
          setBackgroundPlayback(background);
          setSwipeReverse(reverse);
          setSkipUnreachable(skipDead);
          setArtworkAllowed(artwork);
          if (!preserveTabOnReload.current)
            setTab(favorites.length ? "favorites" : "all");
          preserveTabOnReload.current = false;
          setRepo(opened);
        }
      })
      .catch(() => {
        if (active) setError("本地资料未能打开。可以重试，不会自动清空数据。");
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
      setError("联网许可撤销尚未保存，请先在设置中重试保存撤销。");
      return false;
    }
    const epoch = permissionEpoch.current;
    const accepted = await confirm(
      "允许访问节目来源？",
      RISK,
      "了解风险并允许",
    );
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
      setError("无法保存网络许可，请重试");
      return false;
    }
    if (epoch !== permissionEpoch.current || !mounted.current) return false;
    remoteRef.current = true;
    setRemoteAllowed(true);
    return true;
  };

  const checkNetwork = async (signal?: AbortSignal) => {
    const network = await Network.getNetworkStateAsync();
    if (signal?.aborted) return false;
    if (isOffline(network))
      throw new ImportIOError("当前没有可用网络，请连接后重试");
    // 与播放采用相同规则：VPN 或未知网络也可能按流量计费。
    if (mobileWarning && !mobileAccepted && mightUseMobileData(network)) {
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
        const accepted = await confirm(
          "显示频道台标？",
          "将加载节目单提供的 HTTPS 台标，图片服务器会看到你的访问 IP，可能消耗移动数据。仅用于显示台标，不提供节目封面；缺图或失败时显示频道首字。原生图片请求可能跟随服务端重定向，无法保证后续连接仍是 HTTPS。可随时在设置中关闭。",
          "允许显示",
        );
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
        setError(
          enabled
            ? "台标许可未能保存，请重试"
            : "台标已关闭，但设置未能保存，重启前请重试关闭",
        );
    } finally {
      artworkMutation.current = false;
      if (mounted.current) setArtworkSaving(false);
    }
  };

  const toggleSetters: Record<SavedToggleKey, (value: boolean) => void> = {
    mobileWarning: setMobileWarning,
    backgroundPlayback: setBackgroundPlayback,
    swipeReverse: setSwipeReverse,
    skipUnreachable: setSkipUnreachable,
  };
  const saveToggle = (key: SavedToggleKey, value: boolean) => {
    const setValue = toggleSetters[key];
    setValue(value);
    void repo?.setSetting(key, value).catch(() => {
      setValue(!value);
      setError("设置保存失败");
    });
  };

  const changeBackgroundPlayback = async (enabled: boolean) => {
    if (!repo || backgroundSaving || enabled === backgroundPlayback) return;
    if (enabled) {
      const accepted = await confirm(
        "允许后台播放？",
        "切换应用或锁屏后仍会继续联网播放，并显示系统媒体控制；这会持续耗电和使用流量。仅在你明确需要时开启。",
        "允许后台播放",
      );
      if (!accepted || !mounted.current) return;
    }
    setBackgroundSaving(true);
    setBackgroundPlayback(enabled);
    try {
      await repo.setSetting("backgroundPlayback", enabled);
    } catch {
      if (mounted.current) {
        setBackgroundPlayback(!enabled);
        setError("后台播放设置保存失败，请重试");
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

  /** 执行“清空全部”后，将所有设置恢复为首次运行的默认值。 */
  const resetToDefaults = () => {
    setRevokePending(false);
    setMobileWarning(true);
    setBackgroundPlayback(false);
    setMobileAccepted(false);
    setSwipeReverse(false);
    setSkipUnreachable(true);
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
    skipUnreachable,
    artworkAllowed,
    artworkSaving,
    artworkRevokePending,
    /** 只有台标专属许可和当前联网许可同时有效时，才加载台标。 */
    artworkEnabled: artworkAllowed && remoteAllowed && !revokePending,
    guardRemote,
    checkNetwork,
    changeArtwork,
    saveToggle,
    changeBackgroundPlayback,
    withdrawRemote,
    resetToDefaults,
  };
}

export type AppSettings = ReturnType<typeof useAppSettings>;
