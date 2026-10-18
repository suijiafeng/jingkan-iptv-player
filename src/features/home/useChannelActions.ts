import { useRef, useState, type MutableRefObject } from "react";
import type { Repository } from "../../data/repository";
import type { Channel } from "../../domain/types";
import { confirm } from "../common/confirm";
import type { ChannelListData } from "./useChannelListData";
import type { Playback } from "./usePlayback";

/**
 * 收藏和观看历史。修改时局部更新屏幕上已有的行，只有列表成员发生变化
 * 时才重新读取。
 */
export function useChannelActions({
  repo,
  setError,
  mounted,
  list,
  playback,
}: {
  repo: Repository | null;
  setError: (message: string) => void;
  mounted: MutableRefObject<boolean>;
  list: ChannelListData;
  playback: Playback;
}) {
  const [recentBusy, setRecentBusy] = useState(false),
    [recentEditing, setRecentEditing] = useState(false);
  const recentMutation = useRef(false);

  const favorite = async (target: Channel) => {
    if (!repo) return;
    try {
      const favorited = await repo.toggleFavorite(target.id);
      const targetKey = target.groupKey ?? target.id;
      const patch = (channel: Channel) =>
        (channel.groupKey ?? channel.id) === targetKey
          ? { ...channel, favorite: favorited }
          : channel;
      playback.patchChannels(patch);
      list.setRecent((items) => items.map(patch));
      list.setChannels((items) => items.map(patch));
      // 对于保留该行的列表，局部更新已经足够；只需重新读取
      // 收藏列表（成员已变化），或读取可能早于
      // 本次写入；绝不按发起时的标签过滤。
      if (list.tabRef.current === "favorites" || !list.listSettled.current)
        list.changed();
      else
        void repo
          .listSources()
          .then((sources) => {
            if (mounted.current) list.setSources(sources);
          })
          .catch(() => {
            if (mounted.current)
              setError("收藏已保存，但来源统计读取失败，请稍后重试。");
          });
    } catch {
      setError("收藏未能保存，请重试");
    }
  };

  /** 从当前显示的历史记录中移除一个频道；不传 id 时移除全部。 */
  const forgetRecent = (channelId?: string) => {
    const patch = (channel: Channel) =>
      !channelId || channel.id === channelId
        ? { ...channel, lastPlayedAt: null }
        : channel;
    list.setRecent((items) =>
      channelId ? items.filter((item) => item.id !== channelId) : [],
    );
    list.setChannels((items) => items.map(patch));
    playback.patchChannels(patch, { includeSources: false });
    list.changed();
  };

  /** 串行执行历史编辑，避免单条删除与全部清空交错。 */
  const mutateRecent = async (mutation: () => Promise<void>) => {
    if (!repo || recentMutation.current) return;
    recentMutation.current = true;
    setRecentBusy(true);
    try {
      await mutation();
    } finally {
      recentMutation.current = false;
      if (mounted.current) setRecentBusy(false);
    }
  };

  const removeRecent = (channel: Channel) =>
    mutateRecent(async () => {
      await repo!.removeRecent(channel.id);
      if (mounted.current) forgetRecent(channel.id);
    });

  const clearRecent = () =>
    mutateRecent(async () => {
      if (
        !(await confirm(
          "清空最近观看？",
          "只删除观看记录，收藏与频道保留。",
          "清空",
        ))
      )
        return;
      await repo!.clearRecent();
      if (mounted.current) {
        forgetRecent();
        setRecentEditing(false);
      }
    });

  /** 播放器报告已开始播放，只有最近观看列表需要重新读取。 */
  const recordStarted = (channel: Channel) => {
    if (!repo) return;
    // 此时重新读取一万行的频道标签页，会与媒体流
    // 应用启动时，因此其它标签只更新各自的最近观看行。
    void repo
      .recordRecent(channel.id)
      .then(async () => {
        if (list.tabRef.current === "recent") list.changed();
        else list.setRecent(await repo.listChannels({ mode: "recent" }));
      })
      .catch(() => setError("观看记录未能保存"));
  };

  return {
    favorite,
    removeRecent,
    clearRecent,
    recordStarted,
    recentBusy,
    recentEditing,
    setRecentEditing,
  };
}

export type ChannelActions = ReturnType<typeof useChannelActions>;
