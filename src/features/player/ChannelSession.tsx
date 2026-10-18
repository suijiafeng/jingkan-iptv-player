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
import {
  LoadingTitle,
  MediaStatus,
  OverlayButton,
  Shade,
  WaitProgress,
} from "./overlayWidgets";
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
    starting,
    retained,
    primaryLabel,
    primaryAction,
    title,
    osd,
    zap,
    description,
    pausedBody,
    primaryIcon,
    primaryDisabled,
    zapCluster,
    sourceButton,
    favoriteButton,
  } = view;
  // 先显示标题，再用一行说明当前状态及相关提示。
  const failed = state.phase === "timeout" || state.phase === "error";
  const noticeLine = [
    state.phase === "paused" ? pausedBody : description.body,
    failed ? props.failover.failedBody : "",
    failed && props.channel.checkStatus === "unreachable"
      ? "上次检测也打不开"
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
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
          />
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
        {props.fullscreen && !controlsVisible && state.phase === "playing" && (
          <View
            style={[sessionStyles.swipeHint, { right: insets.right + 14 }]}
            pointerEvents="none"
          >
            <Text style={sessionStyles.swipeHintText}>上下滑动换台</Text>
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
            // box-none：在遮暗区域滑动时，事件仍会传给手势层。
            <View
              style={[
                sessionStyles.videoNotice,
                waiting && sessionStyles.videoNoticeSoft,
              ]}
              pointerEvents="box-none"
              accessibilityLiveRegion="polite"
            >
              <View pointerEvents="none" style={sessionStyles.noticeText}>
                {waiting ? (
                  <LoadingTitle
                    title={description.title}
                    style={sessionStyles.noticeTitle}
                  />
                ) : (
                  !(state.phase === "paused" && !pausedBody) && (
                    <Text style={sessionStyles.noticeTitle}>
                      {description.title}
                    </Text>
                  )
                )}
                {waiting ? (
                  <WaitProgress key={state.attemptId ?? "checking"} />
                ) : (
                  !!noticeLine && (
                    <Text style={sessionStyles.noticeBody} numberOfLines={1}>
                      {noticeLine}
                    </Text>
                  )
                )}
              </View>
              {(state.attemptId === null || starting) && zapCluster(false)}
              {state.phase === "cellular" && (
                <Pressable
                  style={sessionStyles.quietLink}
                  accessibilityRole="button"
                  accessibilityLabel="暂不播放"
                  onPress={() => controller.pause("cellular-declined")}
                >
                  <Text style={sessionStyles.quietLinkText}>暂不播放</Text>
                </Pressable>
              )}
            </View>
          )}
        {!props.mini && controlsVisible && !props.sheetOpen && (
          <>
            <Shade edge="top" heightRatio={0.46} />
            <Shade edge="bottom" heightRatio={0.52} />
          </>
        )}
        {!props.mini &&
          controlsVisible &&
          !props.sheetOpen &&
          (state.phase === "playing" || retained) &&
          zapCluster(true)}
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
            <View style={sessionStyles.portraitMedia} pointerEvents="box-none">
              <MediaStatus media={media} onScrubbingChange={setScrubbing} />
            </View>
            <View style={sessionStyles.portraitTopLeft}>
              <OverlayButton
                label="收起播放器"
                icon={<ChevronLeftIcon size={20} />}
                variant="quiet"
                accessibilityLabel="收起播放器"
                onPress={props.onClose}
              />
            </View>
            <View style={sessionStyles.portraitBottomRight}>
              <OverlayButton
                label="横屏全屏"
                icon={<FullscreenIcon size={20} />}
                variant="quiet"
                accessibilityLabel="横屏全屏"
                onPress={props.onToggleFullscreen}
              />
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
                ? `${qualityName(props.channel)} · ${props.channel.sourceName}`
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
