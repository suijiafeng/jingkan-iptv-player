import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet } from "react-native";
import {
  createVideoPlayer,
  VideoView,
  type VideoPlayer,
  type VideoSource,
} from "expo-video";
import type { MediaHandle } from "./mediaHandle";
import { PlaybackController } from "./playbackController";
import { resolveContentType } from "./streamFormat";

interface Props {
  uri: string;
  attemptId: number;
  controller: PlaybackController;
  /** 应用自己的覆盖控件通过此句柄驱动播放、暂停和跳转。 */
  media?: MediaHandle;
}

/** 一次尝试只持有一个播放器实例，绝不替换上一频道的实例。 */
export function NativeAttempt({ uri, attemptId, controller, media }: Props) {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const alive = useRef(false);
  const currentInstance = useRef<VideoPlayer | null>(null);
  useEffect(() => {
    alive.current = true;
    let live = true;
    let instance: VideoPlayer | undefined;
    const sniff = new AbortController();
    const subscriptions: { remove: () => void }[] = [];
    const current = () =>
      live &&
      controller.isCurrentAttempt(attemptId) &&
      AppState.currentState === "active";
    try {
      // 先创建空实例：控制器允许后，才向它提供媒体来源。
      instance = createVideoPlayer(null);
      const ownedPlayer = instance;
      currentInstance.current = instance;
      ownedPlayer.audioMixingMode = "doNotMix";
      ownedPlayer.staysActiveInBackground = false;
      ownedPlayer.showNowPlayingNotification = false;
      ownedPlayer.allowsExternalPlayback = false;
      ownedPlayer.keepScreenOnWhilePlaying = true;
      ownedPlayer.loop = false;
      // 每秒采样一次，驱动覆盖层时间轴（只用于支持回看的流）。
      ownedPlayer.timeUpdateEventInterval = 1;
      media?.attach(ownedPlayer);
      subscriptions.push(
        ownedPlayer.addListener("statusChange", ({ status }) => {
          if (!current()) return;
          media?.sample(ownedPlayer);
          controller.nativeStatus(attemptId, status);
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
          if (state !== "active") {
            // 在 React 提交控制器卸载之前，先同步暂停。
            ownedPlayer.pause();
            controller.appStateChanged(state);
          }
        }),
      );
      // 这个 effect 持有外部原生资源，因此不能在
      // 不能在渲染过程中创建；构造完成后再向 VideoView 提供句柄。
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
              ...(contentType === "auto" ? {} : { contentType }),
            };
            return ownedPlayer.replaceAsync(source).then(() => {
              if (current()) ownedPlayer.play();
            });
          })
          .catch(() => {
            // Expo 58 只提供 PlayerError.message；不能据此声称已取得 HTTP 状态码、
            // 过期或认证状态不能根据厂商的非结构化错误字符串推断。
            if (current()) controller.nativeStatus(attemptId, "error");
          });
      }
    } catch {
      if (current()) controller.nativeStatus(attemptId, "error");
    }
    return () => {
      alive.current = false;
      live = false;
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
  }, [uri, attemptId, controller, media]);

  if (!player) return null;
  return (
    <VideoView
      testID="native-video-view"
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      surfaceType="textureView"
      // 应用为两种模式绘制同一层覆盖控件；原生控件会额外添加一层
      // 否则会出现第二层不同步的控件，并拦截换台手势。
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      startsPictureInPictureAutomatically={false}
      allowsVideoFrameAnalysis={false}
      useExoShutter
      onFirstFrameRender={() => {
        if (alive.current && player === currentInstance.current)
          controller.nativeStarted(attemptId);
      }}
    />
  );
}
