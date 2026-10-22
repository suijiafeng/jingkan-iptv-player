import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  StyleSheet,
  View,
} from "react-native";
import { Button, Heading, Notice } from "../../components/ui";
import { ActiveFacetChips, FacetToggle, activeMenuFacets } from "./FacetChips";
import { FacetFilters } from "../../components/FacetFilters";
import type {
  ChannelFacetOptions,
  ChannelFacetSelection,
  FacetKind,
} from "../../domain/channelFacets";
import type { Source } from "../../domain/types";
import { colors, sizes, styles, type } from "../../theme";

export type Tab = "all" | "favorites" | "recent" | "settings";
export type ListTab = Exclude<Tab, "settings">;

export interface HeaderProps {
  tab: ListTab;
  /** 分类切换后执行的后台可用性检测。 */
  autoCheck?: { done: number; total: number } | null;
  sources: Source[];
  search: string;
  sourceId: string;
  facets: ChannelFacetOptions;
  facetSelection: ChannelFacetSelection;
  onSearchChange: (text: string) => void;
  onClearSearch: () => void;
  onSourceChange: (sourceId: string) => void;
  onFacetChange: (selection: ChannelFacetSelection, kind?: FacetKind) => void;
  countryHint?: string;
  onClearRecent: () => void;
  recentBusy: boolean;
  recentEditing: boolean;
  onToggleRecentEditing: () => void;
  recentCount: number;
  /** 可从频道页直接进入，无需绕到设置页。 */
  onManageSources?: () => void;
}

