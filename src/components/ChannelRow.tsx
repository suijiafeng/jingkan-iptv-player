import { useLanguage } from "../i18n/react";
import { t } from "../i18n/core";
import React, { memo, useRef } from "react";
import {
  View,
  Alert,
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
  useLanguage();
  const pressCanceled = useRef(false);
  const pressOrigin = useRef({ x: 0, y: 0 });
  const beginPress = (event: {
    nativeEvent: { pageX: number; pageY: number };
  }) => {
    pressCanceled.current = false;
    pressOrigin.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  };
  const movePress = (event: {
    nativeEvent: { pageX: number; pageY: number };
  }) => {
    if (
      Math.hypot(
        event.nativeEvent.pageX - pressOrigin.current.x,
        event.nativeEvent.pageY - pressOrigin.current.y,
      ) > 10
    )
      pressCanceled.current = true;
  };
  const { title, tags } = channelTitle(channel.name);
  const unreachable = channel.active && channel.checkStatus === "unreachable";
  const spokenLabels = [...tags, ...(unreachable ? [t("暂时无法连接")] : [])];
  const { fontScale } = useWindowDimensions();
  const rowHeight = channelRowHeight(fontScale);
  const playbackDisabled = !channel.active;
  const caption = channel.active
    ? displayGroups(channel.groupName, hiddenGroup)
    : t("节目单里已没有这个频道");
  const showRecentActions = () => {
    if (!onRemoveRecent || recentBusy) return;
    Alert.alert(
      title,
      undefined,
      [
        { text: t("取消"), style: "cancel" },
        {
          text: t("删除"),
          style: "destructive",
          onPress: () => onRemoveRecent(channel),
        },
      ],
      { cancelable: true },
    );
  };
  return (
    <View
      style={[
        rowStyles.row,
        current && rowStyles.currentRow,
        { height: rowHeight },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}${current ? t("，当前频道") : ""}${spokenLabels.length ? `${t("，")}${spokenLabels.join(t("、"))}` : ""}${t("，")}${channel.active ? t("播放") : t("节目单里已没有这个频道")}`}
        accessibilityActions={
          onRemoveRecent && !recentBusy
            ? [
                {
                  name: "delete",
                  label: t("删除{value0}的观看记录", { value0: title }),
                },
              ]
            : undefined
        }
        onAccessibilityAction={({ nativeEvent }) => {
          if (
            nativeEvent.actionName === "delete" &&
            onRemoveRecent &&
            !recentBusy
          )
            showRecentActions();
        }}
        accessibilityState={{ disabled: playbackDisabled, selected: current }}
        onPressIn={beginPress}
        onTouchMove={movePress}
        onPointerMove={movePress}
        onLongPress={
          onRemoveRecent && !recentBusy
            ? () => {
                if (pressCanceled.current) return;
                pressCanceled.current = true;
                showRecentActions();
              }
            : undefined
        }
        delayLongPress={500}
        onPress={() => {
          if (!pressCanceled.current) onPlay(channel);
        }}
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
            {spokenLabels.map((label) => (
              <Text
                key={label}
                numberOfLines={1}
                // 清晰度属于频道信息，而“地区限制”等标记属于使用提醒。
                style={[rowStyles.tag, isQualityTag(label) && rowStyles.quiet]}
              >
                {label}
              </Text>
            ))}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          channel.favorite ? "取消收藏{value0}" : "收藏{value0}",
          { value0: title },
        )}
        accessibilityState={{ selected: channel.favorite }}
        onPressIn={beginPress}
        onTouchMove={movePress}
        onPointerMove={movePress}
        onPress={() => {
          if (!pressCanceled.current) onFavorite(channel);
        }}
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
  currentRow: {
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 9,
  },
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
  star: {
    minWidth: sizes.touch,
    minHeight: sizes.touch,
    alignItems: "center",
    justifyContent: "center",
  },
});
