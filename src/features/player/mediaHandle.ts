import type { VideoPlayer } from "expo-video";

/**
 * 可回看窗口至少达到此长度时，才视为回看（DVR）。普通直播
 * HLS 通常只保留少量分片（远少于一分钟），显示时间轴会让用户
 * 误以为可以跳转到流实际不支持的位置。
 */
export const CATCHUP_MIN_WINDOW_S = 120;
/** “回到直播”跳到窗口末端之前的这个位置，而非最后一帧。 */
export const LIVE_EDGE_MARGIN_S = 10;

export interface MediaInfo {
  isLive: boolean;
  /** 只有支持回看的直播窗口和有限时长点播支持拖动进度。 */
  seekable: boolean;
}
export interface MediaTimeline {
  /** 距可跳转窗口（或文件）起点的秒数。 */
  position: number;
  /** 直播的可跳转窗口或点播的总时长，单位为秒。 */
  duration: number;
}

export function seekableMedia(isLive: boolean, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  return isLive ? duration >= CATCHUP_MIN_WINDOW_S : true;
}

const NO_INFO: MediaInfo = { isLive: false, seekable: false };

/** UI 操作当前原生播放尝试的窄接口：无需重连即可播放、暂停和跳转，并提供采样时间轴；它从不暴露流地址。基本信息与时间轴使用独立快照，使每秒只重渲染时间轴视图。 */
export class MediaHandle {
  private player: VideoPlayer | null = null;
  private enterPictureInPicture: (() => Promise<void>) | null = null;

  attachPictureInPicture(player: VideoPlayer, enter: () => Promise<void>) {
    if (this.player === player) this.enterPictureInPicture = enter;
  }

  async startPictureInPicture(): Promise<boolean> {
    try {
      if (!this.enterPictureInPicture) return false;
      await this.enterPictureInPicture();
      return true;
    } catch {
      return false;
    }
  }
  private info: MediaInfo = NO_INFO;
  private timeline: MediaTimeline | null = null;
  private infoListeners = new Set<() => void>();
  private timelineListeners = new Set<() => void>();

  attach(player: VideoPlayer) {
    this.player = player;
    this.enterPictureInPicture = null;
    this.publish(NO_INFO, null);
  }
  /** 只有附加此实例的播放器可以解除绑定，新尝试可能已经接管。 */
  detach(player: VideoPlayer) {
    if (this.player !== player) return;
    this.player = null;
    this.enterPictureInPicture = null;
    this.publish(NO_INFO, null);
  }
  /** 采样已连接的播放器；释放之后读取原生属性可能抛错。 */
  sample(player: VideoPlayer) {
    if (this.player !== player) return;
    try {
      const duration = player.duration;
      const isLive = player.isLive;
      const seekable = seekableMedia(isLive, duration);
      this.publish(
        { isLive, seekable },
        seekable
          ? {
              duration,
              position: Math.min(Math.max(player.currentTime, 0), duration),
            }
          : null,
      );
    } catch {
      /* 原生对象可能已经被销毁。 */
    }
  }
  private publish(info: MediaInfo, timeline: MediaTimeline | null) {
    if (
      info.isLive !== this.info.isLive ||
      info.seekable !== this.info.seekable
    ) {
      this.info = info;
      this.infoListeners.forEach((listener) => listener());
    }
    if (
      timeline?.position !== this.timeline?.position ||
      timeline?.duration !== this.timeline?.duration
    ) {
      this.timeline = timeline;
      this.timelineListeners.forEach((listener) => listener());
    }
  }

  getInfo = () => this.info;
  getTimeline = () => this.timeline;
  subscribeInfo = (listener: () => void) => {
    this.infoListeners.add(listener);
    return () => {
      this.infoListeners.delete(listener);
    };
  };
  subscribeTimeline = (listener: () => void) => {
    this.timelineListeners.add(listener);
    return () => {
      this.timelineListeners.delete(listener);
    };
  };

  /** 没有绑定可操作的播放器时返回 false。 */
  play(): boolean {
    return this.act((player) => player.play());
  }
  pause(): boolean {
    return this.act((player) => player.pause());
  }
  seekTo(seconds: number): boolean {
    const timeline = this.timeline;
    if (!timeline) return false;
    const target = Math.min(Math.max(seconds, 0), timeline.duration);
    return this.act((player) => {
      player.currentTime = target;
      this.sample(player);
    });
  }
  /** 近似的直播边缘；expo-video 没有提供跳到默认位置的接口。 */
  goLive(): boolean {
    const timeline = this.timeline;
    if (!timeline || !this.info.isLive) return false;
    return this.seekTo(timeline.duration - LIVE_EDGE_MARGIN_S);
  }
  private act(action: (player: VideoPlayer) => void): boolean {
    const player = this.player;
    if (!player) return false;
    try {
      action(player);
      return true;
    } catch {
      return false;
    }
  }
}
