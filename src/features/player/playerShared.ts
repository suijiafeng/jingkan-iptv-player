import type { Channel } from "../../domain/types";
import type { PlaybackSnapshot } from "./playbackController";
import type { HeaderProps, ListTab } from "../channel/ChannelListParts";

/** 频道页的列表与筛选，在播放器选台面板中显示。 */
export interface ChannelSheetProps {
  /** 页面共享的唯一筛选状态，包括标签、搜索、来源和维度。 */
  filters: HeaderProps;
  onTabChange: (tab: ListTab) => void;
  /** 页面当前结果及其顺序；不可用频道放在最后。 */
  channels: Channel[];
  /** 标识当前显示的结果；下一份结果加载期间为 null。 */
  rangeKey: string | null;
  loading: boolean;
  /** 绕过国家限制显示所有频道，以便列出正在播放的频道。 */
  onLocate: () => void;
}

export interface PlayerScreenProps {
  channel: Channel;
  channels: Channel[];
  /** 同一逻辑频道的其它播放地址。 */
  sources: Channel[];
  /** 频道页的列表与筛选状态；channels 仍然是播放队列。 */
  sheet: ChannelSheetProps;
  onSelect: (channel: Channel, queue?: Channel[]) => void;
  onSelectSource: (source: Channel) => void;
  onClose: () => void;
  onFavorite: (channel: Channel) => void;
  onStarted: (channel: Channel) => void;
  onAvailability?: (channel: Channel, ok: boolean) => void;
  remoteAllowed: boolean;
  mobileWarning: boolean;
  backgroundAllowed?: boolean;
  onEnableBackgroundPlayback?: () => void;
  /** 用户已选择在可能计费的网络上继续播放。 */
  onMobileAccepted?: () => void;
  /** 继续时若勾选了“不再提醒”，则关闭“移动网络提醒”。 */
  onStopMobileReminders?: () => void;
  /** 全屏上滑默认切换下一台；true 则反转方向（“我的电视”的“换台反转”）。 */
  swipeReverse?: boolean;
  /** 当前频道之前观看的频道，供一键返回。 */
  previousChannel?: Channel | null;
  artworkEnabled?: boolean;
  error?: string;
  onDismissError?: () => void;
  /**
   * 以小浮窗停靠在频道页上，同时继续播放（后台行为遵循播放设置）。
   * 外层切换容器尺寸，会话、播放器实例和媒体流始终保持挂载。
   */
  mini?: boolean;
  /**
   * 停靠画面的尺寸，单位为 dp。原生视频视图必须拿到明确的数值尺寸
   * 才会更新布局；仅使用 flex 时曾一直保留旧的画面边界。
   */
  miniSize?: { width: number; height: number };
  /** 竖屏返回，包括返回键和箭头：缩到小窗，而非停止播放。 */
  onMinimize?: () => void;
  onExpand?: () => void;
}

export const descriptions: Record<
  PlaybackSnapshot["phase"],
  { title: string; body: string }
> = {
  paused: { title: "已暂停", body: "" },
  checking: { title: "正在检查网络", body: "" },
  connecting: { title: "正在连接", body: "" },
  playing: { title: "正在播放", body: "" },
  buffering: { title: "正在缓冲", body: "" },
  cellular: {
    title: "正在用移动数据",
    body: "本次不再提醒，连回 Wi-Fi 后重置",
  },
  blocked: { title: "还没允许联网", body: "去设置里允许后再播放" },
  offline: { title: "没有网络", body: "连上后再试" },
  timeout: { title: "连接超时，可重试", body: "" },
  error: { title: "当前来源暂时无法播放", body: "" },
  ended: { title: "直播已结束", body: "" },
};

export const CONTROLS_HIDE_MS = 4000;
/** 媒体流开始后首次显示控件时多停留片刻，便于用户找到按钮。 */
export const CONTROLS_FIRST_HIDE_MS = 6000;
/** 全屏切台后的频道名称和位置提示层。 */
export const OSD_MS = 2500;
/** 超过这段时间仍无画面时，建议换台（规范要求在 15 秒提示）。 */
export const SLOW_START_SECONDS = 15;
/** 全屏滑动换台所需的最小垂直距离，单位为 dp。 */
export const SWIPE_MIN_DP = 60;
export const TAP_SLOP_DP = 12;
export const sameChannel = (left: Channel, right: Channel) =>
  (left.groupKey ?? left.id) === (right.groupKey ?? right.id);

/** 全屏和面板由页面持有，不属于可被替换的频道。 */
