import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import { LiveBadge, MediaStatus, OverlayButton } from "./overlayWidgets";
import { ChevronLeftIcon, MenuIcon } from "./playerIcons";
import type { SessionProps } from "./ChannelSession";
import type { SessionView } from "./useChannelSession";

/**
 * 仅用于全屏。顶栏包含返回、标题和收藏（当前播放内容）；底栏包含
 * 回看流时间轴、直播标记，再放来源按钮和频道列表（切换其他内容）。
 * 换台使用会话在两种布局中绘制的中央控件组。
 */
export function FullscreenBars({
  view,
  session: props,
}: {
  view: SessionView;
  session: SessionProps;
}) {
  const {
    insets,
    media,
    mediaInfo,
    setScrubbing,
    controlsVisible,
    index,
    title,
    description,
    sourceButton,
    favoriteButton,
  } = view;
  return (
    <>
      <View
        testID="fullscreen-controls"
        style={
          props.fullscreen && controlsVisible
            ? [
                styles.fullscreenTop,
                {
                  top: insets.top,
                  left: insets.left,
                  right: insets.right,
                },
              ]
            : styles.hidden
        }
      >
        <OverlayButton
          label="退出全屏"
          icon={<ChevronLeftIcon size={20} />}
          accessibilityLabel="退出全屏"
          variant="quiet"
          onPress={props.onToggleFullscreen}
        />
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[
              index >= 0
                ? `第 ${index + 1} / ${props.channels.length} 台`
                : null,
              description.title,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        {props.fullscreen && favoriteButton}
      </View>
      {props.fullscreen && controlsVisible && (
        <View
          testID="fullscreen-bottom-controls"
          style={[
            styles.fullscreenBottom,
            {
              bottom: insets.bottom,
              left: insets.left,
              right: insets.right,
            },
          ]}
        >
          {mediaInfo.seekable && (
            <MediaStatus media={media} onScrubbingChange={setScrubbing} />
          )}
          <View style={styles.row}>
            {!mediaInfo.seekable && mediaInfo.isLive && <LiveBadge />}
            <View style={styles.flex} />
            {sourceButton}
            {view.muteButton}
            {view.pictureInPictureButton}
            <OverlayButton
              label="频道列表"
              icon={<MenuIcon />}
              accessibilityLabel="频道列表"
              variant="quiet"
              onPress={props.onOpenSheet}
            />
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  hidden: { display: "none" },
  // 控制栏位于会话绘制的渐变遮罩上，不另设面板背景。
  fullscreenTop: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fullscreenBottom: {
    position: "absolute",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  subtitle: { color: "#FFFFFFB3", fontSize: 11, lineHeight: 16 },
});
