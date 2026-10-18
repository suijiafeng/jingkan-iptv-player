import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet } from "react-native";
import {
  createVideoPlayer,
  VideoView,
  type VideoPlayer,
  type VideoSource,
  isPictureInPictureSupported,
} from "expo-video";
import type { MediaHandle } from "./mediaHandle";
import { PlaybackController } from "./playbackController";
import { classifyPlayerError } from "./sourceFailover";
import { resolveContentType } from "./streamFormat";

interface Props {
  backgroundAllowed?: boolean;
  title?: string;
  uri: string;
  attemptId: number;
  controller: PlaybackController;
  /** 应用自己的覆盖控件通过此句柄驱动播放、暂停和跳转。 */
  media?: MediaHandle;
}

/** 一次尝试只持有一个播放器实例，绝不替换上一频道的实例。 */
export function NativeAttempt({
  uri,
  attemptId,
  controller,
  media,
  backgroundAllowed = false,
  title = "静看",
}: Props) {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const view = useRef<VideoView>(null);
  const backgroundPolicy = useRef(backgroundAllowed);
  const pipActive = useRef(false);
  const exitPictureInPicture = useRef<(() => void) | null>(null);
  const pendingPip = useRef<{
    resolve: () => void;
    reject: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const alive = useRef(false);
  const currentInstance = useRef<VideoPlayer | null>(null);
  useEffect(() => {
    backgroundPolicy.current = backgroundAllowed;
    if (currentInstance.current) {
      currentInstance.current.staysActiveInBackground =
        backgroundAllowed || pipActive.current || !!pendingPip.current;
      currentInstance.current.showNowPlayingNotification =
        backgroundAllowed || pipActive.current || !!pendingPip.current;
    }
  }, [backgroundAllowed]);
  useEffect(() => {
    alive.current = true;
    let live = true;
    let instance: VideoPlayer | undefined;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let settleExit: (() => void) | undefined;
    const sniff = new AbortController();
    const subscriptions: { remove: () => void }[] = [];
    const current = () => live && controller.isCurrentAttempt(attemptId);
    try {
      // 先创建空实例：控制器允许后，才向它提供媒体来源。
      instance = createVideoPlayer(null);
      const ownedPlayer = instance;
      currentInstance.current = instance;
      ownedPlayer.audioMixingMode = "doNotMix";
      ownedPlayer.staysActiveInBackground = backgroundPolicy.current;
      ownedPlayer.showNowPlayingNotification = backgroundPolicy.current;
      ownedPlayer.allowsExternalPlayback = false;
      ownedPlayer.keepScreenOnWhilePlaying = true;
      ownedPlayer.loop = false;
      // 每秒采样一次，驱动覆盖层时间轴（只用于支持回看的流）。
      ownedPlayer.timeUpdateEventInterval = 1;
      settleExit = () => {
        if (exitTimer !== undefined) clearTimeout(exitTimer);
        exitTimer = undefined;
        if (!live) return;
        pipActive.current = false;
        ownedPlayer.staysActiveInBackground = backgroundPolicy.current;
        ownedPlayer.showNowPlayingNotification = backgroundPolicy.current;
        controller.setPictureInPicture(attemptId, false);
      };
      exitPictureInPicture.current = () => {
        if (exitTimer !== undefined) clearTimeout(exitTimer);
        // Android 可能在 React Native 收到 onResume 之前报告退出画中画。
        // 在这段有界的事件顺序差内保留同一次播放尝试；真正的
        // 在关闭后台播放时，系统小窗被关闭后仍会延迟一秒暂停。
        if (AppState.currentState === "active") settleExit?.();
        else exitTimer = setTimeout(() => settleExit?.(), 1000);
      };
      media?.attach(ownedPlayer);
      media?.attachPictureInPicture(ownedPlayer, async () => {
        if (!current() || !view.current || !isPictureInPictureSupported())
          throw new Error("Picture in picture unavailable");
        if (pendingPip.current || pipActive.current) return;
        // 原生调用之前先预留状态：Android 可能将 Activity 切到后台
        // 然后才向 JavaScript 发送 onPictureInPictureStart。
        controller.setPictureInPicture(attemptId, true);
        ownedPlayer.staysActiveInBackground = true;
        ownedPlayer.showNowPlayingNotification = true;
        let entryTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            const failed = () => reject(new Error("Picture in picture failed"));
            entryTimer = setTimeout(failed, 5000);
            pendingPip.current = { resolve, reject: failed, timer: entryTimer };
            void view.current!.startPictureInPicture().catch(failed);
          });
        } catch {
          if (current()) {
            ownedPlayer.staysActiveInBackground = backgroundPolicy.current;
            ownedPlayer.showNowPlayingNotification = backgroundPolicy.current;
            controller.setPictureInPicture(attemptId, false);
          }
          throw new Error("Picture in picture failed");
        } finally {
          if (entryTimer !== undefined) clearTimeout(entryTimer);
          pendingPip.current = null;
        }
      });
      subscriptions.push(
        ownedPlayer.addListener("statusChange", ({ status, error }) => {
          if (!current()) return;
          media?.sample(ownedPlayer);
          // 只有粗粒度错误分类离开这个闭包，原始错误消息不会外传。
          controller.nativeStatus(
            attemptId,
            status,
            classifyPlayerError(error?.message),
          );
        }),
        ownedPlayer.addListener("timeUpdate", () => {
          if (current()) media?.sample(ownedPlayer);
        }),
        ownedPlayer.addListener("playingChange", ({ isPlaying }) => {
          if (!current()) return;
          if (isPlaying) controller.nativeStarted(attemptId);
          else if (ownedPlayer.status === "readyToPlay")
            controller.nativeStopped(attemptId);
        }),
        ownedPlayer.addListener("playToEnd", () => {
          if (current()) controller.nativeEnded(attemptId);
        }),
        AppState.addEventListener("change", (state) => {
          if (state === "active" && exitTimer !== undefined) settleExit?.();
          if (state !== "active" && !controller.canContinueOutsideApp()) {
            // 在 React 提交控制器卸载之前，先同步暂停。
            ownedPlayer.pause();
            controller.appStateChanged(state);
          }
        }),
      );
      // 这个 effect 持有外部原生资源，因此不能在
      // 不能在渲染过程中创建；构造完成后再向 VideoView 提供句柄。
      setPlayer(ownedPlayer);
      if (current()) {
        // 对没有后缀的地址，先做一次限制为 1 KiB 的格式探测；
        // 否则 ExoPlayer 会把无扩展名的 HLS 当作普通文件打开。
        void resolveContentType(uri, sniff.signal)
          .then((contentType) => {
            if (!current()) return;
            const source: VideoSource = {
              uri,
              useCaching: false,
              metadata: { title },
              ...(contentType === "auto" ? {} : { contentType }),
            };
            return ownedPlayer.replaceAsync(source).then(() => {
              if (current()) ownedPlayer.play();
            });
          })
          .catch((reason: unknown) => {
            // Expo 58 只提供 PlayerError.message；不能据此声称已取得 HTTP 状态码、
            // 过期或认证状态不能根据厂商的非结构化错误字符串推断。
            if (current())
              controller.nativeStatus(
                attemptId,
                "error",
                classifyPlayerError(
                  reason instanceof Error ? reason.message : null,
                ),
              );
          });
      }
    } catch {
      if (current()) controller.nativeStatus(attemptId, "error");
    }
    return () => {
      alive.current = false;
      live = false;
      if (exitTimer !== undefined) clearTimeout(exitTimer);
      exitPictureInPicture.current = null;
      if (pendingPip.current) {
        clearTimeout(pendingPip.current.timer);
        pendingPip.current.reject();
        pendingPip.current = null;
      }
      pipActive.current = false;
      controller.setPictureInPicture(attemptId, false);
      sniff.abort();
      currentInstance.current = null;
      subscriptions.forEach((subscription) => subscription.remove());
      if (instance) {
        media?.detach(instance);
        try {
          instance.pause();
        } catch {
          /* 原生对象可能已经销毁。 */
        }
        try {
          instance.release();
        } catch {
          /* 原生对象销毁后，只能尽力释放资源。 */
        }
      }
    };
  }, [uri, attemptId, controller, media, title]);

  if (!player) return null;
  return (
    <VideoView
      ref={view}
      testID="native-video-view"
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      surfaceType="textureView"
      // 应用为两种模式绘制同一层覆盖控件；原生控件会额外添加一层
      // 否则会出现第二层不同步的控件，并拦截换台手势。
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture
      startsPictureInPictureAutomatically={false}
      allowsVideoFrameAnalysis={false}
      onPictureInPictureStart={() => {
        if (
          player !== currentInstance.current ||
          !controller.isCurrentAttempt(attemptId)
        )
          return;
        pipActive.current = true;
        pendingPip.current?.resolve();
        controller.setPictureInPicture(attemptId, true);
      }}
      onPictureInPictureStop={() => {
        if (currentInstance.current && player === currentInstance.current) {
          exitPictureInPicture.current?.();
        }
      }}
      useExoShutter
      onFirstFrameRender={() => {
        if (alive.current && player === currentInstance.current)
          controller.nativeStarted(attemptId);
      }}
    />
  );
}
