import { fetch as expoFetch } from "expo/fetch";
import { readBoundedStream } from "../../data/importIO";
import { linkedDeadline } from "../../lib/abort";
import { isIptvOrgId, normalizeLanguages } from "../../domain/channelFacets";
import type { ParsedChannel } from "../../domain/types";

/** iptv-org 公共数据库；仅在用户请求时获取。 */
export const IPTV_ORG_FEEDS_URL = "https://iptv-org.github.io/api/feeds.json";
/** 2026-10 时约为 8 MB；在设定上限时留出余量。 */
export const MAX_FEEDS_BYTES = 24 * 1024 * 1024;
export const FEEDS_TIMEOUT_MS = 120_000;

export class LanguageLookupError extends Error {}

/** 符合 iptv-org 格式、但节目单未标注语言的频道。 */
export function needsLanguageLookup(
  channel: Pick<ParsedChannel, "tvgId" | "languages">,
): boolean {
  return isIptvOrgId(channel.tvgId) && !channel.languages?.length;
}

/** 从 iptv-org feeds.json 中挑选所需 tvg-id 的语言。“Name.cc@Feed”匹配指定线路；单独的“Name.cc”使用主线路。输入不可信，形状不符合线路记录的数据一律跳过。 */
export function languagesFromFeeds(
  feeds: unknown,
  wanted: ReadonlySet<string>,
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  if (!Array.isArray(feeds)) return found;
  for (const feed of feeds as unknown[]) {
    if (!feed || typeof feed !== "object") continue;
    const { channel, id, is_main, languages } = feed as Record<string, unknown>;
    if (typeof channel !== "string" || typeof id !== "string") continue;
    if (!Array.isArray(languages)) continue;
    const codes = normalizeLanguages(
      languages
        .filter((code): code is string => typeof code === "string")
        .join(";"),
    );
    if (!codes.length) continue;
    const full = `${channel}@${id}`;
    if (wanted.has(full)) found.set(full, codes);
    if (is_main === true && wanted.has(channel) && !found.has(channel))
      found.set(channel, codes);
  }
  return found;
}

/** 有大小限制的 feeds.json 单次下载，可通过 `signal` 取消。 */
export async function lookupIptvOrgLanguages(
  wanted: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<Map<string, string[]>> {
  const deadline = linkedDeadline(signal, FEEDS_TIMEOUT_MS);
  try {
    const response = await expoFetch(IPTV_ORG_FEEDS_URL, {
      signal: deadline.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok || !response.body)
      throw new LanguageLookupError(
        `语言数据库暂时无法访问（错误码 ${response.status}），请稍后再试`,
      );
    const text = await readBoundedStream(
      response.body,
      deadline.signal,
      MAX_FEEDS_BYTES,
    );
    return languagesFromFeeds(JSON.parse(text), wanted);
  } catch (error) {
    if (error instanceof LanguageLookupError) throw error;
    throw new LanguageLookupError(
      signal.aborted
        ? "已停止补全语言"
        : deadline.timedOut
          ? "语言数据库下载超时，请检查网络后重试"
          : "语言数据库读取未完成，请检查网络后重试",
    );
  } finally {
    deadline.close();
  }
}
