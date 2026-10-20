import type { Channel } from "../../domain/types";
import { compareChannelSources } from "../../domain/channelSources";

/** 播放尝试未产生画面就结束的原因。“unknown”表示原生播放器报告了无法归因于流本身的问题，例如解码器、运行时或无法辨识的厂商消息；这类问题只允许手动重试。 */
export type AttemptFailure = "timeout" | "network" | "media" | "unknown";

/** 换用同一频道的其他地址可能避免的故障。 */
export const isSwitchableFailure = (failure: AttemptFailure) =>
  failure !== "unknown";

/**
 * 保守解析 expo-video 唯一的 `PlayerError.message` 字符串；
 * Android 会在其中包装 ExoPlayer 的错误消息和原因。只识别明确的
 * 传输和媒体容器错误，不保留消息中的任何内容。
 */
export function classifyPlayerError(
  message: string | null | undefined,
): Exclude<AttemptFailure, "timeout"> {
  const text = message ?? "";
  if (
    /Response code: \d{3}|InvalidResponseCode|Unable to connect|HttpDataSource|UnknownHost|SocketTimeout|ConnectException|SSLHandshake|SSLException|Cleartext HTTP traffic|ERROR_CODE_IO_/i.test(
      text,
    )
  )
    return "network";
  if (
    /UnrecognizedInputFormat|ParserException|BehindLiveWindow|ERROR_CODE_PARSING_|Input does not start with the #EXTM3U header|None of the available extractors|Source error/i.test(
      text,
    )
  )
    return "media";
  return "unknown";
}

/** 来源排列顺序与列表展示及自动切源顺序一致。 */
export function orderedSources(sources: readonly Channel[]): Channel[] {
  return [...sources].sort(compareChannelSources);
}

/**
 * 当前地址在给定 `sources` 中的位置，从 1 开始；该顺序就是来源列表
 * 的显示顺序，按钮和切换提示也使用它。故障切换则按清晰度顺序尝试。
 */
export function sourcePosition(
  sources: readonly Channel[],
  current: Pick<Channel, "id">,
): { index: number; total: number } | null {
  const index = sources.findIndex((source) => source.id === current.id);
  return index < 0 ? null : { index: index + 1, total: sources.length };
}

/**
 * 从 `current` 之后按顺序寻找本轮尚未尝试的地址；到末尾后绕回开头，
 * 使手动选择的起点之后仍能尝试其它来源。
 * 本轮所有来源都已尝试时返回 null。
 */
export function nextUntriedSource(
  sources: readonly Channel[],
  current: Pick<Channel, "id">,
  tried: readonly string[],
): Channel | null {
  const ordered = orderedSources(sources);
  const start = ordered.findIndex((source) => source.id === current.id);
  if (start < 0 || ordered.length < 2) return null;
  for (let step = 1; step < ordered.length; step += 1) {
    const candidate = ordered[(start + step) % ordered.length];
    if (!tried.includes(candidate.id) && candidate.id !== current.id)
      return candidate;
  }
  return null;
}

/** 对某个频道的地址执行一轮尝试；每轮中每个来源只尝试一次。 */
export interface FailoverRound {
  groupKey: string;
  /** 本轮中播放尝试已经失败的频道 ID。 */
  tried: string[];
  /** 如果当前地址是本轮自动切换到的地址，则在此记录。 */
  autoSelected: string | null;
}

export const sourceGroupKey = (channel: Pick<Channel, "id" | "groupKey">) =>
  channel.groupKey ?? channel.id;

export const freshRound = (channel: Channel): FailoverRound => ({
  groupKey: sourceGroupKey(channel),
  tried: [],
  autoSelected: null,
});

/** 把 current 的一次失败应用到本轮尝试，返回后续保留的轮次状态及要切换的来源；来源为 null 时保持当前线路，由用户手动重试。 */
export function advanceRound(
  round: FailoverRound | null,
  current: Channel,
  sources: readonly Channel[],
  failure: AttemptFailure,
): { round: FailoverRound; next: Channel | null } {
  const base =
    round && round.groupKey === sourceGroupKey(current)
      ? round
      : freshRound(current);
  // 每次尝试的相同故障只报告一次，重复报告不改变状态。
  if (base.tried.includes(current.id)) return { round: base, next: null };
  const tried = [...base.tried, current.id];
  const next = isSwitchableFailure(failure)
    ? nextUntriedSource(sources, current, tried)
    : null;
  return {
    round: { ...base, tried, autoSelected: next ? next.id : null },
    next,
  };
}

/** 自动切换线路并连接时的状态文字，绝不显示地址。 */
export const switchingTitle = (position: { index: number; total: number }) =>
  `来源 ${position.index}/${position.total} 连接中`;
