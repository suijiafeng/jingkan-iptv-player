import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChannelRow } from "../../components/ChannelRow";
import { ChannelFilterBar } from "../channel/ChannelListParts";
import { Button, Notice } from "../../components/ui";
import { colors } from "../../theme";
import type { Channel } from "../../domain/types";
import { sameChannel, type ChannelSheetProps } from "./playerShared";
import { CloseIcon, LocateIcon } from "./playerIcons";

/** 记录列表离开时的位置，重新打开后回到相同行。 */
export interface SavedListPosition {
  range: string | null;
  channelId: string;
  offset: number;
}
/** 由页面持有，因为面板隐藏时会卸载。 */
export interface ListPositionStore {
  get(): SavedListPosition | null;
  set(position: SavedListPosition): void;
}

interface ChannelPanelProps {
  sheet: ChannelSheetProps;
  channel: Channel;
  /** 全屏时显示带关闭按钮的标题；竖屏时将定位按钮放在行内。 */
  fullscreen: boolean;
  onClose?: () => void;
  /** 用户选中的频道，以及当前可见、可播放行组成的播放队列。 */
  onSelect: (channel: Channel, queue: Channel[]) => void;
  onFavorite: (channel: Channel) => void;
  artworkEnabled: boolean;
  error?: string;
  onDismissError?: () => void;
  savedPosition: ListPositionStore;
}

/**
 * 范围标签、频道页筛选栏及频道列表。竖屏时放在画面下方，
 * 全屏时放在侧栏；只有可见时才挂载，因此挂载时会恢复位置
 * 或定位当前频道。
 */
export function ChannelPanel(props: ChannelPanelProps) {
  const { sheet, channel, savedPosition } = props;
  const scope = sheet.filters.tab;
  const shownChannels = sheet.channels;
  const range = sheet.rangeKey;
  const channelList = useRef<FlatList<Channel>>(null);
  const scrollRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTarget = useRef<{ index: number; retries: number } | null>(null);
  const [locateRequest, setLocateRequest] = useState(0);
  // 只保留一行标签；国家和语言沿用页面的选择，并且
  // 在这里保持折叠；已有搜索条件时显示搜索文本，以便
  // 以便清除。
  const searchActive = !!sheet.filters.search;
  const lastLocateRequest = useRef(0);
  const currentIndex = shownChannels.findIndex((row) =>
    sameChannel(row, channel),
  );
  const selectRow = (row: Channel) =>
    props.onSelect(
      row,
      shownChannels.filter((candidate) => candidate.active),
    );
  const filtered =
    !!sheet.filters.search ||
    (scope === "all" &&
      (!!sheet.filters.sourceId ||
        Object.values(sheet.filters.facetSelection).some(
          (value) => value !== null,
        )));

  useEffect(() => {
    const previous = savedPosition.get();
    const forceLocate = lastLocateRequest.current !== locateRequest;
    lastLocateRequest.current = locateRequest;
    if (
      !forceLocate &&
      previous?.range === range &&
      previous.channelId === channel.id
    ) {
      channelList.current?.scrollToOffset({
        offset: previous.offset,
        animated: false,
      });
    } else {
      savedPosition.set({ range, channelId: channel.id, offset: 0 });
      if (currentIndex >= 0) {
        scrollTarget.current = { index: currentIndex, retries: 2 };
        channelList.current?.scrollToIndex({
          index: currentIndex,
          viewPosition: 0.35,
          animated: false,
        });
      } else {
        channelList.current?.scrollToOffset({ offset: 0, animated: false });
      }
    }
    return () => {
      if (scrollRetry.current !== null) clearTimeout(scrollRetry.current);
      scrollTarget.current = null;
    };
  }, [savedPosition, range, channel.id, currentIndex, locateRequest]);

  const locateButton = (
    <Pressable
      style={s.headingAction}
      accessibilityRole="button"
      accessibilityLabel="定位当前频道"
      accessibilityState={{ disabled: !channel.active }}
      disabled={!channel.active}
      onPress={() => {
        Keyboard.dismiss();
        if (currentIndex < 0) sheet.onLocate();
        setLocateRequest((value) => value + 1);
      }}
    >
      <LocateIcon color={colors.accent} />
    </Pressable>
  );

  return (
    <>
      {props.fullscreen && (
        <View style={s.heading}>
          <Text accessibilityRole="header" style={s.headingTitle}>
            频道列表
          </Text>
          <View style={s.flex} />
          {locateButton}
          <Pressable
            style={s.headingAction}
            accessibilityRole="button"
            accessibilityLabel="关闭频道列表"
            onPress={props.onClose}
          >
            <CloseIcon />
          </Pressable>
        </View>
      )}
      {/* 两种布局均只显示一行内容标签。搜索、国家和语言入口只在对应条件已生效时出现，使列表变短的原因始终可见且可清除。 */}
      <ChannelFilterBar
        key={scope}
        {...sheet.filters}
        idPrefix="player"
        compact
        foldSearch={!searchActive}
        foldTriggers
      />
      {!!props.error && (
        <View>
          <Notice title={props.error} error />
          <Button
            secondary
            label="关闭选台提示"
            onPress={() => props.onDismissError?.()}
          />
        </View>
      )}
      <FlatList
        ref={channelList}
        testID="player-channel-list"
        data={shownChannels}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(event) => {
          savedPosition.set({
            range,
            channelId: channel.id,
            offset: event.nativeEvent.contentOffset.y,
          });
        }}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => {
          if (scrollRetry.current !== null) clearTimeout(scrollRetry.current);
          scrollTarget.current = null;
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          const target = scrollTarget.current;
          if (!target || target.index !== index) return;
          channelList.current?.scrollToOffset({
            offset: Math.max(0, averageItemLength * index),
            animated: false,
          });
          if (target.retries <= 0) return;
          target.retries -= 1;
          if (scrollRetry.current !== null) clearTimeout(scrollRetry.current);
          scrollRetry.current = setTimeout(() => {
            scrollRetry.current = null;
            if (scrollTarget.current === target) {
              channelList.current?.scrollToIndex({
                index,
                viewPosition: 0.35,
                animated: false,
              });
            }
          }, 100);
        }}
        keyExtractor={(item) => item.id}
        style={s.list}
        contentContainerStyle={s.listContent}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        updateCellsBatchingPeriod={16}
        windowSize={21}
        removeClippedSubviews={false}
        ListEmptyComponent={
          sheet.loading ? (
            <ActivityIndicator style={s.emptyLoading} color={colors.accent} />
          ) : (
            <Text style={s.empty}>
              {filtered
                ? `没有匹配频道，试试清除搜索${scope === "all" ? "或调整筛选" : ""}`
                : scope === "recent"
                  ? "还没有最近观看记录"
                  : scope === "favorites"
                    ? "还没有收藏的可用频道"
                    : "没有可用频道"}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <ChannelRow
            channel={item}
            current={sameChannel(item, channel)}
            onPlay={selectRow}
            onFavorite={props.onFavorite}
            artworkEnabled={props.artworkEnabled}
          />
        )}
      />
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 4,
  },
  headingTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  headingAction: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flex: 1 },
  listContent: { gap: 4 },
  empty: { color: colors.muted, paddingVertical: 24, textAlign: "center" },
  emptyLoading: { paddingVertical: 24 },
});
