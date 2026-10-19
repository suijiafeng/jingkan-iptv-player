import { fetch as expoFetch } from "expo/fetch";
import type { ContentType } from "expo-video";
import { linkedDeadline } from "../../lib/abort";
import { readStreamHead } from "../../lib/streamHead";

export const SNIFF_BYTES = 1024;
export const SNIFF_TIMEOUT_MS = 8000;

/**
 * Android 上 expo-video 的 "auto" 不会传入 MIME 类型，ExoPlayer 因此只根据
 * URL 后缀推断格式。没有后缀的 HLS 地址会被当作渐进式文件打开并失败。
 * 当后缀不足以确定格式、需要检查起始字节时，返回 null。
 */
export function contentTypeFromPath(uri: string): ContentType | null {
  let pathname: string;
  try {
    pathname = new URL(uri).pathname.toLowerCase();
  } catch {
    return "auto";
  }
  if (pathname.endsWith(".m3u8")) return "hls";
  if (pathname.endsWith(".mpd")) return "dash";
  if (/\.(?:mp4|m4v|m4a|mov|webm|mkv|ts|mts|flv|mp3|aac|ogg)$/.test(pathname))
    return "auto";
  return null;
}

/** 根据响应正文的开头判断格式；未知内容仍使用 "auto"。 */
export function contentTypeFromHead(head: string): ContentType {
  const text = head.replace(/^﻿/, "").trimStart();
  if (/^#EXTM3U/i.test(text)) return "hls";
  if (/<MPD[\s>]/i.test(text)) return "dash";
  return "auto";
}

/** 仅在已获许可的播放尝试中发起一次有界请求：Range 0-1023，最多读取 1 KiB，总时限 8 秒。任何失败都回退到“auto”，由原生播放器报告真实错误；不记录日志。 */
export async function resolveContentType(
  uri: string,
  signal: AbortSignal,
): Promise<ContentType> {
  const known = contentTypeFromPath(uri);
  if (known) return known;
  const deadline = linkedDeadline(signal, SNIFF_TIMEOUT_MS);
  try {
    const response = await expoFetch(uri, {
      signal: deadline.signal,
      headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
    });
    if (!response.ok || !response.body) return "auto";
    const mime = (response.headers.get("content-type") ?? "").toLowerCase();
    if (mime.includes("mpegurl")) return "hls";
    if (mime.includes("dash+xml")) return "dash";
    const { bytes } = await readStreamHead(response.body, SNIFF_BYTES);
    return contentTypeFromHead(new TextDecoder("utf-8").decode(bytes));
  } catch {
    return "auto";
  } finally {
    deadline.close();
  }
}