/** 标题行包括标题、副标题和最近观看操作，随列表滚走；下面的筛选栏固定在顶部。 */
export function ChannelListTitle(props: HeaderProps) {
  const { tab } = props;
  const clearRecentDisabled = props.recentBusy || props.recentCount === 0;
  const toggleRecentDisabled =
    props.recentBusy || (!props.recentEditing && props.recentCount === 0);
  return (
    <View style={partStyles.topRow}>
      <View style={{ flex: 1 }}>
        <Heading
          title={
            tab === "all" ? "频道" : tab === "favorites" ? "收藏" : "最近"
          }
        />
      </View>
      {tab === "all" && props.onManageSources && (
        <View style={partStyles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="管理节目来源"
            onPress={props.onManageSources}
            style={({ pressed }) => [
              partStyles.headerAction,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={partStyles.actionText}>节目来源</Text>
          </Pressable>
        </View>
      )}
      {tab === "recent" && (
        <View style={partStyles.headerActions}>
          {props.recentEditing && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清空最近观看"
              accessibilityState={{ disabled: clearRecentDisabled }}
              disabled={clearRecentDisabled}
              onPress={props.onClearRecent}
              style={({ pressed }) => [
                partStyles.headerAction,
                {
                  opacity: clearRecentDisabled ? 0.4 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={partStyles.dangerText}>清空</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              props.recentEditing ? "完成历史管理" : "管理观看记录"
            }
            accessibilityState={{ disabled: toggleRecentDisabled }}
            disabled={toggleRecentDisabled}
            onPress={props.onToggleRecentEditing}
            style={({ pressed }) => [
              partStyles.headerAction,
              {
                opacity: toggleRecentDisabled ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={partStyles.actionText}>
              {props.recentEditing ? "完成" : "管理"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** 当前状态下，固定筛选栏是否有内容可显示。 */
export function hasFilterBar(
  props: Pick<HeaderProps, "tab" | "recentEditing">,
) {
  return !(props.tab === "recent" && props.recentEditing);
}

/** 搜索、来源选择、内容维度和范围标签始终固定在顶部，长列表滚动后也无需返回顶部才能筛选。 */
export function ChannelFilterBar(
  props: HeaderProps & {
    /** testID 前缀，用于区分频道页和播放器选台面板。 */
    idPrefix?: string;
    /** 播放器面板内部不再自带背景或垂直留白。 */
    compact?: boolean;
    /** 播放器中折叠搜索框，仅在已有搜索条件时显示。 */
    foldSearch?: boolean;
    /** 播放器：收起国家和语言触发器，选中任一条件时显示。 */
    foldTriggers?: boolean;
  },
) {
  const { tab, idPrefix = "channel" } = props;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // 国家/地区和语言菜单默认折叠到一个图标后，用户需要时再展开。
  const [facetsOpen, setFacetsOpen] = useState(false);
  const facetMenus = tab === "all" && !props.foldTriggers;
  // 展开的筛选行算一级页面，返回键应先将其收起。
  const rowOpen = sourcesOpen || facetsOpen;
  useEffect(() => {
    if (!rowOpen) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setSourcesOpen(false);
        setFacetsOpen(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [rowOpen]);
  const selectedSource = props.sources.find(
    (source) => source.id === props.sourceId,
  );
  if (!hasFilterBar(props)) return null;
  return (
    <View
      style={[partStyles.filterBar, props.compact && partStyles.compactBar]}
    >
      <View
        style={[partStyles.searchLine, props.foldSearch && partStyles.hidden]}
      >
        <View style={[partStyles.searchRow, { flex: 1 }]}>
          <TextInput
            accessibilityLabel="搜索频道名称"
            style={partStyles.searchInput}
            placeholder="搜索"
            placeholderTextColor={colors.muted}
            value={props.search}
            onChangeText={props.onSearchChange}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            autoCorrect={false}
          />
          {!!props.search && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清除搜索"
              onPress={props.onClearSearch}
              style={partStyles.clearSearch}
            >
              <Text style={partStyles.clearText}>清除搜索</Text>
            </Pressable>
          )}
        </View>
        {/* 已过期的范围（来源已经停用）仍保留其关闭按钮。 */}
        {tab === "all" && (props.sources.length > 1 || !!props.sourceId) && (
          <View style={partStyles.sourceGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sourcesOpen ? "收起来源筛选" : "展开来源筛选"}
              accessibilityState={{ expanded: sourcesOpen }}
              onPress={() => setSourcesOpen((value) => !value)}
              style={({ pressed }) => [
                partStyles.sourceToggle,
                !!props.sourceId && partStyles.sourceToggleOn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text numberOfLines={1} style={partStyles.sourceText}>
                {props.sourceId
                  ? selectedSource?.name || "来源"
                  : `来源 ${sourcesOpen ? "▴" : "▾"}`}
              </Text>
            </Pressable>
            {/* 标签本身已显示范围，旁边的 × 用于清除它。 */}
            {!!props.sourceId && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="清除来源筛选"
                onPress={() => props.onSourceChange("")}
                style={({ pressed }) => [
                  partStyles.sourceClear,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={partStyles.sourceText}>×</Text>
              </Pressable>
            )}
          </View>
        )}
        {facetMenus && (
          <FacetToggle
            open={facetsOpen}
            active={activeMenuFacets(props.facetSelection).length > 0}
            onPress={() => setFacetsOpen((open) => !open)}
          />
        )}
      </View>
      {tab === "all" && sourcesOpen && props.sources.length > 1 && (
        <View style={{ gap: 6 }}>
          <Text style={styles.muted}>选择节目来源</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            <Button
              label="所有来源"
              secondary={!!props.sourceId}
              selected={!props.sourceId}
              onPress={() => {
                props.onSourceChange("");
                setSourcesOpen(false);
              }}
            />
            {props.sources.map((source) => (
              <Button
                key={source.id}
                label={source.name}
                secondary={props.sourceId !== source.id}
                selected={props.sourceId === source.id}
                onPress={() => {
                  props.onSourceChange(source.id);
                  setSourcesOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}
      {facetMenus && !facetsOpen && (
        <ActiveFacetChips
          selection={props.facetSelection}
          onChange={props.onFacetChange}
        />
      )}
      {tab === "all" && (
        <FacetFilters
          options={props.facets}
          selected={props.facetSelection}
          onChange={props.onFacetChange}
          countryHint={props.countryHint}
          contentAsTabs
          tabsOnly={!facetMenus || !facetsOpen}
          testID={`${idPrefix}-facet-filters`}
        />
      )}
      {tab === "all" && props.autoCheck && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="正在检测"
          accessibilityValue={{
            min: 0,
            max: props.autoCheck.total,
            now: props.autoCheck.done,
          }}
          style={partStyles.checkTrack}
        >
          <View
            style={[
              partStyles.checkFill,
              {
                width: `${Math.round(
                  (props.autoCheck.done / Math.max(props.autoCheck.total, 1)) *
                    100,
                )}%`,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

/** 把标题和筛选放在一起，供非固定布局和测试使用。 */
export function ChannelListHeader(props: HeaderProps) {
  return (
    <View style={partStyles.header}>
      <ChannelListTitle {...props} />
      <ChannelFilterBar {...props} />
    </View>
  );
}

interface EmptyProps {
  tab: ListTab;
  loading: boolean;
  error: string;
  hasSources: boolean;
  filtered: boolean;
  onRetry: () => void;
  onAddUrl: () => void;
  onAddFile: () => void;
  onShowAll: () => void;
  onResetFilters: () => void;
  onManageSources: () => void;
}

export function ChannelListEmpty(props: EmptyProps) {
  if (props.loading)
    return (
      <View style={partStyles.loadingState}>
        <ChannelListSkeleton />
        <Text style={styles.muted} accessibilityLiveRegion="polite">
          正在读取频道…
        </Text>
      </View>
    );
  if (props.error)
    return (
      <View style={{ gap: 12 }}>
        <Notice title={props.error} error />
        <Button label="重新读取频道" onPress={props.onRetry} />
      </View>
    );
  return (
    <View style={{ gap: 12 }}>
      <Notice
        title={
          !props.hasSources
            ? "从一份节目单开始"
            : props.filtered
              ? "没有找到频道"
              : props.tab === "favorites"
                ? "还没有收藏"
                : props.tab === "recent"
                  ? "还没有观看记录"
                  : "没有可用频道"
        }
        // 下方按钮已经说明操作，只有星标需要补充文字。
        body={
          props.hasSources && !props.filtered && props.tab === "favorites"
            ? "点频道旁的星标收藏"
            : undefined
        }
      />
      {!props.hasSources ? (
        <>
          <Button label="添加节目单" onPress={props.onAddUrl} />
          <Button label="从文件导入" secondary onPress={props.onAddFile} />
        </>
      ) : props.filtered ? (
        <Button
          label={props.tab === "all" ? "清除搜索与筛选" : "清除搜索条件"}
          onPress={props.onResetFilters}
        />
      ) : props.tab === "all" ? (
        <Button label="管理节目来源" onPress={props.onManageSources} />
      ) : (
        <Button label="查看全部频道" onPress={props.onShowAll} />
      )}
    </View>
  );
}

function ChannelListSkeleton() {
  return (
    <View
      accessibilityLabel="正在加载频道列表"
      accessibilityRole="progressbar"
      style={partStyles.skeletonList}
    >
      {Array.from({ length: 6 }, (_unused, rowIndex) => (
        <View key={rowIndex} style={partStyles.skeletonRow}>
          <View style={partStyles.skeletonLogo} />
          <View style={partStyles.skeletonCopy}>
            <View style={[partStyles.skeletonLine, partStyles.skeletonTitle]} />
            <View style={[partStyles.skeletonLine, partStyles.skeletonMeta]} />
          </View>
          <View style={partStyles.skeletonAction} />
        </View>
      ))}
    </View>
  );
}

const partStyles = StyleSheet.create({
  header: { gap: 10, marginBottom: 12 },
  loadingState: { gap: 12 },
  skeletonList: { gap: 10 },
  skeletonRow: {
    minHeight: 68,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.raised,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  skeletonLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.line,
  },
  skeletonCopy: { flex: 1, gap: 8 },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: colors.line },
  skeletonTitle: { width: "62%" },
  skeletonMeta: { width: "38%", opacity: 0.7 },
  skeletonAction: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.line,
  },
  // 使用不透明背景，防止下方滚动的行透过固定栏显示。
  filterBar: { gap: 10, paddingVertical: 8, backgroundColor: colors.bg },
  compactBar: { gap: 8, paddingVertical: 0, backgroundColor: "transparent" },
  hidden: { display: "none" },
  searchLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sourceToggle: {
    minWidth: sizes.field,
    minHeight: sizes.field,
    maxWidth: 144,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  sourceToggleOn: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: colors.accentSoft,
  },
  sourceGroup: { flexDirection: "row" },
  sourceClear: {
    minWidth: sizes.field,
    minHeight: sizes.field,
    alignItems: "center",
    justifyContent: "center",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: colors.accentSoft,
  },
  sourceText: { ...type.body, color: colors.accent },
  // 48pt 触控区域伸出 32pt 标题行，而不撑大标题行，因此
  // 切换标签时，最近与频道、收藏、设置的标题保持在同一位置。
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    // 标题区：标题行加 4pt 下边距。
    marginVertical: -(sizes.touch - (type.title.lineHeight + 4)) / 2,
  },
  headerAction: {
    minHeight: sizes.touch,
    minWidth: sizes.touch,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { ...type.body, color: colors.accent },
  dangerText: { ...type.body, color: colors.bad },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.raised,
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.field,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.text,
    fontSize: type.body.fontSize,
  },
  clearSearch: {
    minWidth: sizes.field,
    minHeight: sizes.field,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { ...type.muted, color: colors.accent },
  checkTrack: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: colors.raised,
  },
  checkFill: { height: 2, backgroundColor: colors.accent },
});
