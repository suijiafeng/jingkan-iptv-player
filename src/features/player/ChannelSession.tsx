import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { colors } from "../../theme";
import { channelTitle, displayGroups } from "../../domain/channelLabels";
import { NativeAttempt } from "./NativeAttempt";
import { FullscreenBars } from "./FullscreenBars";
import { MediaStatus, OverlayButton, Shade } from "./overlayWidgets";
import { ChevronLeftIcon, FullscreenIcon } from "./playerIcons";
import { SourceList } from "./SourceList";
import { type PlayerScreenProps } from "./playerShared";
import { useEdgeAdjust } from "./edgeAdjust";
import { useChannelSession } from "./useChannelSession";
import type { FailoverView } from "./useSourceFailover";
import { sessionStyles } from "./channelSessionStyles";

/** 长按后，频道名称在停靠画面上保留的时长。 */
const MINI_TITLE_MS = 2500;

export interface SessionProps extends PlayerScreenProps {
  audioOnly: boolean;
  onToggleAudioOnly: () => void;
  onRequestBackgroundPlayback: () => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  /** 由页面持有的播放器音量，切换频道后仍保留。 */
  volume: number;
  onVolumeChange: (volume: number) => void;
  /** 一次播放失败后，自动切换当前频道的其它播放地址。 */
  failover: FailoverView;
  fullscreen: boolean;
  sheetOpen: boolean;
  controlsShown: boolean;
  onControlsShownChange: (shown: boolean) => void;
  onToggleFullscreen: () => void;
  onOpenSheet: () => void;
  orientationError: boolean;
  /** 由页面持有，确保硬件返回键可以关闭来源列表。 */
  sourcesOpen: boolean;
  onSourcesOpenChange: (open: boolean) => void;
  mini: boolean;
  /** 告知页面：返回时是否应停止，而不是停靠。 */
  onPausedChange: (paused: boolean) => void;
}

