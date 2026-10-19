import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import { MediaStatus, OverlayButton } from "./overlayWidgets";
import { ChevronLeftIcon, ExitFullscreenIcon, MenuIcon } from "./playerIcons";
import type { SessionProps } from "./ChannelSession";
import type { SessionView } from "./useChannelSession";

/** 仅用于全屏。顶部依次放返回、标题，右侧按钮组先放线路标签（位于其弹出面板上方），再放收藏。底部依次放时间轴或直播标识，右侧按钮组先放音量，再放音频模式、退出横屏和频道列表。播放/暂停位于画面中央，上下滑动用于换台。 */
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
    setScrubbing,
    controlsVisible,
    title,
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
        </View>
        {/* 来源放在右侧控件组的最前面。 */}
        {props.fullscreen && sourceButton}
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
          <View style={styles.row}>
            <View style={styles.flex}>
              <MediaStatus media={media} onScrubbingChange={setScrubbing} />
            </View>
            {/* 音量放在右侧控件组的最前面。 */}
            {view.muteButton}
            <OverlayButton
              label={props.audioOnly ? "看视频" : "听音频"}
              selected={props.audioOnly}
              onPress={props.onToggleAudioOnly}
            />
            <OverlayButton
              label="退出横屏"
              icon={<ExitFullscreenIcon size={20} />}
              accessibilityLabel="退出横屏"
              variant="quiet"
              onPress={props.onToggleFullscreen}
            />
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
});
