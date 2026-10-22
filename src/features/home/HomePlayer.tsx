import React from "react";
import { Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Channel } from "../../domain/types";
import { colors } from "../../theme";
import { PlayerScreen } from "../player/PlayerScreen";
import type { ChannelSheetProps } from "../player/playerShared";
import type { AppSettings } from "./useAppSettings";
import type { Playback } from "./usePlayback";
import { FloatingChrome } from "./FloatingChrome";
import { MINI_EDGE, useFloatingWindow } from "./useFloatingWindow";

/**
 * 覆盖主页面的播放器：全屏，或停靠在底部标签栏正上方的小浮窗。
 * 两种尺寸使用相同的组件树位置，因此收起和展开都不会重新挂载
 * 会话及其播放器实例。
 */
export function HomePlayer({
  playing,
  playback,
  settings,
  sheet,
  tabsHeight,
  error,
  onDismissError,
  onFavorite,
  onStarted,
  onAvailability,
}: {
  playing: Channel;
  playback: Playback;
  settings: AppSettings;
  sheet: ChannelSheetProps;
  tabsHeight: number;
  error: string;
  onDismissError: () => void;
  onFavorite: (channel: Channel) => void;
  onStarted: (channel: Channel) => void;
  onAvailability: (channel: Channel, ok: boolean) => void;
}) {
  const { playerMini } = playback;
  // 应用的安全区视图在底部有内边距，而绝对定位子元素会
  // 绝对定位子元素从内边距边缘开始放置，因此窗口也必须避开该安全区。
  const insets = useSafeAreaInsets();
  const floating = useFloatingWindow({
    bottomOffset: insets.bottom + tabsHeight + MINI_EDGE,
    topInset: insets.top,
  });
  return (
    <Animated.View
      testID="player-container"
      style={
        playerMini
          ? [
              playerStyles.miniContainer,
              {
                bottom: insets.bottom + tabsHeight + MINI_EDGE,
                width: floating.width,
                height: floating.height,
                transform: floating.transform,
              },
            ]
          : playerStyles.playerOverlay
      }
      {...(playerMini ? floating.panHandlers : {})}
    >
      <PlayerScreen
        mini={playerMini}
        // 位于浮窗 1dp 边框的内部。
        miniSize={{ width: floating.width - 2, height: floating.height - 2 }}
        // 关闭小窗功能后，离开播放器就会停止播放。
        onMinimize={
          settings.miniPlayer ? () => playback.setPlayerMini(true) : undefined
        }
        onExpand={() => playback.setPlayerMini(false)}
        error={error}
        onDismissError={onDismissError}
        channel={playing}
        channels={playback.playQueue}
        sources={playback.playingSources}
        artworkEnabled={settings.artworkEnabled}
        sheet={sheet}
        onSelect={(channel, queue) => void playback.play(channel, queue)}
        onSelectSource={playback.selectSource}
        onClose={playback.closePlayer}
        onFavorite={onFavorite}
        onStarted={onStarted}
        onAvailability={onAvailability}
        remoteAllowed={settings.remoteAllowed}
        backgroundAllowed={settings.backgroundPlayback}
        onEnableBackgroundPlayback={() =>
          settings.saveToggle("backgroundPlayback", true)
        }
        mobileWarning={settings.mobileWarning && !settings.mobileAccepted}
        onMobileAccepted={() => settings.setMobileAccepted(true)}
        onStopMobileReminders={() =>
          settings.saveToggle("mobileWarning", false)
        }
      />
      {playerMini && (
        <FloatingChrome
          side={floating.side}
          onClose={playback.closePlayer}
          onEdgeTouch={floating.onEdgeTouch}
          onEdgeTouchEnd={floating.onEdgeTouchEnd}
        />
      )}
    </Animated.View>
  );
}

const playerStyles = StyleSheet.create({
  playerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
  },
  // 默认位置在右下角；拖动通过相对该位置的变换移动窗口。
  miniContainer: {
    position: "absolute",
    right: MINI_EDGE,
    borderWidth: 1,
    borderColor: "#FFFFFF1F",
    overflow: "hidden",
    backgroundColor: "#000000",
    // 使用 elevation，让 Android 上的小窗显示在列表行之上。
    elevation: 8,
  },
});
