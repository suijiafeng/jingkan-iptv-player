import React, { useState, type RefObject } from "react";
import {
  Animated,
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { Channel } from "../../domain/types";
import { filteredGroup } from "../../domain/channelLabels";
import {
  CHANNEL_ROW_GAP,
  ChannelRow,
  channelRowHeight,
  channelRowLayout,
} from "../../components/ChannelRow";
import { colors, styles as theme } from "../../theme";
import {
  ChannelFilterBar,
  ChannelListEmpty,
  ChannelListTitle,
  type HeaderProps,
} from "../channel/ChannelListParts";
import {
  channelListKey,
  EMPTY_ROW,
  type ChannelListItem,
} from "./channelListItems";
import { MINI_WINDOW_SPACE } from "./useFloatingWindow";

/** 顶部覆盖层与第一条列表行之间的间距。 */
const LIST_TOP_GAP = 12;

const ListSeparator = () => <View style={{ height: CHANNEL_ROW_GAP }} />;

export interface ChannelListEmptyActions {
  hasSources: boolean;
  filtered: boolean;
  onRetry: () => void;
  onAddUrl: () => void;
  onAddFile: () => void;
  onShowAll: () => void;
  onManageSources: () => void;
}

/**
 * 频道页：虚拟列表上方固定标题与筛选栏。标题和筛选栏放在列表上方的覆盖层中，
 * 确保点击命中它们，而不是已滚到下方的行（Android 上把筛选栏放进列表
 * 并使用 stickyHeaderIndices 时曾出现此问题）。随着列表滚动，覆盖层
 * 向上移动一个标题的高度。
 */
export function ChannelListPage({
  listRef,
  scrollY,
  onListScroll,
  onScrollBeginDrag,
  onScrollSettled,
  listLoading,
  listError,
  headerProps,
  rows,
  emptyActions,
  artworkEnabled,
  onPlay,
  onFavorite,
  onRemoveRecent,
  recentBusy,
  reserveMiniBar,
}: {
  listRef: RefObject<FlatList<ChannelListItem> | null>;
  /** 由原生驱动、用于收起标题的滚动偏移。 */
  scrollY: Animated.Value;
  onListScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  /** 拖动或惯性滚动停止时的偏移量。 */
  onScrollSettled: (offsetY: number) => void;
  listLoading: boolean;
  listError: string;
  headerProps: HeaderProps;
  rows: Channel[];
  emptyActions: ChannelListEmptyActions;
  artworkEnabled: boolean;
  onPlay: (channel: Channel) => void;
  onFavorite: (channel: Channel) => void;
  onRemoveRecent?: (channel: Channel) => void;
  recentBusy: boolean;
  /** 底部留白，防止最后几行被停靠播放器遮挡。 */
  reserveMiniBar: boolean;
}) {
  // 频道行会随字体缩放而增高；参见 channelRowHeight。
  const { fontScale } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0),
    [titleSpace, setTitleSpace] = useState(0);
  const listData: ChannelListItem[] = rows.length ? rows : [EMPTY_ROW];
  const listTop = headerHeight + LIST_TOP_GAP;
  const hiddenGroup = filteredGroup(
    headerProps.tab,
    headerProps.facetSelection.content,
  );
  const headerCollapse = scrollY.interpolate({
    inputRange: [0, Math.max(1, titleSpace)],
    outputRange: [0, -titleSpace],
    extrapolate: "clamp",
  });
  return (
    // 裁剪边界：收起的标题不能滑到状态栏上方。
    <View style={pageStyles.clip}>
      <Animated.FlatList<ChannelListItem>
        testID="channel-list"
        ref={listRef}
        data={listData}
        extraData={headerProps}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onListScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        // 每个标签的滚动位置在拖动或惯性滚动结束时记录。
        onScrollEndDrag={(event) =>
          onScrollSettled(event.nativeEvent.contentOffset.y)
        }
        onMomentumScrollEnd={(event) =>
          onScrollSettled(event.nativeEvent.contentOffset.y)
        }
        scrollEventThrottle={16}
        keyExtractor={channelListKey}
        // 各行高度一致，列表无需测量就能计算位置；
        // 一个单元还包含下方的分隔区域，提前渲染足够远的内容
        // 也能跟上 Android 上快速的惯性滚动。
        getItemLayout={(_items, index) => {
          const layout = channelRowLayout(
            channelRowHeight(fontScale),
            index,
            listTop,
          );
          return { ...layout, length: layout.length + CHANNEL_ROW_GAP };
        }}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        updateCellsBatchingPeriod={16}
        windowSize={21}
        removeClippedSubviews={false}
        contentContainerStyle={[
          theme.content,
          // 行间距仅由分隔组件提供，与 getItemLayout 的计算假设保持一致；
          // 页面的内容间距会额外增加每行 12dp，而布局计算没有计入它。
          { paddingTop: listTop, gap: 0 },
          reserveMiniBar && { paddingBottom: MINI_WINDOW_SPACE },
        ]}
        ItemSeparatorComponent={ListSeparator}
        renderItem={({ item }) =>
          item === EMPTY_ROW ? (
            <ChannelListEmpty
              tab={headerProps.tab}
              loading={listLoading}
              error={listError}
              {...emptyActions}
            />
          ) : (
            <ChannelRow
              channel={item as Channel}
              artworkEnabled={artworkEnabled}
              onPlay={onPlay}
              onFavorite={onFavorite}
              onRemoveRecent={onRemoveRecent}
              recentBusy={recentBusy}
              hiddenGroup={hiddenGroup}
            />
          )
        }
      />
      <Animated.View
        testID="channel-header-overlay"
        style={[
          pageStyles.headerOverlay,
          { transform: [{ translateY: headerCollapse }] },
        ]}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <View
          onLayout={(event) =>
            // 标题及筛选栏上方的间距会一起收起。
            setTitleSpace(event.nativeEvent.layout.height + 20)
          }
        >
          <ChannelListTitle {...headerProps} />
        </View>
        <ChannelFilterBar key={headerProps.tab} {...headerProps} />
      </Animated.View>
    </View>
  );
}

const pageStyles = StyleSheet.create({
  clip: { flex: 1, overflow: "hidden" },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: colors.bg,
  },
});
