import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { Repository } from "../../data/repository";
import type { Channel, Source } from "../../domain/types";
import {
  buildFacetOptions,
  contentOptions,
  EMPTY_FACET_OPTIONS,
  type ChannelFacetOptions,
} from "../../domain/channelFacets";
import {
  effectiveCountry,
  useRegionPreference,
} from "../region/useRegionPreference";
import { createScrollRestore } from "../channel/scrollRestore";
import type { Tab } from "../channel/ChannelListParts";
import type { ChannelListItem } from "./channelListItems";

// 先显示一屏；一万行列表的其余内容随后在第二次
// 读取，让切换标签或筛选不必等待整张表。
const FIRST_PAGE = 40;

type RegionPreference = ReturnType<typeof useRegionPreference>;

/**
 * 标签或筛选条件变化时，从 SQLite 读取频道页，并在标签切换之间
 * 保留每个标签的滚动位置。
 */
export function useChannelListData({
  repo,
  tab,
  sourceId,
  group,
  language,
  query,
  region,
  countryKey,
  countryBypassed,
}: {
  repo: Repository | null;
  tab: Tab;
  sourceId: string;
  group: string | null;
  language: string | null;
  query: string;
  region: RegionPreference;
  countryKey: string;
  countryBypassed: boolean;
}) {
  const [loadedRequest, setLoadedRequest] = useState<{
      tab: Tab;
      sourceId: string;
      group: string | null;
      language: string | null;
      countryKey: string;
      countryBypassed: boolean;
      query: string;
    } | null>(null),
    [listError, setListError] = useState(""),
    [sources, setSources] = useState<Source[]>([]),
    [channels, setChannels] = useState<Channel[]>([]),
    // 分页列表的剩余部分仍在加载时，匹配已经显示的行。
    [channelTotal, setChannelTotal] = useState<number | null>(null),
    [recent, setRecent] = useState<Channel[]>([]),
    [facets, setFacets] = useState<ChannelFacetOptions>(EMPTY_FACET_OPTIONS),
    [revision, setRevision] = useState(0);
  // 通过列表的原生滚动事件驱动顶部覆盖层。
  const [scrollY] = useState(() => new Animated.Value(0));
  const loadGeneration = useRef(0);
  const restoreFrame = useRef<number | null>(null);
  const listRef = useRef<FlatList<ChannelListItem>>(null),
    tabOffsets = useRef<Partial<Record<Tab, number>>>({}),
    restoreTab = useRef<Tab | null>(null),
    // 加载完毕后解析为完整的当前列表，也就是播放队列。
    fullList = useRef<Promise<Channel[]>>(Promise.resolve([])),
    listSettled = useRef(true),
    [scrollRestore] = useState(createScrollRestore);
  // 异步处理函数读取此值，以完成时实际显示的标签为准。
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  const changed = useCallback(() => setRevision((current) => current + 1), []);

  // 每一帧都重新发送，直到列表报告目标偏移；参见 scrollRestore。
  const restoreOffset = useCallback(
    (target: number) => {
      if (restoreFrame.current !== null)
        cancelAnimationFrame(restoreFrame.current);
      const send = (offset: number | null) => {
        restoreFrame.current = null;
        if (offset === null) return;
        listRef.current?.scrollToOffset({ offset, animated: false });
        if (scrollRestore.pending())
          restoreFrame.current = requestAnimationFrame(() =>
            send(scrollRestore.retry()),
          );
      };
      send(scrollRestore.request(target));
    },
    [scrollRestore],
  );
  const loadRequest = useMemo(
    () => ({
      repo,
      tab,
      sourceId,
      group,
      language,
      countryKey,
      countryBypassed,
      query,
      revision,
    }),
    [
      repo,
      tab,
      sourceId,
      group,
      language,
      countryKey,
      countryBypassed,
      query,
      revision,
    ],
  );
  const listLoading = loadedRequest !== loadRequest;

  // 由原生驱动移动标题覆盖层，不依赖 JS 滚动监听。
  const onListScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        // 这里只由滚动恢复逻辑观察偏移；保存位置要等用户开始拖动。
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
          scrollRestore.scrolled(event.nativeEvent.contentOffset.y),
      }),
    [scrollY, scrollRestore],
  );
  const hasCurrentList =
    loadedRequest?.tab === tab &&
    loadedRequest.sourceId === sourceId &&
    loadedRequest.group === group &&
    loadedRequest.language === language &&
    loadedRequest.countryKey === countryKey &&
    loadedRequest.countryBypassed === countryBypassed &&
    loadedRequest.query === query;

  useEffect(() => {
    if (!repo || !region.ready) return;
    let active = true;
    let layoutFrame: number | null = null;
    const loadId = ++loadGeneration.current;
    const current = () => active && loadId === loadGeneration.current;
    scrollRestore.cancel();
    const restoring = restoreTab.current === tab;
    // 恢复滚动位置需要所有行完成布局，因此一次读完。
    const paged = !(restoring && (tabOffsets.current[tab] ?? 0) > 0);
    listSettled.current = false;
    let settle!: (rows: Channel[]) => void;
    const settled = new Promise<Channel[]>((resolve) => (settle = resolve));
    fullList.current = settled;
    const load = async () => {
      const facetRows =
        tab === "all" ? await repo.listFacetRows(sourceId || undefined) : [];
      if (!current()) return;
      const baseFacets =
        tab === "all" ? buildFacetOptions(facetRows) : EMPTY_FACET_OPTIONS;
      const selectedCountry = countryBypassed
        ? null
        : effectiveCountry(
            region.preference,
            region.result,
            baseFacets.countries,
          );
      const nextFacets =
        tab === "all"
          ? {
              ...baseFacets,
              contents: contentOptions(facetRows, {
                country: selectedCountry,
                language,
                content: group,
              }),
            }
          : EMPTY_FACET_OPTIONS;
      const filter = {
        mode: tab === "settings" ? ("all" as const) : tab,
        sourceId: tab === "all" ? sourceId || undefined : undefined,
        groupName: tab === "all" ? (group ?? undefined) : undefined,
        country: tab === "all" ? (selectedCountry ?? undefined) : undefined,
        language: tab === "all" ? (language ?? undefined) : undefined,
        search: query,
      };
      const [nextSources, firstRows, recentRows] = await Promise.all([
        repo.listSources(),
        repo.listChannels(paged ? { ...filter, limit: FIRST_PAGE } : filter),
        repo.listChannels({ mode: "recent" }),
      ]);
      if (!current()) return;
      const partial = paged && firstRows.length === FIRST_PAGE;
      const total = partial ? await repo.countChannels(filter) : null;
      if (!current()) return;
      setListError("");
      setSources(nextSources);
      setChannels(firstRows);
      setChannelTotal(total);
      setFacets(nextFacets);
      setRecent(recentRows);
      setLoadedRequest(loadRequest);
      if (restoring) {
        restoreTab.current = null;
        const offset = tabOffsets.current[tab] ?? 0;
        layoutFrame = requestAnimationFrame(() => {
          layoutFrame = null;
          if (current()) restoreOffset(offset);
        });
      }
      if (!partial) return firstRows;
      const remainingRows = await repo.listChannels({
        ...filter,
        offset: FIRST_PAGE,
      });
      if (!current()) return firstRows;
      const allRows = [...firstRows, ...remainingRows];
      setChannels((shown) =>
        // 保留期间发生的本地修补（收藏、移除最近观看）。
        shown.length === firstRows.length
          ? [...shown, ...remainingRows]
          : allRows,
      );
      setChannelTotal(null);
      return allRows;
    };
    void load()
      .catch(() => {
        if (!current()) return;
        setListError("读取资料失败，你的频道与收藏仍保存在本机。");
        setLoadedRequest(loadRequest);
      })
      .then((rows) => {
        if (current()) listSettled.current = true;
        settle(rows ?? []);
      });
    return () => {
      active = false;
      scrollRestore.cancel();
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      if (restoreFrame.current !== null)
        cancelAnimationFrame(restoreFrame.current);
      restoreFrame.current = null;
    };
  }, [
    repo,
    tab,
    sourceId,
    group,
    language,
    countryBypassed,
    query,
    revision,
    loadRequest,
    region.ready,
    region.preference,
    region.result,
    scrollRestore,
    restoreOffset,
  ]);

  /** 下次读取 `target` 时从顶部开始，而非已保存的偏移。 */
  const scrollToTopOnNextLoad = (target: Tab) => {
    tabOffsets.current[target] = 0;
    restoreTab.current = target;
  };

  /** 下一次读取 target 时恢复其已保存的滚动偏移。 */
  const restoreOnNextLoad = (target: Tab) => {
    restoreTab.current = target;
  };

  /** “清空全部”后，每个标签都从顶部开始。 */
  const forgetTabOffsets = () => {
    tabOffsets.current = {};
  };

  /** 在拖动或惯性滚动停止后，记录该标签页的位置。 */
  const saveTabOffset = (offsetY: number) => {
    if (!listLoading && scrollRestore.scrolled(offsetY))
      tabOffsets.current[tab] = offsetY;
  };

  return {
    changed,
    tabRef,
    listError,
    listLoading,
    hasCurrentList,
    sources,
    setSources,
    channels,
    setChannels,
    channelTotal,
    recent,
    setRecent,
    facets,
    scrollY,
    listRef,
    fullList,
    listSettled,
    scrollRestore,
    onListScroll,
    scrollToTopOnNextLoad,
    restoreOnNextLoad,
    forgetTabOffsets,
    saveTabOffset,
  };
}

export type ChannelListData = ReturnType<typeof useChannelListData>;
