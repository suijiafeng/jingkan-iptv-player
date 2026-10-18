import type { Channel } from "../../domain/types";

// 用哨兵行表示空状态，使它出现在标题覆盖层下方。
export const EMPTY_ROW = { kind: "empty" } as const;
export type ChannelListItem = Channel | typeof EMPTY_ROW;

export const channelListKey = (item: ChannelListItem) =>
  item === EMPTY_ROW ? "__empty__" : (item as Channel).id;
