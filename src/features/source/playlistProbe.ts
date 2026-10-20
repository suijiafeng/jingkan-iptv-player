import { normalizeLanguages } from "../../domain/channelFacets";

export type ProbeStep =
  { kind: "playlist"; uri: string } | { kind: "segment"; uri: string };

/** 响应声明为 HLS，或其正文开头像 HLS 列表时返回 true。 */
export function looksLikePlaylist(mime: string, head: string): boolean {
  if (mime.toLowerCase().includes("mpegurl")) return true;
  return /^#EXTM3U/i.test(head.replace(/^﻿/, "").trimStart());
}

/** 可用性检测下一步要访问的地址：主清单的第一个变体，或媒体清单的第一个媒体分片。如果正文达到读取上限而被截断，丢弃末尾不完整的一行；没有可用地址时返回 null，例如直播窗口为空或文本无法解析。 */
export function nextProbeStep(
  text: string,
  complete: boolean,
): ProbeStep | null {
  const body = complete ? text : text.slice(0, text.lastIndexOf("\n") + 1);
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const isUri = (line: string) => line !== "" && !line.startsWith("#");
  const variantTag = lines.findIndex((line) =>
    line.startsWith("#EXT-X-STREAM-INF"),
  );
  if (variantTag >= 0) {
    const uri = lines.slice(variantTag + 1).find(isUri);
    return uri ? { kind: "playlist", uri } : null;
  }
  const uri = lines.find(isUri);
  return uri ? { kind: "segment", uri } : null;
}

/**
 * 从主列表的 #EXT-X-MEDIA:TYPE=AUDIO 条目读取声明的音轨语言，
 * 并转为基础代码，例如 "zh-CN" → "zh"。只采用媒体流明确声明的信息，
 * 不读取名称或 URL。文本不是主列表时返回 null，因此媒体列表或分片
 * 不提供任何语言信息。
 */
export function audioLanguages(
  text: string,
  complete: boolean,
): string[] | null {
  const body = complete ? text : text.slice(0, text.lastIndexOf("\n") + 1);
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  if (!lines.some((line) => line.startsWith("#EXT-X-STREAM-INF"))) return null;
  const found = new Set<string>();
  for (const line of lines) {
    if (!line.startsWith("#EXT-X-MEDIA:")) continue;
    if (!/(?:^|[:,])TYPE=AUDIO(?:,|$)/.test(line)) continue;
    const declared = /(?:^|[:,])LANGUAGE="([^"]*)"/.exec(line)?.[1];
    for (const code of normalizeLanguages(declared))
      found.add(code.split("-")[0]);
  }
  return [...found];
}
