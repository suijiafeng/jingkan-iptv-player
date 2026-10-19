import { useCallback, useMemo, useState } from "react";
import type { Channel } from "../../domain/types";
import {
  advanceRound,
  type AttemptFailure,
  type FailoverRound,
  freshRound,
  sourceGroupKey,
  sourcePosition,
  switchingTitle,
} from "./sourceFailover";

/** 频道会话除上报结果外，还需要的自动切源状态。 */
export interface FailoverView {
  /** 自动切换后连接期间显示的标题，其他情况为 null。 */
  connectingTitle: string | null;
  /** 本次尝试没有产生画面就结束，可能切换到其它地址。 */
  onFailure: (failure: AttemptFailure) => void;
  /** 用户开始播放、重试或继续时，启动新一轮尝试。 */
  onUserPlay: () => void;
}

/**
 * 状态位于每条流对应的会话之上，地址变化导致会话重新挂载时，本轮尝试仍保留。
 * 只有超时及明确分类的网络或媒体错误才自动切换；离线、移动数据确认、
 * 联网被禁用、暂停及未知原生错误都留给用户手动重试。
 */
export function useSourceFailover(
  channel: Channel,
  sources: readonly Channel[],
  onSelectSource: (source: Channel) => void,
): FailoverView & { onManualSelect: (source: Channel) => void } {
  const [round, setRound] = useState<FailoverRound | null>(null);
  const current =
    round && round.groupKey === sourceGroupKey(channel) ? round : null;
  const onFailure = useCallback(
    (failure: AttemptFailure) => {
      const result = advanceRound(round, channel, sources, failure);
      setRound(result.round);
      if (result.next) onSelectSource(result.next);
    },
    [round, channel, sources, onSelectSource],
  );
  const onUserPlay = useCallback(() => {
    setRound(freshRound(channel));
  }, [channel]);
  const onManualSelect = useCallback(
    (source: Channel) => {
      setRound(freshRound(source));
      onSelectSource(source);
    },
    [onSelectSource],
  );
  const position = useMemo(
    () => sourcePosition(sources, channel),
    [sources, channel],
  );
  const connectingTitle =
    current?.autoSelected === channel.id && position
      ? switchingTitle(position)
      : null;
  return { connectingTitle, onFailure, onUserPlay, onManualSelect };
}
