import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import * as Orientation from "expo-screen-orientation";
import { colors, styles as theme } from "../../theme";
import {
  ChannelPanel,
  type ListPositionStore,
  type SavedListPosition,
} from "./ChannelPanel";
import { ChannelSession } from "./ChannelSession";
import { CloseIcon } from "./playerIcons";
import { SourceList } from "./SourceList";
import { backDestination } from "./playbackController";
import type { PlayerScreenProps } from "./playerShared";
import { useSourceFailover } from "./useSourceFailover";

export type { ChannelSheetProps, PlayerScreenProps } from "./playerShared";

/** 播放器外壳：控制当前布局（竖屏、全屏、停靠栏）、方向锁定、硬件返回键，以及全屏选台和竖屏线路两个覆盖面板。实际播放由按频道和流地址区分的 ChannelSession 负责。 */
export function PlayerScreen(props: PlayerScreenProps) {
  const [fullscreenWanted, setFullscreen] = useState(false);
  // 小条只用于竖屏：从竖屏收起，展开时也
  // 展开后也回到竖屏。
  const mini = !!props.mini;
  const fullscreen = fullscreenWanted && !mini;
  // 竖屏把频道列表放在画面下方；全屏则将其放入
  // 放在按需打开的侧栏中。
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // 状态放在单频道会话之上，切台时不会让已经隐藏的控件重新出现。
  const [controlsShown, setControlsShown] = useState(true);
  // 跨频道及同频道的不同来源保留音频播放意图。
  const [muted, setMuted] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const requestBackgroundPlayback = () => {
    Alert.alert(
      "锁屏继续收听",
      "开启后台播放后，切换应用或锁屏仍会播放，并提供系统媒体控制。会持续联网并耗电；听音频时仍可能下载视频画面，流量不一定减少。",
      [
        { text: "仅前台收听", style: "cancel" },
        ...(props.onEnableBackgroundPlayback
          ? [
              {
                text: "开启后台播放",
                onPress: props.onEnableBackgroundPlayback,
              },
            ]
          : []),
      ],
    );
  };
  const toggleAudioOnly = () => {
    const next = !audioOnly;
    setAudioOnly(next);
    setControlsShown(true);
    if (!next) return;
    setFullscreen(false);
    setMuted(false);
    if (!props.backgroundAllowed) requestBackgroundPlayback();
  };
  // 面板被隐藏（全屏、小窗）后再次显示时仍保留。
  const savedListPosition = useRef<SavedListPosition | null>(null);
  const [listPositionStore] = useState<ListPositionStore>(() => ({
    get: () => savedListPosition.current,
    set: (position) => {
      savedListPosition.current = position;
    },
  }));
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [orientationError, setOrientationError] = useState(false);
  const originalLock = useRef<Orientation.OrientationLock>(
    Orientation.OrientationLock.DEFAULT,
  );
  const orientationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    orientationQueue.current = Orientation.getOrientationLockAsync()
      .then((lock) => {
        originalLock.current = lock;
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      // 将恢复操作排在尚未完成的屏幕旋转操作之后，按顺序执行。
      orientationQueue.current = orientationQueue.current
        .then(() => Orientation.lockAsync(originalLock.current))
        .catch(() => {});
    };
  }, []);
  useEffect(() => {
    orientationQueue.current = orientationQueue.current
      .then(() => {
        if (!mounted.current) return;
        return Orientation.lockAsync(
          fullscreen
            ? Orientation.OrientationLock.LANDSCAPE
            : Orientation.OrientationLock.PORTRAIT_UP,
        );
      })
      .catch(() => {
        if (mounted.current) setOrientationError(true);
      });
  }, [fullscreen]);

  // 地址改变导致会话重新挂载时，这个状态仍然保留。
  const { onManualSelect, ...failover } = useSourceFailover(
    props.channel,
    props.sources,
    props.onSelectSource,
  );
  const { onClose, onMinimize } = props;
  // 由会话上报：暂停的播放器按返回时应关闭，而不是缩小停靠。
  const [paused, setPaused] = useState(false);
  const handleBack = useCallback(() => {
    if (sourcesOpen) {
      setSourcesOpen(false);
      return true;
    }
    const destination = backDestination(fullscreen && sheetOpen, fullscreen);
    if (destination === "sheet") setSheetOpen(false);
    else if (destination === "fullscreen") setFullscreen(false);
    else if (!mini && !paused && onMinimize) onMinimize();
    else onClose();
    return true;
  }, [sourcesOpen, sheetOpen, fullscreen, mini, paused, onMinimize, onClose]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBack,
    );
    return () => subscription.remove();
  }, [handleBack]);

  const activeChannels = useMemo(
    () => props.channels.filter((channel) => channel.active),
    [props.channels],
  );
  const channelPanel = (
    <ChannelPanel
      sheet={props.sheet}
      channel={props.channel}
      fullscreen={fullscreen}
      onClose={() => setSheetOpen(false)}
      onSelect={(channel, queue) => {
        setSheetOpen(false);
        props.onSelect(channel, queue);
      }}
      onFavorite={props.onFavorite}
      artworkEnabled={!!props.artworkEnabled && props.remoteAllowed}
      error={props.error}
      onDismissError={props.onDismissError}
      savedPosition={listPositionStore}
    />
  );
  return (
    <SafeAreaView
      testID="player-screen"
      style={mini ? screenStyles.miniScreen : screenStyles.screen}
      // 全屏媒体延伸到屏幕边缘，交互覆盖层分别应用
      // 在下面分别应用实际屏幕的安全区边距，避免刘海缩小
      // 视频本身。停靠栏已经位于外层的安全区内部。
      edges={fullscreen || mini ? [] : ["top", "left", "right", "bottom"]}
    >
      <StatusBar style="light" hidden={fullscreen} />
      {/* 沉浸模式：从屏幕边缘滑动时，系统栏会短暂出现。 */}
      <NavigationBar hidden={fullscreen} />
      <ChannelSession
        key={`${props.channel.id}:${props.channel.streamUrl}`}
        {...props}
        audioOnly={audioOnly}
        onToggleAudioOnly={toggleAudioOnly}
        onRequestBackgroundPlayback={requestBackgroundPlayback}
        muted={muted}
        onMutedChange={setMuted}
        channels={activeChannels}
        failover={failover}
        onSelectSource={onManualSelect}
        fullscreen={fullscreen}
        onToggleFullscreen={() => {
          setOrientationError(false);
          // 进入或退出全屏时，先显示播放控件。
          setControlsShown(true);
          setFullscreen((value) => !value);
        }}
        controlsShown={controlsShown}
        onControlsShownChange={setControlsShown}
        onOpenSheet={() => setSheetOpen(true)}
        orientationError={orientationError}
        sheetOpen={fullscreen && sheetOpen}
        sourcesOpen={sourcesOpen}
        onSourcesOpenChange={setSourcesOpen}
        mini={mini}
        onPausedChange={setPaused}
      />
      {!fullscreen && !mini && (
        <View style={screenStyles.inlineList} testID="player-channel-sheet">
          {channelPanel}
        </View>
      )}
      {!fullscreen && !mini && sourcesOpen && (
        <View style={screenStyles.overlay} accessibilityViewIsModal>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessible={false}
            importantForAccessibility="no"
            onPress={() => setSourcesOpen(false)}
          />
          <View style={screenStyles.sourceSheet} testID="source-sheet">
            <View style={screenStyles.sheetGrab} />
            <View style={screenStyles.sheetHeading}>
              <View style={screenStyles.flex}>
                <Text accessibilityRole="header" style={theme.heading}>
                  线路
                </Text>
              </View>
              <Pressable
                style={screenStyles.sheetAction}
                accessibilityRole="button"
                accessibilityLabel="关闭线路"
                onPress={() => setSourcesOpen(false)}
              >
                <CloseIcon />
              </Pressable>
            </View>
            <SourceList
              current={props.channel}
              sources={props.sources}
              onSelect={(source) => {
                setSourcesOpen(false);
                onManualSelect(source);
              }}
            />
          </View>
        </View>
      )}
      {fullscreen && sheetOpen && (
        <View style={screenStyles.overlay} accessibilityViewIsModal>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessible={false}
            importantForAccessibility="no"
            onPress={() => setSheetOpen(false)}
          />
          <View
            testID="player-channel-sheet"
            style={[
              screenStyles.landscapePanel,
              {
                width: Math.min(width, Math.max(280, width * 0.4), 300),
                marginTop: insets.top,
                marginRight: insets.right,
                marginBottom: insets.bottom,
              },
            ]}
          >
            {channelPanel}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // 停靠窗口自行绘制边框，视频画面填满其内部。
  miniScreen: { flex: 1, backgroundColor: "transparent" },
  flex: { flex: 1 },
  inlineList: { flex: 1, paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#00000033",
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  landscapePanel: {
    height: "100%",
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 12,
    gap: 6,
    borderLeftWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#0B1115F5",
  },
  sourceSheet: {
    width: "100%",
    maxHeight: "70%",
    paddingHorizontal: 12,
    paddingBottom: 20,
    gap: 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
  },
  sheetGrab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 4,
    backgroundColor: colors.line,
  },
  sheetHeading: { flexDirection: "row", alignItems: "center", gap: 4 },
  sheetAction: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
