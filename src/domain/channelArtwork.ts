import { normalizeRemoteUrl } from "./url";

/** 仅执行输入策略检查；DNS 和重定向由原生图片加载器处理。 */
export function channelArtworkUrl(
  uri: string | null | undefined,
): string | null {
  if (!uri || uri.length > 4096) return null;
  try {
    const normalized = normalizeRemoteUrl(uri);
    return new URL(normalized).protocol === "https:" ? normalized : null;
  } catch {
    return null;
  }
}
