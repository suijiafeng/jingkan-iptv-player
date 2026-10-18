import type { Channel, ParsedChannel } from "./types";

export interface DeclaredQuality {
  label: string;
  /** 近似垂直像素数，仅用于稳定地按清晰度从低到高排序。 */
  rank: number;
}

const QUALITY: Record<string, DeclaredQuality> = {
  LOW: { label: "低清", rank: 360 },
  SD: { label: "标清", rank: 576 },
  HD: { label: "高清", rank: 720 },
  FHD: { label: "1080p", rank: 1080 },
  UHD: { label: "超高清", rank: 2160 },
  "4K": { label: "4K", rank: 2160 },
  "8K": { label: "8K", rank: 4320 },
};

/** 只接受显式元数据，刻意忽略频道名称。 */
export function parseDeclaredQuality(
  value: string | null | undefined,
): DeclaredQuality | null {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (QUALITY[normalized]) return QUALITY[normalized];
  const height = /^(\d{3,4})P$/.exec(normalized)?.[1];
  if (!height) return null;
  const rank = Number(height);
  if (rank < 144 || rank > 4320) return null;
  return { label: `${rank}p`, rank };
}

const IPTV_ORG_ID =
  /^([A-Za-z0-9][A-Za-z0-9-]*\.[a-z]{2})(?:@([A-Za-z0-9-]+))?$/;

export function qualityFromIptvOrgId(
  tvgId: string | null | undefined,
): DeclaredQuality | null {
  const match = tvgId ? IPTV_ORG_ID.exec(tvgId) : null;
  return match?.[2] ? parseDeclaredQuality(match[2]) : null;
}

/**
 * 只有身份可靠时，分组键才可跨来源共享：完全相同的 URL 或严格符合
 * iptv-org 格式的 ID。其它 tvg-id 命名空间仍限定在各自来源内。
 */
export function channelGroupKey(
  sourceId: string,
  identityKey: string,
  tvgId: string | null | undefined,
): string {
  const iptv = tvgId ? IPTV_ORG_ID.exec(tvgId) : null;
  if (iptv) {
    const quality = iptv[2] ? parseDeclaredQuality(iptv[2]) : null;
    const stableId = quality ? iptv[1] : tvgId!;
    return `iptv:${stableId.toLowerCase()}`;
  }
  if (identityKey.startsWith("url:")) return identityKey;
  if (tvgId) return `source:${sourceId}:tvg:${tvgId}`;
  return `source:${sourceId}:${identityKey}`;
}

export function compareChannelSources(
  left: Pick<
    Channel | ParsedChannel,
    "qualityRank" | "sortIndex" | "streamUrl"
  >,
  right: Pick<
    Channel | ParsedChannel,
    "qualityRank" | "sortIndex" | "streamUrl"
  >,
): number {
  const leftRank = left.qualityRank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.qualityRank ?? Number.POSITIVE_INFINITY;
  return (
    leftRank - rightRank ||
    left.sortIndex - right.sortIndex ||
    left.streamUrl.localeCompare(right.streamUrl)
  );
}

export function qualityName(
  channel: Pick<Channel | ParsedChannel, "qualityLabel">,
): string {
  return channel.qualityLabel ?? "未知清晰度";
}
