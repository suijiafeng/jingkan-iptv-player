import { useRef, useState, type MutableRefObject } from "react";
import type { Repository } from "../../data/repository";
import { uniqueStreams } from "../../domain/channelSources";
import type { Channel } from "../../domain/types";

/**
 * 管理当前播放内容、换台队列及前一个频道。每个异步步骤都会重新检查：
 * 当前请求是否仍是最新请求，以及期间是否撤销过联网许可。
 */
export function usePlayback({
  repo,
  setError,
  mounted,
  permissionEpoch,
  guardRemote,
  channels,
  listSettled,
  fullList,
}: {
  repo: Repository | null;
  setError: (message: string) => void;
  mounted: MutableRefObject<boolean>;
  permissionEpoch: MutableRefObject<number>;
  guardRemote: () => Promise<boolean>;
  channels: Channel[];
  listSettled: MutableRefObject<boolean>;
  fullList: MutableRefObject<Promise<Channel[]>>;
}) {
  const [playing, setPlaying] = useState<Channel | null>(null),
    // 停靠在频道页上的小条；流继续播放（仅前台，
    // 仅限前台，离开应用仍会暂停）。
    [playerMini, setPlayerMini] = useState(false),
    [playingSources, setPlayingSources] = useState<Channel[]>([]),
    // 用于“回到上一个频道”：当前频道之前观看的频道。
    [previousChannel, setPreviousChannel] = useState<Channel | null>(null),
    [playQueue, setPlayQueue] = useState<Channel[]>([]);
  const playGeneration = useRef(0),
    lastWatched = useRef<Channel | null>(null);

  /** 刷新或删除后，重新读取当前频道的来源。 */
  const reconcilePlayingSources = async (current = playing) => {
    if (!repo || !current) return;
    const task = playGeneration.current;
    const epoch = permissionEpoch.current;
    const fresh = await repo.getChannel(current.id);
    const groupKey =
      fresh?.active && fresh.groupKey
        ? fresh.groupKey
        : (current.groupKey ?? current.id);
    const alternatives = uniqueStreams(
      await repo.listChannelSources(groupKey),
      current.id,
    );
    if (
      !mounted.current ||
      task !== playGeneration.current ||
      epoch !== permissionEpoch.current
    )
      return;
    setPlayingSources(alternatives);
    if (!alternatives.length) {
      setPlaying(null);
      return;
    }
    setPlaying(
      alternatives.find((source) => source.id === current.id) ??
        alternatives[0],
    );
  };

  const play = async (channel: Channel, queueFrom?: Channel[]) => {
    if (!repo || !channel.active) return;
    const task = ++playGeneration.current;
    const epoch = permissionEpoch.current;
    const stillWanted = () =>
      mounted.current &&
      task === playGeneration.current &&
      epoch === permissionEpoch.current;
    // 从当前可见页面开始；补全播放队列不能延迟起播。
    const wholeList = listSettled.current ? null : fullList.current;
    try {
      if (!(await guardRemote()) || epoch !== permissionEpoch.current) return;
      const queue = queueFrom ?? channels;
      // 只读取当前频道，使播放器立即打开；加载一万条以上
      // 先加载整个频道目录，在模拟器上曾耗时约 5 秒。
      const fresh = await repo.getChannel(channel.id);
      if (!stillWanted()) return;
      const representative = fresh?.active ? fresh : null;
      if (!representative) {
        setError("频道已不可用");
        return;
      }
      const alternatives = uniqueStreams(
        await repo.listChannelSources(
          representative.groupKey ?? representative.id,
        ),
      );
      if (!stillWanted()) return;
      setPlayQueue(queue.filter((queued) => queued.active));
      const playable = alternatives[0] ?? representative;
      setPlayingSources(alternatives.length ? alternatives : [representative]);
      const watchedBefore = playing ?? lastWatched.current;
      if (watchedBefore && watchedBefore.id !== playable.id)
        setPreviousChannel(watchedBefore);
      setPlaying(playable);
      // 从频道页或小窗自身列表选择频道时，打开完整播放器。
      setPlayerMini(false);
      // 列表 Promise 总以已读取到的数据完成，绝不拒绝。
      if (!queueFrom && wholeList)
        void wholeList.then((complete) => {
          if (stillWanted() && complete.length)
            setPlayQueue(complete.filter((queued) => queued.active));
        });
    } catch {
      if (stillWanted()) setError("频道读取未完成，请重试");
    }
  };

  const stopPlayback = () => {
    ++playGeneration.current;
    setPlaying(null);
    setPlayingSources([]);
  };

  const closePlayer = () => {
    lastWatched.current = playing;
    stopPlayback();
    setPlayerMini(false);
  };

  /** 只切换同一逻辑频道的其它来源。 */
  const selectSource = (source: Channel) => {
    if (
      !playing ||
      !source.active ||
      !playingSources.some(
        (available) =>
          available.id === source.id &&
          available.streamUrl === source.streamUrl,
      ) ||
      (source.groupKey ?? source.id) !== (playing.groupKey ?? playing.id)
    )
      return;
    ++playGeneration.current;
    setPlaying(source);
  };

  /** 删除的来源不能通过“回到上一个频道”重新出现。 */
  const forgetSource = (sourceId: string) => {
    if (previousChannel?.sourceId === sourceId) setPreviousChannel(null);
    if (lastWatched.current?.sourceId === sourceId) lastWatched.current = null;
  };

  const forgetHistory = () => {
    setPreviousChannel(null);
    lastWatched.current = null;
  };

  /**
   * 将本地行变更应用到播放器持有的频道副本；只涉及播放队列的修改
   * 不改变来源列表。
   */
  const patchChannels = (
    patch: (channel: Channel) => Channel,
    { includeSources = true } = {},
  ) => {
    setPlaying((current) => (current ? patch(current) : current));
    if (includeSources) setPlayingSources((items) => items.map(patch));
    setPlayQueue((items) => items.map(patch));
  };

  return {
    playing,
    playerMini,
    setPlayerMini,
    playingSources,
    previousChannel,
    playQueue,
    play,
    reconcilePlayingSources,
    stopPlayback,
    closePlayer,
    selectSource,
    forgetSource,
    forgetHistory,
    patchChannels,
  };
}

export type Playback = ReturnType<typeof usePlayback>;
