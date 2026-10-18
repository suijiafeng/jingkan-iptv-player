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
  remoteAllowed: boolean;
  mobileWarning: boolean;
  /** 用户已选择在可能计费的网络上继续播放。 */
  onMobileAccepted?: () => void;
  /** 全屏上滑默认切换下一台；true 则反转方向（“我的电视”的“换台反转”）。 */
  swipeReverse?: boolean;
  /** 上一台和下一台会跳过最近一次手动检测发现不可达的频道。 */
  skipUnreachable?: boolean;
  /** 当前频道之前观看的频道，供一键返回。 */
  previousChannel?: Channel | null;
  artworkEnabled?: boolean;
  error?: string;
  onDismissError?: () => void;
  /**
   * 停靠为频道页上的小条，同时继续播放（仅限前台，离开应用仍会暂停）。
   * 外层调整容器尺寸，会话、播放器实例和媒体流始终保持挂载。
   */
  mini?: boolean;
  /** 竖屏返回键：缩到小窗，而不是停止播放。 */
  onMinimize?: () => void;
  onExpand?: () => void;
}

export const descriptions: Record<
  PlaybackSnapshot["phase"],
  { title: string; body: string }
> = {
  paused: { title: "已暂停", body: "点击播放，继续收看当前频道" },
  checking: { title: "正在检查网络", body: "确认连接后开始播放" },
  connecting: { title: "正在连接频道", body: "首次加载最多等待 30 秒" },
  playing: { title: "正在播放", body: "画面来自你的节目源" },
  buffering: { title: "正在缓冲", body: "等待节目源传送画面" },
  cellular: {
    title: "可能使用移动数据",
    body: "当前网络可能产生流量费用。继续后，连回 Wi-Fi 之前不再询问。",
  },
  blocked: {
    title: "外部连接已关闭",
    body: "返回设置，允许连接自己的节目源后再播放",
  },
  offline: { title: "网络未连接", body: "检查网络连接，然后手动重试" },
  timeout: {
    title: "连接超时",
    body: "30 秒内未开始播放。节目源可能已失效、受地区限制或暂时不可用。可以重试、换台，或在来源管理中检测可用性",
  },
  error: {
    title: "暂时无法播放",
    body: "原因未确定（播放器没有提供可靠的细分原因）。常见情况：地址失效、地区限制、服务器拒绝或格式不支持。可以重试、换台，或在来源管理中检测可用性",
  },
  ended: { title: "节目流已结束", body: "可以重试连接，或选择其他频道" },
};

export const CONTROLS_HIDE_MS = 4000;
/** 全屏切台后的频道名称和位置提示层。 */
export const OSD_MS = 2500;
/** 超过这段时间仍无画面时，建议换台（规范要求在 15 秒提示）。 */
export const SLOW_START_SECONDS = 15;
/** 全屏滑动换台所需的最小垂直距离，单位为 dp。 */
export const SWIPE_MIN_DP = 60;
export const TAP_SLOP_DP = 12;
export const sameChannel = (a: Channel, b: Channel) =>
  (a.groupKey ?? a.id) === (b.groupKey ?? b.id);

/** 全屏和面板由页面持有，不属于可被替换的频道。 */
