import React, { memo, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Channel } from "../domain/types";
import { channelTitle, displayGroups } from "../domain/channelLabels";
import { isQualityTag } from "../domain/channelSources";
import { colors, sizes, styles, type } from "../theme";
import { ChannelLogo } from "./ChannelLogo";

/** 行间距，由列表作为分隔条或内容间距加入。 */
export const CHANNEL_ROW_GAP = 4;

/**
 * 所有行高度一致，列表可通过 getItemLayout 直接计算位置，
 * 无须先渲染和测量。否则快速滑动会超过测量进度，出现空白。
 * 内容包括上下各 8dp 留白、一行标题（旁边放标签）、2dp 间隔及一行说明；
 * 文本行随字体缩放增高。
 */
export function channelRowHeight(fontScale: number): number {
  const lines =
    (type.rowTitle.lineHeight + type.caption.lineHeight) * fontScale;
  return Math.max(sizes.row, Math.ceil(16 + 2 + lines));
}

/** 行高为 rowHeight、行间距为 CHANNEL_ROW_GAP 时，第 `index` 行的偏移。 */
export function channelRowLayout(
  rowHeight: number,
  index: number,
  leading = 0,
): { length: number; offset: number; index: number } {
  return {
    length: rowHeight,
    offset: leading + index * (rowHeight + CHANNEL_ROW_GAP),
    index,
  };
}
/**
 * 使用记忆化：超过一万行时，父组件每次更新都会导致列表重新渲染单元格，
 * 因此调用方应传入引用稳定、以频道为参数的处理函数。
 */
export const ChannelRow = memo(function ChannelRow({
  channel,
  onPlay,
  onFavorite,
  current = false,
  onRemoveRecent,
  recentBusy = false,
  artworkEnabled = false,
  hiddenGroup = null,
}: {
  channel: Channel;
  onPlay: (channel: Channel) => void;
  onFavorite: (channel: Channel) => void;
  current?: boolean;
  onRemoveRecent?: (channel: Channel) => void;
  recentBusy?: boolean;
  artworkEnabled?: boolean;
  /** 当前列表已按此分组筛选，说明文字中不再重复它。 */
  hiddenGroup?: string | null;
}) {
  const { title, tags } = useMemo(
    () => channelTitle(channel.name),
    [channel.name],
  );
  const unreachable = channel.active && channel.checkStatus === "unreachable";
  // 读屏仍会播报“不可用”；可视界面使用淡化行和圆点。
  const spokenLabels = [...tags, ...(unreachable ? ["不可用"] : [])];
  const { fontScale } = useWindowDimensions();
  const rowHeight = channelRowHeight(fontScale);
  const editingRecent = !!onRemoveRecent;
  const playbackDisabled = !channel.active || editingRecent;
  const caption = channel.active
    ? displayGroups(channel.groupName, hiddenGroup)
    : "节目单里已没有这个频道";
  return (
    <View style={[rowStyles.row, { height: rowHeight }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          editingRecent
            ? `${title}，观看记录`
            : `${title}${spokenLabels.length ? `，${spokenLabels.join("，")}` : ""}，${channel.active ? "播放" : "节目单里已没有这个频道"}`
        }
        accessibilityState={{ disabled: playbackDisabled, selected: current }}
        onPress={() => onPlay(channel)}
        disabled={playbackDisabled}
        style={({ pressed }) => [
          rowStyles.main,
          unreachable && rowStyles.unreachable,
          pressed && { opacity: 0.65 },
        ]}
      >
        <ChannelLogo
          uri={channel.logoUrl}
          title={title}
          enabled={artworkEnabled}
          size={sizes.logo}
        />
        <View style={rowStyles.text}>
          {/* 单行布局：标记位于标题旁，让所有行保持
              相同高度；参见 channelRowHeight。 */}
          <View style={rowStyles.titleLine}>
            <Text
              numberOfLines={1}
              style={[rowStyles.title, current && rowStyles.currentTitle]}
            >
              {title}
            </Text>
            {tags.map((label) => (
              <Text
                key={label}
                numberOfLines={1}
                // 清晰度属于频道信息，而“地区限制”等标记属于使用提醒。
                style={[rowStyles.tag, isQualityTag(label) && rowStyles.quiet]}
              >
                {label}
              </Text>
            ))}
            {unreachable && <View style={rowStyles.badDot} />}
          </View>
          {/* 不显示来源名称：这一行代表逻辑频道，
              实际播放的来源会在开始播放时选择。 */}
          {!!caption && (
            <Text numberOfLines={1} style={styles.caption}>
              {caption}
            </Text>
          )}
        </View>
      </Pressable>
      {onRemoveRecent && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除${title}的观看记录`}
          accessibilityState={{ disabled: recentBusy }}
          disabled={recentBusy}
          onPress={() => onRemoveRecent(channel)}
          style={({ pressed }) => [
            rowStyles.removeRecent,
            { opacity: recentBusy ? 0.4 : pressed ? 0.65 : 1 },
          ]}
        >
          <Text style={rowStyles.removeRecentText}>删除</Text>
        </Pressable>
      )}
      {!editingRecent && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${channel.favorite ? "取消收藏" : "收藏"}${title}`}
          accessibilityState={{ selected: channel.favorite }}
          onPress={() => onFavorite(channel)}
          style={rowStyles.star}
        >
          <Text
            style={{
              fontSize: 20,
              color: channel.favorite ? colors.warn : colors.mutedFaint,
            }}
          >
            {channel.favorite ? "★" : "☆"}
          </Text>
        </Pressable>
      )}
    </View>
  );
});
const rowStyles = StyleSheet.create({
  // 不自带背景；行直接放在页面和播放器面板上。
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 4,
    overflow: "hidden",
  },
  text: { flex: 1, gap: 2 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { ...type.rowTitle, color: colors.text, flexShrink: 1 },
  currentTitle: { color: colors.accent, fontWeight: "600" },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  tag: {
    ...type.muted,
    color: colors.warn,
    backgroundColor: colors.raised,
    borderRadius: 6,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  quiet: { color: colors.muted },
  unreachable: { opacity: 0.5 },
  badDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bad,
  },
  star: {
    minWidth: sizes.touch,
    minHeight: sizes.touch,
    alignItems: "center",
    justifyContent: "center",
  },
  removeRecent: {
    minWidth: sizes.touch,
    minHeight: sizes.touch,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  removeRecentText: { ...type.body, color: colors.bad },
});
