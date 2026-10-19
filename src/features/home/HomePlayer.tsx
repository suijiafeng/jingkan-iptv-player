import React from "react";
import { StyleSheet, View } from "react-native";
import type { Channel } from "../../domain/types";
import { colors } from "../../theme";
import { PlayerScreen } from "../player/PlayerScreen";
import type { ChannelSheetProps } from "../player/playerShared";
import type { AppSettings } from "./useAppSettings";
import type { Playback } from "./usePlayback";

/** 停靠播放栏与下方标签导航之间的间距。 */
const MINI_BAR_GAP = 8;

/**
 * 覆盖在主页面上的播放器：全屏，或停靠在底部标签栏正上方的小条。
 * 两种尺寸使用同一处组件树位置，因此收起为小条或再次展开时，
 * 不会重新挂载会话及其播放器实例。
 */
export function HomePlayer({
  playing,
  playback,
  settings,
  sheet,
  tabsHeight,
  freshRows,
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
  /** 最近读取的行，优先于此前记住的数据。 */
  freshRows: Channel[];
  error: string;
  onDismissError: () => void;
  onFavorite: (channel: Channel) => void;
  onStarted: (channel: Channel) => void;
  onAvailability: (channel: Channel, ok: boolean) => void;
}) {
  const { playerMini, previousChannel } = playback;
  // 优先使用新读取的记录；刷新可能已经修改该频道。
  const shownPrevious = previousChannel
    ? (freshRows.find((channel) => channel.id === previousChannel.id) ??
      previousChannel)
    : null;
  return (
    <View
      testID="player-container"
      style={
        playerMini
          ? [playerStyles.miniContainer, { bottom: tabsHeight + MINI_BAR_GAP }]
          : playerStyles.playerOverlay
      }
    >
      <PlayerScreen
        mini={playerMini}
        onMinimize={() => playback.setPlayerMini(true)}
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
        swipeReverse={settings.swipeReverse}
        skipUnreachable={settings.skipUnreachable}
        previousChannel={shownPrevious}
      />
    </View>
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
  miniContainer: {
    position: "absolute",
    left: 8,
    right: 8,
    borderRadius: 14,
    backgroundColor: colors.raised,
    // Android 的 elevation 让小条显示在列表行上方。
    elevation: 6,
  },
});
