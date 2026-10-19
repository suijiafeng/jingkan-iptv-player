import { parseDeclaredQuality } from "./channelSources";
/** 分组经过翻译和去重后，用 ";" 连接保存。 */
export const UNGROUPED = "未分组";
export const GROUP_SEPARATOR = ";";

// iptv-org 内容分类词表（https://github.com/iptv-org/database）。
const GROUP_TRANSLATIONS: Record<string, string> = {
  animation: "动画",
  auto: "汽车",
  business: "财经",
  classic: "经典",
  comedy: "喜剧",
  cooking: "美食",
  culture: "文化",
  documentary: "纪录片",
  education: "教育",
  entertainment: "娱乐",
  family: "家庭",
  general: "综合",
  interactive: "互动",
  kids: "少儿",
  legislative: "议会",
  lifestyle: "生活",
  movies: "电影",
  music: "音乐",
  news: "新闻",
  outdoor: "户外",
  public: "公共",
  relax: "休闲",
  religious: "宗教",
  science: "科学",
  series: "剧集",
  shop: "购物",
  sports: "体育",
  travel: "旅游",
  weather: "天气",
};
const NO_GROUP = new Set(["", "undefined", "other", "others", "未分组"]);

/** "Culture;Documentary;Travel" → "文化;纪录片;旅游"；空值或 Undefined → 未分组。 */
export function normalizeGroups(raw: string | undefined | null): string {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(/[;；]/)) {
    const trimmed = part.trim();
    if (NO_GROUP.has(trimmed.toLowerCase())) continue;
    seen.add(GROUP_TRANSLATIONS[trimmed.toLowerCase()] ?? trimmed);
  }
  return seen.size ? [...seen].join(GROUP_SEPARATOR) : UNGROUPED;
}

export function splitGroups(groupName: string): string[] {
  const parts = groupName
    .split(GROUP_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [UNGROUPED];
}

/**
 * 频道行的分组说明。`hidden` 表示列表当前已经筛选到的分组；
 * 每行重复它没有意义，因此只保留频道的其他分组，也可能为空。
 */
export function displayGroups(
  groupName: string,
  hidden: string | null = null,
): string {
  return splitGroups(groupName)
    .filter((group) => group !== hidden)
    .join("、");
}

/**
 * 所有显示行共有的分组，即“全部”范围下选中的内容标签；
 * 空字符串选择未分组频道。其它范围忽略此条件。
 */
export function filteredGroup(
  scope: string,
  content: string | null,
): string | null {
  if (scope !== "all" || content === null) return null;
  return content || UNGROUPED;
}

/** 使用最多三个字符，在列表中区分同系列频道：“CCTV5+”→“5+”、“CCTV怀旧剧场”→“怀”、“CGTN”→“CG”、“湖南卫视”→“湖”。否则相同的拉丁字母前缀（如 CCTV、BTV）会让每行都显示同一首字母。 */
export function channelMonogram(title: string): string {
  const name = title.trim();
  const prefixed = name.match(/^[A-Za-z]{2,}[\s-]*(.*)$/);
  if (prefixed) {
    const rest = prefixed[1];
    const number = rest.match(/^\d{1,2}\+?/);
    if (number) return number[0];
    const first = Array.from(rest)[0];
    if (first && first.charCodeAt(0) > 0x7f) return first;
    return name.slice(0, 2).toUpperCase();
  }
  return Array.from(name)[0] || "台";
}

const TAG_TRANSLATIONS: Record<string, string> = {
  "geo-blocked": "地区限制",
  "not 24/7": "非全天",
};

/**
 * 为显示而从频道名称末尾拆出“[Geo-blocked]”“[Not 24/7]”等标记，
 * 以及括号中的清晰度（“(1080p)”“（HD）”）。存储名称不变，
 * 因而搜索仍可匹配；这里的结果不参与频道身份判断，也不作为来源声明的清晰度。
 */
export function channelTitle(name: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  let title = name.trim();
  let match: RegExpMatchArray | null;
  for (;;) {
    if ((match = title.match(/\s*\[([^\]\n]{1,40})\]$/))) {
      const tag = match[1].trim();
      tags.unshift(TAG_TRANSLATIONS[tag.toLowerCase()] ?? tag);
    } else if ((match = title.match(/\s*[(（]([^)）\n]{1,10})[)）]$/))) {
      // 只提取可识别的画质标记；"(Beijing)" 仍属于频道名。
      const quality = parseDeclaredQuality(match[1]);
      if (!quality) break;
      tags.unshift(quality.label);
    } else break;
    title = title.slice(0, title.length - match[0].length).trim();
  }
  // 如果名称完全由方括号内容构成，它就是频道名称，不视作标记。
  return title ? { title, tags } : { title: name.trim(), tags: [] };
}
