import React, { useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { qualityName } from "../../domain/channelSources";
import { channelTitle, displayGroups } from "../../domain/channelLabels";
import { NativeAttempt } from "./NativeAttempt";
import { FullscreenBars } from "./FullscreenBars";
import { MediaStatus, OverlayButton, Shade } from "./overlayWidgets";
import { ChevronLeftIcon, FullscreenIcon } from "./playerIcons";
import { SourceList } from "./SourceList";
import {
  SWIPE_MIN_DP,
  TAP_SLOP_DP,
  type PlayerScreenProps,
} from "./playerShared";
import { useChannelSession } from "./useChannelSession";
import type { FailoverView } from "./useSourceFailover";
import { sessionStyles } from "./channelSessionStyles";

export interface SessionProps extends PlayerScreenProps {
  audioOnly: boolean;
  onToggleAudioOnly: () => void;
  onRequestBackgroundPlayback: () => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
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
}

/** 单频道播放会话：持有控制器和原生播放尝试，并在竖屏、全屏和停靠布局中绘制画面及覆盖控件。 */
export function ChannelSession(props: SessionProps) {
  const view = useChannelSession(props);
  // 本次画面拖动的起点（全屏换台）。
  const gesture = useRef<{ x: number; y: number } | null>(null);
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
    primaryLabel,
    primaryAction,
    title,
    osd,
    zap,
    description,
    primaryIcon,
    primaryDisabled,
    centerStatus,
    retained,
    sourceButton,
    favoriteButton,
  } = view;
  return (
    <View
      style={
        props.mini
          ? sessionStyles.miniBar
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
          props.mini && sessionStyles.miniVideo,
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
            style={[StyleSheet.absoluteFill, sessionStyles.audioStage]}
            pointerEvents="none"
            testID="audio-stage"
          >
            <Text style={sessionStyles.audioSymbol}>♫</Text>
          </View>
        )}
        {/* 整个画面：轻触切换控件显示；全屏时
            垂直滑动还可切换频道。 */}
        {!props.mini && (
          <View
            testID={
              props.fullscreen ? "fullscreen-gesture-layer" : "video-tap-layer"
            }
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole={props.fullscreen ? "adjustable" : "button"}
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
              ...(props.fullscreen
                ? [
                    { name: "increment", label: "下一台" },
                    { name: "decrement", label: "上一台" },
                  ]
                : []),
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === "activate")
                setControlsShown(!controlsVisible);
              else if (nativeEvent.actionName === "increment") zap(1);
              else if (nativeEvent.actionName === "decrement") zap(-1);
            }}
            onStartShouldSetResponder={() => true}
            onResponderGrant={({ nativeEvent }) => {
              gesture.current = { x: nativeEvent.pageX, y: nativeEvent.pageY };
            }}
            onResponderTerminate={() => {
              gesture.current = null;
            }}
            onResponderRelease={({ nativeEvent }) => {
              const start = gesture.current;
              gesture.current = null;
              if (!start) return;
              const dx = nativeEvent.pageX - start.x;
              const dy = nativeEvent.pageY - start.y;
              if (
                props.fullscreen &&
                Math.abs(dy) >= SWIPE_MIN_DP &&
                Math.abs(dy) > Math.abs(dx) * 1.5
              )
                zap(dy < 0 ? 1 : -1);
              else if (Math.abs(dx) < TAP_SLOP_DP && Math.abs(dy) < TAP_SLOP_DP)
                setControlsShown(!controlsVisible);
            }}
          />
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
        {props.mini && (
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`展开播放器，${title}`}
            onPress={props.onExpand}
          />
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
              {/* 与返回键相同：回到列表并将播放停靠在小条中，
                  小条上的 ✕ 才会停止播放。 */}
              <OverlayButton
                label="返回频道列表"
                icon={<ChevronLeftIcon size={20} />}
                variant="quiet"
                accessibilityLabel={
                  props.onMinimize ? "返回频道列表，继续小窗播放" : "关闭播放器"
                }
                onPress={props.onMinimize ?? props.onClose}
              />
            </View>
            <View style={sessionStyles.portraitTopRight}>
              {!props.audioOnly && view.pictureInPictureButton}
            </View>
          </>
        )}
      </View>
      {props.mini && (
        <>
          <Pressable
            style={sessionStyles.miniText}
            accessibilityRole="button"
            accessibilityLabel={`展开播放器，${title}`}
            onPress={props.onExpand}
          >
            <Text style={sessionStyles.miniTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={sessionStyles.miniSubtitle} numberOfLines={1}>
              {state.phase === "playing"
                ? `${props.audioOnly ? "听音频" : qualityName(props.channel)} · ${props.channel.sourceName}`
                : description.title}
            </Text>
          </Pressable>
          <OverlayButton
            label={primaryIcon}
            accessibilityLabel={primaryLabel}
            variant="quiet"
            disabled={primaryDisabled}
            onPress={primaryAction}
          />
          {view.muteButton}
          <OverlayButton
            label={props.audioOnly ? "看视频" : "听音频"}
            selected={props.audioOnly}
            onPress={props.onToggleAudioOnly}
          />
          <OverlayButton
            label="✕"
            accessibilityLabel="停止播放"
            variant="quiet"
            onPress={props.onClose}
          />
        </>
      )}
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
            <OverlayButton
              label={props.audioOnly ? "看视频" : "听音频"}
              selected={props.audioOnly}
              onPress={props.onToggleAudioOnly}
            />
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