/** 单频道播放会话：持有控制器和原生播放尝试，并在竖屏、全屏和停靠布局中绘制画面及覆盖控件。 */
export function ChannelSession(props: SessionProps) {
  const view = useChannelSession(props);
  // 提前根据窗口计算竖屏画面的尺寸，使页面
  // 原生播放器尚在创建或尚未开始播放时，页面也不会
  // 即使尚未播放也保持尺寸稳定；仅设置 aspectRatio 会等待布局。
  const { width: windowWidth } = useWindowDimensions();
  const portraitStageHeight = Math.round((windowWidth * 9) / 16);
  const {
    insets,
    sourcesOpen,
    setSourcesOpen,
    controller,
    state,
    media,
    setScrubbing,
    setControlsShown,
    controlsVisible,
    waiting,
    title,
    osd,
    centerStatus,
    retained,
    sourceButton,
    favoriteButton,
  } = view;
  const edgeAdjust = useEdgeAdjust({
    fullscreen: props.fullscreen,
    volume: props.volume,
    onVolumeChange: props.onVolumeChange,
    onTap: () => setControlsShown(!controlsVisible),
  });
  const [miniTitleShown, setMiniTitleShown] = useState(false);
  useEffect(() => {
    if (!miniTitleShown) return;
    const timer = setTimeout(() => setMiniTitleShown(false), MINI_TITLE_MS);
    return () => clearTimeout(timer);
  }, [miniTitleShown]);
  const paused = state.phase === "paused";
  const docks = !!props.onMinimize && !paused;
  const { onPausedChange } = props;
  useEffect(() => onPausedChange(paused), [onPausedChange, paused]);
  return (
    <View
      style={
        props.mini
          ? sessionStyles.miniWindow
          : props.fullscreen
            ? sessionStyles.flex
            : undefined
      }
      importantForAccessibility={
        props.sheetOpen ? "no-hide-descendants" : "auto"
      }
      accessibilityElementsHidden={props.sheetOpen}
    >
      <View
        testID="video-stage"
        style={[
          sessionStyles.videoStage,
          !props.fullscreen && !props.mini && { height: portraitStageHeight },
          props.fullscreen && sessionStyles.fullscreenVideo,
          props.mini && props.miniSize,
        ]}
      >
        {props.remoteAllowed && state.attemptId !== null && (
          <NativeAttempt
            key={state.attemptId}
            uri={props.channel.streamUrl}
            attemptId={state.attemptId}
            controller={controller}
            media={media}
            backgroundAllowed={props.backgroundAllowed}
            title={title}
            muted={props.muted}
            volume={props.volume}
            audioOnly={props.audioOnly}
          />
        )}
        {/* 只给视频加遮罩；所有标签和控件都绘制在其上方。 */}
        {!props.mini && controlsVisible && !props.sheetOpen && (
          <>
            <Shade edge="top" heightRatio={0.46} />
            <Shade edge="bottom" heightRatio={0.52} />
          </>
        )}
        {props.audioOnly && (
          <View
            style={[
              StyleSheet.absoluteFill,
              sessionStyles.audioStage,
              props.mini && sessionStyles.miniAudioStage,
            ]}
            pointerEvents="none"
            testID="audio-stage"
          >
            <Text style={sessionStyles.audioSymbol}>♫</Text>
            {!props.mini && (
              <Text style={sessionStyles.audioCaption}>正在听音频</Text>
            )}
          </View>
        )}
        {/* 整个画面负责触摸：轻触切换覆盖控件；全屏时上下拖动左半边调亮度，右半边调音量。 */}
        {!props.mini && (
          <View
            testID={
              props.fullscreen ? "fullscreen-gesture-layer" : "video-tap-layer"
            }
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole="button"
            accessibilityLabel={
              props.fullscreen
                ? `${title}，轻触显示操作`
                : controlsVisible
                  ? "隐藏播放操作"
                  : "显示播放操作"
            }
            accessibilityActions={[
              {
                name: "activate",
                label: controlsVisible ? "隐藏播放操作" : "显示播放操作",
              },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === "activate")
                setControlsShown(!controlsVisible);
            }}
            {...edgeAdjust.handlers}
          />
        )}
        {props.fullscreen && edgeAdjust.label && !props.sheetOpen && (
          <View
            style={[sessionStyles.osd, sessionStyles.adjustOsd]}
            pointerEvents="none"
            testID="adjust-osd"
          >
            <Text style={sessionStyles.osdText}>{edgeAdjust.label}</Text>
          </View>
        )}
        {props.fullscreen && osd && !props.sheetOpen && (
          <View
            style={[
              sessionStyles.osd,
              {
                top: insets.top + 24,
                marginLeft: insets.left,
                marginRight: insets.right,
              },
            ]}
            pointerEvents="none"
            testID="channel-osd"
          >
            <Text style={sessionStyles.osdText} numberOfLines={1}>
              {osd}
            </Text>
          </View>
        )}
        {!props.mini &&
          state.phase !== "playing" &&
          !(state.phase === "paused" && state.attemptId !== null) && (
            // 画面变暗，只显示加载圆点或唯一的操作；
            // 原因由全局提示说明；box-none 使遮暗区域的滑动
            // 该区域的触摸仍会到达手势层。
            <View
              style={[
                sessionStyles.videoNotice,
                waiting && sessionStyles.videoNoticeSoft,
              ]}
              pointerEvents="box-none"
            >
              {centerStatus}
            </View>
          )}
        {/* 播放中或原位暂停时，播放/暂停位于画面中央，
            与其他控件一起显示和隐藏。 */}
        {!props.mini &&
          controlsVisible &&
          !props.sheetOpen &&
          (state.phase === "playing" || retained) && (
            <View style={sessionStyles.centerLayer} pointerEvents="box-none">
              {centerStatus}
            </View>
          )}
        {props.mini && view.starting && (
          <View style={sessionStyles.videoNotice} pointerEvents="none">
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        {props.mini && (
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`展开播放器，${title}`}
            onPress={props.onExpand}
            // 窗口不常驻标题；长按后才显示频道名称。
            onLongPress={() => setMiniTitleShown(true)}
          />
        )}
        {props.mini && miniTitleShown && (
          <View style={sessionStyles.miniTitleStrip} pointerEvents="none">
            <Text
              style={sessionStyles.miniTitleText}
              numberOfLines={1}
              testID="mini-title"
            >
              {title}
            </Text>
          </View>
        )}
        {!props.fullscreen && !props.mini && controlsVisible && (
          <>
            {/* 底部只有一行：直播标记或回看进度，其后是音量和全屏；
                播放、暂停键位于画面中央。 */}
            <View style={sessionStyles.portraitBottom} pointerEvents="box-none">
              <View style={sessionStyles.flex} pointerEvents="box-none">
                <MediaStatus media={media} onScrubbingChange={setScrubbing} />
              </View>
              {view.muteButton}
              {!props.audioOnly && (
                <OverlayButton
                  label="横屏全屏"
                  icon={<FullscreenIcon size={20} />}
                  variant="quiet"
                  accessibilityLabel="横屏全屏"
                  onPress={props.onToggleFullscreen}
                />
              )}
            </View>
            <View style={sessionStyles.portraitTopLeft}>
              {/* 与返回键一致：回到列表，播放停靠为浮窗，
                  点击其中的 ✕ 才停止。暂停时没有继续观看的内容，
                  因此返回会直接停止。 */}
              <OverlayButton
                label="返回频道列表"
                icon={<ChevronLeftIcon size={20} />}
                variant="quiet"
                accessibilityLabel={
                  docks ? "返回频道列表，继续小窗播放" : "关闭播放器"
                }
                onPress={(docks && props.onMinimize) || props.onClose}
              />
            </View>
            <View style={sessionStyles.portraitTopRight}>
              {!props.audioOnly && view.pictureInPictureButton}
              {/* 两种模式均在同一角落保留收听/观看切换。 */}
              {view.audioButton}
            </View>
          </>
        )}
      </View>
      {!props.fullscreen && !props.mini && (
        <View style={sessionStyles.portraitInfo} testID="portrait-info">
          {/* 标题独占一行，为长名称和额外文字留出空间。 */}
          <View>
            <Text style={sessionStyles.infoTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={sessionStyles.infoSubtitle} numberOfLines={1}>
              {[
                displayGroups(props.channel.groupName),
                ...channelTitle(props.channel.name).tags,
              ].join(" · ")}
            </Text>
          </View>
          <View style={sessionStyles.infoRow}>
            {sourceButton}
            {/* 点击后打开的确认框中会说明风险。 */}
            {props.audioOnly &&
              !props.backgroundAllowed &&
              props.onEnableBackgroundPlayback && (
                <OverlayButton
                  label="锁屏继续听"
                  onPress={props.onRequestBackgroundPlayback}
                />
              )}
            <View style={sessionStyles.flex} />
            {favoriteButton}
          </View>
          {props.orientationError && (
            <Text accessibilityRole="alert" style={sessionStyles.warning}>
              设备未能切换屏幕方向，可以继续播放或退出全屏。
            </Text>
          )}
        </View>
      )}
      <FullscreenBars view={view} session={props} />
      {props.fullscreen && sourcesOpen && (
        // 点击列表之外的任意位置都会关闭它，与竖屏底部面板一致。
        <Pressable
          testID="fullscreen-sources-backdrop"
          style={StyleSheet.absoluteFill}
          accessible={false}
          importantForAccessibility="no"
          onPress={() => setSourcesOpen(false)}
        />
      )}
      {props.fullscreen && sourcesOpen && (
        <View
          testID="fullscreen-sources"
          style={[
            sessionStyles.fullscreenSources,
            {
              top: insets.top + 82,
              right: insets.right + 24,
              bottom: insets.bottom + 16,
            },
          ]}
        >
          <SourceList
            current={props.channel}
            sources={props.sources}
            onSelect={(source) => {
              setSourcesOpen(false);
              props.onSelectSource(source);
            }}
          />
        </View>
      )}
    </View>
  );
}
