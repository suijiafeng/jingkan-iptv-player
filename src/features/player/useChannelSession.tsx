import { t } from "../../i18n/core";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AccessibilityInfo,
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Network from "expo-network";
import { colors } from "../../theme";
import type { Channel } from "../../domain/types";
import { qualityName } from "../../domain/channelSources";
import { channelTitle } from "../../domain/channelLabels";
import { MediaHandle } from "./mediaHandle";
import {
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  RefreshIcon,
  HeadphonesIcon,
  ScreenIcon,
  VolumeIcon,
} from "./playerIcons";
import { OverlayButton, SourceChip } from "./overlayWidgets";
import { sourcePosition } from "./sourceFailover";
import {
  CenterChip,
  LoadingDots,
  MobileDataPrompt,
  playerNotice,
  usePlayerNotices,
  useSlowStart,
} from "./playerStatus";
import {
  adjacentPlayableIndex,
  PlaybackController,
} from "./playbackController";
import {
  CONTROLS_FIRST_HIDE_MS,
  CONTROLS_HIDE_MS,
  descriptions,
  OSD_MS,
  sameChannel,
} from "./playerShared";
import type { SessionProps } from "./ChannelSession";

/** 计算频道会话渲染前所需的一切：播放控制器及快照、媒体句柄、控件可见性、主要操作（播放、暂停、取消或重试）、换台及共享按钮。 */
export function useChannelSession(props: SessionProps) {
  const insets = useSafeAreaInsets();
  const { sourcesOpen, onSourcesOpenChange: setSourcesOpen } = props;
  const [controller] = useState(
    () =>
      new PlaybackController({
        remoteAllowed: props.remoteAllowed,
        backgroundAllowed: props.backgroundAllowed,
        mobileWarning: props.mobileWarning,
        checkNetwork: Network.getNetworkStateAsync,
        isAppActive: () => AppState.currentState === "active",
        onStarted: () => props.onStarted(props.channel),
        onAvailability: (ok) => props.onAvailability?.(props.channel, ok),
      }),
  );
  const { onStarted, onAvailability, channel } = props;
  useEffect(() => {
    controller.setOnAvailability((ok) => onAvailability?.(channel, ok));
  }, [controller, onAvailability, channel]);
  useEffect(() => {
    controller.setOnStarted(() => onStarted(channel));
  }, [controller, onStarted, channel]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  // 每个频道会话只有一个句柄，各次尝试的原生播放器绑定到该句柄。
  const [media] = useState(() => new MediaHandle());
  const mediaInfo = useSyncExternalStore(
    media.subscribeInfo,
    media.getInfo,
    media.getInfo,
  );
  const [scrubbing, setScrubbing] = useState(false);
  // 移动数据提示中的“不再提醒”复选框，在用户继续时生效。
  const [stopReminding, setStopReminding] = useState(false);
  useEffect(() => {
    const network = Network.addNetworkStateListener((next) =>
      controller.networkChanged(next),
    );
    const app = AppState.addEventListener("change", (next) =>
      controller.appStateChanged(next),
    );
    controller.activate();
    void controller.requestPlay();
    return () => {
      network.remove();
      app.remove();
      controller.dispose();
    };
  }, [controller]);
  useEffect(() => {
    controller.setPolicy(props.remoteAllowed, props.mobileWarning);
  }, [controller, props.remoteAllowed, props.mobileWarning]);
  useEffect(() => {
    controller.setBackgroundAllowed(!!props.backgroundAllowed);
  }, [controller, props.backgroundAllowed]);
  // 未能出画面的已结束尝试只报告一次；故障切换逻辑
  // 由它决定当前频道是否还有值得尝试的其它地址。
  const { onFailure, onUserPlay } = props.failover;
  useEffect(() => {
    if (state.phase === "timeout") onFailure("timeout");
    else if (state.phase === "error") onFailure(state.failure ?? "unknown");
  }, [state.phase, state.failure, onFailure]);

  // 两种模式的覆盖控件：轻触画面切换显示；控件会自动隐藏
  // 只有真正播放时才自动隐藏，启用读屏时绝不隐藏。
  const { controlsShown, onControlsShownChange: setControlsShown } = props;
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (live) setScreenReader(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  const autoHide =
    !props.audioOnly &&
    controlsShown &&
    !props.sheetOpen &&
    !sourcesOpen &&
    !scrubbing &&
    !screenReader &&
    state.phase === "playing";
  // 新流首次显示控件时停留更久；控件一旦隐藏（由计时器
  // 或用户点击隐藏后，后续显示使用较短延迟。
  const firstShow = useRef(true);
  useEffect(() => {
    firstShow.current = true;
  }, [state.attemptId]);
  useEffect(() => {
    if (!controlsShown) firstShow.current = false;
  }, [controlsShown]);
  useEffect(() => {
    if (!autoHide) return;
    const timer = setTimeout(
      () => setControlsShown(false),
      firstShow.current ? CONTROLS_FIRST_HIDE_MS : CONTROLS_HIDE_MS,
    );
    return () => clearTimeout(timer);
  }, [autoHide, setControlsShown]);
  // 加载时保持画面简洁，方便换台；需要用户决定的状态
  // 错误、超时、暂停、移动数据确认等状态总会重新显示控件。
  const loading = ["checking", "connecting", "buffering"].includes(state.phase);
  // 系统小窗有自己的控件，应用控件会遮挡它。
  const controlsVisible =
    !mediaInfo.pictureInPicture &&
    (props.audioOnly ||
      controlsShown ||
      props.sheetOpen ||
      screenReader ||
      (state.phase !== "playing" && !loading));

  const busy = ["checking", "connecting", "playing", "buffering"].includes(
    state.phase,
  );
  const waiting = ["checking", "connecting", "buffering"].includes(state.phase);
  const starting = ["checking", "connecting"].includes(state.phase);
  const canRetry = ["offline", "timeout", "error", "ended"].includes(
    state.phase,
  );
  // 原位暂停：尝试和对应的原生播放器仍然存活。
  const retained = state.phase === "paused" && state.attemptId !== null;
  const pausedAt = useRef<number | null>(null);
  useEffect(() => {
    pausedAt.current = retained ? Date.now() : null;
  }, [retained, state.attemptId]);
  const primaryLabel =
    state.phase === "cellular"
      ? t("用流量播放")
      : starting
        ? t("取消")
        : busy
          ? t("暂停")
          : canRetry
            ? t("重试")
            : t("播放");
  const primaryAction = () => {
    // 在可能计费的网络上，点击 ▶ 就是明确选择“继续”。
    if (state.phase === "cellular") {
      if (stopReminding) props.onStopMobileReminders?.();
      props.onMobileAccepted?.();
      onUserPlay();
      void controller.requestPlay(true);
      return;
    }
    const id = state.attemptId;
    // 就地暂停，让最后一帧保留在屏幕上；支持回看的流也能
    // 保留播放位置。直播在同一个播放器上恢复，或重新连接到
    // 暂停过久后重新连接到直播边缘，详见下方逻辑。
    if (
      id !== null &&
      (state.phase === "playing" || state.phase === "buffering") &&
      media.pause()
    ) {
      if (!controller.userPaused(id)) controller.pause();
      return;
    }
    if (retained) {
      const expiredLive =
        mediaInfo.isLive &&
        pausedAt.current !== null &&
        Date.now() - pausedAt.current >= 60_000;
      if (!expiredLive && media.play()) return;
      onUserPlay();
      void controller.requestPlay();
      return;
    }
    if (busy) controller.pause();
    else {
      onUserPlay();
      void controller.requestPlay();
    }
  };
  const index = props.channels.findIndex((channel) =>
    sameChannel(channel, props.channel),
  );
  // 上一个和下一个总会跳过检测发现无法连接的频道；
  // 列表仍允许用户手动选择任意频道。
  const skip = (channel: Channel) => channel.checkStatus === "unreachable";
  const previous = adjacentPlayableIndex(props.channels, index, -1, skip);
  const next = adjacentPlayableIndex(props.channels, index, 1, skip);
  const selectNext = () => {
    if (next !== null) props.onSelect(props.channels[next]);
  };
  const title = channelTitle(props.channel.name).title;

  // 短暂显示频道名称和位置；进入全屏或到达换台边界时出现。
  const [osd, setOsd] = useState<string | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showOsd = useCallback((text: string) => {
    if (osdTimer.current !== null) clearTimeout(osdTimer.current);
    setOsd(text);
    osdTimer.current = setTimeout(() => {
      osdTimer.current = null;
      setOsd(null);
    }, OSD_MS);
  }, []);
  const position =
    index >= 0 ? `${index + 1}/${props.channels.length} · ${title}` : title;
  const arrivedFullscreen = useRef(props.fullscreen);
  useEffect(() => {
    if (arrivedFullscreen.current) showOsd(position);
    return () => {
      if (osdTimer.current !== null) clearTimeout(osdTimer.current);
    };
    // 只在进入此频道会话时执行。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const description =
    starting && props.failover.connectingTitle
      ? { ...descriptions[state.phase], title: props.failover.connectingTitle }
      : {
          title: t(descriptions[state.phase].title),
          body: t(descriptions[state.phase].body),
        };
  const pausedBody =
    state.pauseReason === "background"
      ? t("切到后台时暂停")
      : state.pauseReason === "interrupted"
        ? t("音频被其他应用占用，已暂停")
        : "";
  // 主按钮图形：暂停或停止时显示 ▶，播放时显示 ❚❚。
  // 位于画面中央；加载时此处显示圆点，而
  // 失败和移动数据确认也把各自的唯一操作放在那里。
  const showsPlay = retained || !busy;
  const primaryIcon = starting ? "■" : canRetry ? "↻" : showsPlay ? "▶" : "❚❚";
  const primaryDisabled = !props.remoteAllowed;
  const playPauseButton = (
    <Pressable
      testID="primary-play-pause"
      accessibilityRole="button"
      accessibilityLabel={primaryLabel}
      accessibilityState={{ disabled: primaryDisabled }}
      disabled={primaryDisabled}
      hitSlop={4}
      onPress={primaryAction}
      style={({ pressed }) => [
        styles.centerButton,
        !props.fullscreen && styles.centerButtonCompact,
        pressed && styles.pressed,
        primaryDisabled && styles.disabled,
      ]}
    >
      {showsPlay ? (
        <PlayIcon size={props.fullscreen ? 28 : 24} />
      ) : (
        <PauseIcon size={props.fullscreen ? 28 : 24} />
      )}
    </Pressable>
  );
  // 故障原因随当前状态常驻；慢启动及切源提示仍使用提示条。
  const slow = useSlowStart(waiting, state.attemptId);
  const persistentNotice = canRetry || state.phase === "blocked";
  usePlayerNotices(
    persistentNotice
      ? null
      : playerNotice({
          phase: state.phase,
          connectingTitle: props.failover.connectingTitle,
          pausedBody,
          slow,
        }),
    state.attemptId,
  );
  const centerStatus = waiting ? (
    <LoadingDots slow={slow} />
  ) : persistentNotice ? (
    <View style={styles.failureNotice}>
      <Text accessibilityRole="alert" style={styles.failureTitle}>
        {description.title}
      </Text>
      {!!description.body && (
        <Text style={styles.failureBody}>{description.body}</Text>
      )}
      {canRetry && (
        <View style={styles.failureActions}>
          <CenterChip
            label={t("重试")}
            icon={<RefreshIcon size={15} />}
            disabled={primaryDisabled}
            onPress={primaryAction}
          />
          {props.sources.length > 1 && state.phase !== "offline" && (
            <CenterChip
              label={t("切换线路")}
              onPress={() => setSourcesOpen(true)}
            />
          )}
        </View>
      )}
    </View>
  ) : state.phase === "cellular" ? (
    // 需要等待回答的问题保留在画面上，不作为短暂提示。
    <MobileDataPrompt
      stopReminding={stopReminding}
      onStopRemindingChange={setStopReminding}
      disabled={primaryDisabled}
      onContinue={primaryAction}
    />
  ) : (
    playPauseButton
  );
  // 显示正在播放频道的第几个地址（2/3）；点击按钮打开
  // 显示每个地址的列表，全屏使用浮层、竖屏使用底部面板，
  // 因此即使只有一个来源也能打开；TalkBack 还会播报清晰度与名称。
  const sourceButton = (
    <SourceChip
      position={sourcePosition(props.sources, props.channel)?.index ?? 1}
      count={props.sources.length}
      accessibilityLabel={
        props.sources.length > 1
          ? t("线路：{value0} · {value1}，共 {value2} 个，点击切换", {
              value0: qualityName(props.channel),
              value1: props.channel.sourceName,
              value2: props.sources.length,
            })
          : t("线路：{value0} · {value1}，点击查看地址", {
              value0: qualityName(props.channel),
              value1: props.channel.sourceName,
            })
      }
      solid={!props.fullscreen}
      onPress={() => setSourcesOpen(!sourcesOpen)}
    />
  );

  const favoriteButton = (
    <Pressable
      style={[styles.favoriteHit, !props.fullscreen && styles.favoriteSolid]}
      accessibilityRole="button"
      accessibilityLabel={
        props.channel.favorite ? t("取消收藏当前频道") : t("收藏当前频道")
      }
      accessibilityState={{ selected: props.channel.favorite }}
      onPress={() => props.onFavorite(props.channel)}
    >
      <Text style={[styles.star, props.channel.favorite && styles.starOn]}>
        {props.channel.favorite ? "★" : "☆"}
      </Text>
    </Pressable>
  );

  const pictureInPictureButton = state.attemptId !== null && (
    <OverlayButton
      label={t("画中画")}
      icon={<PictureInPictureIcon />}
      accessibilityLabel={t("进入画中画")}
      variant="quiet"
      onPress={() => {
        void media.startPictureInPicture().then((success) => {
          if (!success)
            Alert.alert(
              t("未能进入画中画"),
              t(
                "请确认系统允许静看使用画中画，并在视频开始播放后重试。若是用返回键退出后重新打开的，请先从最近任务中彻底关闭应用再试。",
              ),
            );
        });
      }}
    />
  );

  const muteButton = (
    <OverlayButton
      label={props.muted ? t("取消静音") : t("静音")}
      icon={<VolumeIcon muted={props.muted} />}
      variant="quiet"
      selected={props.muted}
      onPress={() => props.onMutedChange(!props.muted)}
    />
  );
  // 图标表示点击后将切换到的模式：观看时显示耳机，
  // 收听时显示屏幕图标，画面本身会说明正在听音频。
  const audioButton = (
    <OverlayButton
      label={props.audioOnly ? t("看视频") : t("听音频")}
      icon={props.audioOnly ? <ScreenIcon /> : <HeadphonesIcon />}
      variant="quiet"
      onPress={props.onToggleAudioOnly}
    />
  );

  return {
    insets,
    sourcesOpen,
    setSourcesOpen,
    controller,
    state,
    media,
    mediaInfo,
    setScrubbing,
    setControlsShown,
    controlsVisible,
    busy,
    waiting,
    starting,
    canRetry,
    retained,
    primaryLabel,
    primaryAction,
    index,
    previous,
    next,
    selectNext,
    title,
    osd,
    description,
    pausedBody,
    showsPlay,
    primaryIcon,
    primaryDisabled,
    centerStatus,
    sourceButton,
    favoriteButton,
    pictureInPictureButton,
    muteButton,
    audioButton,
  };
}

export type SessionView = ReturnType<typeof useChannelSession>;

const styles = StyleSheet.create({
  failureNotice: {
    maxWidth: "100%",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  failureTitle: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    textAlign: "center",
  },
  failureBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  failureActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  centerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#04080A73",
    borderWidth: 1,
    borderColor: "#FFFFFF33",
  },
  centerButtonCompact: { width: 56, height: 56, borderRadius: 28 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  favoriteHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  favoriteSolid: { borderRadius: 12, backgroundColor: colors.raised },
  star: { color: colors.muted, fontSize: 20, lineHeight: 24 },
  starOn: { color: colors.warn },
});
