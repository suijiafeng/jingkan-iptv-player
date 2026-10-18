import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AccessibilityInfo,
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
import { OverlayButton, SourceChip } from "./overlayWidgets";
import {
  adjacentPlayableIndex,
  PlaybackController,
} from "./playbackController";
import {
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
        mobileWarning: props.mobileWarning,
        checkNetwork: Network.getNetworkStateAsync,
        isAppActive: () => AppState.currentState === "active",
        onStarted: () => props.onStarted(props.channel),
      }),
  );
  const { onStarted, channel } = props;
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
    controlsShown &&
    !props.sheetOpen &&
    !sourcesOpen &&
    !scrubbing &&
    !screenReader &&
    state.phase === "playing";
  useEffect(() => {
    if (!autoHide) return;
    const timer = setTimeout(() => setControlsShown(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [autoHide, setControlsShown]);
  // 加载时保持画面简洁，方便换台；需要用户决定的状态
  // 错误、超时、暂停、移动数据确认等状态总会重新显示控件。
  const loading = ["checking", "connecting", "buffering"].includes(state.phase);
  const controlsVisible =
    controlsShown ||
    props.sheetOpen ||
    screenReader ||
    (state.phase !== "playing" && !loading);

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
  const primaryLabel =
    state.phase === "cellular"
      ? "继续播放"
      : starting
        ? "取消"
        : busy
          ? "暂停"
          : canRetry
            ? "重试播放"
            : "播放";
  const primaryAction = () => {
    // 在可能计费的网络上，点击 ▶ 就是明确选择“继续”。
    if (state.phase === "cellular") {
      props.onMobileAccepted?.();
      void controller.requestPlay(true);
      return;
    }
    const id = state.attemptId;
    // 可回看的媒体流原地暂停，以保留播放位置；普通直播
    // 会停止并释放解码器；继续时重新连接到直播边缘。
    if (
      id !== null &&
      (state.phase === "playing" || state.phase === "buffering") &&
      mediaInfo.seekable &&
      media.pause()
    ) {
      if (!controller.userPaused(id)) controller.pause();
      return;
    }
    if (retained && media.play()) return;
    if (busy) controller.pause();
    else void controller.requestPlay();
  };
  const index = props.channels.findIndex((channel) =>
    sameChannel(channel, props.channel),
  );
  const skip = (channel: Channel) =>
    !!props.skipUnreachable && channel.checkStatus === "unreachable";
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
  const zap = (direction: -1 | 1) => {
    const step = props.swipeReverse ? (-direction as -1 | 1) : direction;
    const target = step === 1 ? next : previous;
    if (target !== null) props.onSelect(props.channels[target]);
    else showOsd(step === 1 ? "已经是最后一个频道" : "已经是第一个频道");
  };

  const description = descriptions[state.phase];
  const pausedBody =
    state.pauseReason === "background"
      ? "离开应用后暂停"
      : state.pauseReason === "interrupted"
        ? "被系统暂停"
        : state.pauseReason === "cellular-declined"
          ? "已停止，可手动播放"
          : "";
  // 每种状态的主要操作都用同一个圆形控件，因此取消、
  // 重试、暂停和恢复使用一致的视觉：连接中为 ■，失败后为 ↻，
  // 失败时使用重试图形，暂停或停止时使用 ▶，播放时使用 ❚❚。
  const showsPlay = retained || !busy;
  const primaryIcon = starting ? "■" : canRetry ? "↻" : showsPlay ? "▶" : "❚❚";
  const primaryDisabled = !props.remoteAllowed;
  // 覆盖层只有一个视觉焦点：上一台、播放/暂停、下一台组成的
  // 统一为一行，竖屏时更紧凑、全屏时较宽；同样显示在
  // 状态提示，因此停止与暂停状态保留同一组控件。
  const compactCluster = !props.fullscreen;
  const zapCluster = (absolute: boolean) => (
    <View
      testID="zap-cluster"
      style={[s.zapRow, absolute && s.zapRowAbsolute]}
      pointerEvents="box-none"
    >
      <OverlayButton
        label="⏮"
        accessibilityLabel="上一台"
        variant="ring"
        compact={compactCluster}
        disabled={previous === null}
        onPress={() => {
          if (previous !== null) props.onSelect(props.channels[previous]);
        }}
      />
      <Pressable
        testID="center-play-pause"
        style={({ pressed }) => [
          s.centerButton,
          compactCluster && s.centerButtonCompact,
          pressed && s.pressed,
          primaryDisabled && s.overlayButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: primaryDisabled }}
        onPress={primaryAction}
        disabled={primaryDisabled}
      >
        <Text style={s.centerIcon}>{primaryIcon}</Text>
      </Pressable>
      <OverlayButton
        label="⏭"
        accessibilityLabel="下一台"
        variant="ring"
        compact={compactCluster}
        disabled={next === null}
        onPress={selectNext}
      />
    </View>
  );
  // 显示实际播放地址的清晰度和来源，点击按钮打开
  // 备用来源列表中；全屏使用浮层，竖屏使用底部面板。
  const sourceButton = (
    <SourceChip
      quality={qualityName(props.channel)}
      sourceName={props.channel.sourceName}
      count={props.sources.length}
      accessibilityLabel={
        props.sources.length > 1
          ? `切换来源，当前${qualityName(props.channel)}，${props.channel.sourceName}，共 ${props.sources.length} 个`
          : `来源：${qualityName(props.channel)}，${props.channel.sourceName}`
      }
      solid={!props.fullscreen}
      disabled={props.sources.length < 2}
      onPress={() => setSourcesOpen(!sourcesOpen)}
    />
  );

  const favoriteButton = (
    <Pressable
      style={[s.favoriteHit, !props.fullscreen && s.favoriteSolid]}
      accessibilityRole="button"
      accessibilityLabel={
        props.channel.favorite ? "取消收藏当前频道" : "收藏当前频道"
      }
      accessibilityState={{ selected: props.channel.favorite }}
      onPress={() => props.onFavorite(props.channel)}
    >
      <Text style={[s.star, props.channel.favorite && s.starOn]}>
        {props.channel.favorite ? "★" : "☆"}
      </Text>
    </Pressable>
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
    zap,
    description,
    pausedBody,
    showsPlay,
    primaryIcon,
    primaryDisabled,
    zapCluster,
    sourceButton,
    favoriteButton,
  };
}

export type SessionView = ReturnType<typeof useChannelSession>;

const s = StyleSheet.create({
  centerButton: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00000073",
    borderWidth: 1,
    borderColor: "#FFFFFF40",
  },
  centerButtonCompact: { width: 56, height: 56, borderRadius: 28 },
  zapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
  },
  zapRowAbsolute: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  centerIcon: { color: colors.text, fontSize: 24, lineHeight: 30 },
  favoriteHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  favoriteSolid: { borderRadius: 12, backgroundColor: colors.raised },
  overlayButtonDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  star: { color: colors.muted, fontSize: 20, lineHeight: 24 },
  starOn: { color: colors.warn },
});
