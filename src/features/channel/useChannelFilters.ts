import { useCallback, useEffect, useRef, useState } from "react";
import type { ChannelFacetSelection } from "../../domain/channelFacets";
import type { ListTab } from "./ChannelListParts";

/** 用户离开时，各列表标签需要记住的状态。 */
export interface ListFilters {
  sourceId: string;
  group: string | null;
  language: string | null;
  search: string;
}

const CLEARED: ListFilters = {
  sourceId: "",
  group: null,
  language: null,
  search: "",
};

/**
 * 频道页和播放器选台面板共用的唯一筛选状态。国家保存在地区偏好中；
 * 此处只记住定位当前频道时临时“显示所有国家”的绕过状态，
 * 并将其与当时使用的地区偏好绑定。
 */
export function useChannelFilters() {
  const [filters, setFilters] = useState<ListFilters>(CLEARED);
  // 实际发起查询的搜索词；输入先等待 250 ms 稳定下来。
  const [query, setQuery] = useState("");
  const [countryBypass, setCountryBypass] = useState<string | null>(null);
  const saved = useRef<Partial<Record<ListTab, ListFilters>>>({});
  useEffect(() => {
    const id = setTimeout(() => setQuery(filters.search.trim()), 250);
    return () => clearTimeout(id);
  }, [filters.search]);

  const setSearch = useCallback((search: string) => {
    setFilters((f) => ({ ...f, search }));
  }, []);
  const clearSearch = useCallback(() => {
    setFilters((f) => ({ ...f, search: "" }));
    setQuery("");
  }, []);
  const setSource = useCallback((sourceId: string) => {
    setFilters((f) => ({ ...f, sourceId, group: null, language: null }));
  }, []);
  const setFacets = useCallback((selection: ChannelFacetSelection) => {
    setFilters((f) => ({
      ...f,
      group: selection.content,
      language: selection.language,
    }));
  }, []);
  /** 恢复显示全部；国家/地区由调用方重置或暂时绕过。 */
  const reset = useCallback(() => {
    setFilters(CLEARED);
    setQuery("");
  }, []);
  /** 记住正在离开的标签页筛选条件，再恢复下一标签页的条件。 */
  const switchTab = useCallback(
    (from: ListTab | null, to: ListTab | null) => {
      if (from)
        saved.current[from] =
          from === "all" ? filters : { ...CLEARED, search: filters.search };
      if (!to) return;
      const next = saved.current[to];
      const restored =
        to === "all"
          ? (next ?? CLEARED)
          : { ...CLEARED, search: next?.search ?? "" };
      setFilters(restored);
      setQuery(restored.search.trim());
    },
    [filters],
  );
  /** 删除的来源不能继续被选中、展示或记住。 */
  const forgetSource = useCallback((sourceId: string) => {
    for (const key of Object.keys(saved.current) as ListTab[]) {
      const tabFilters = saved.current[key];
      if (tabFilters?.sourceId === sourceId)
        saved.current[key] = {
          ...tabFilters,
          sourceId: "",
          group: null,
          language: null,
        };
    }
    setFilters((f) =>
      f.sourceId === sourceId
        ? { ...f, sourceId: "", group: null, language: null }
        : f,
    );
  }, []);
  const forgetSaved = useCallback(() => {
    saved.current = {};
  }, []);
  return {
    ...filters,
    query,
    countryBypass,
    setCountryBypass,
    setSearch,
    clearSearch,
    setSource,
    setFacets,
    reset,
    switchTab,
    forgetSource,
    forgetSaved,
  };
}
