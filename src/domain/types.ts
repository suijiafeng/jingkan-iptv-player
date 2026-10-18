/** UTC 时间戳使用 Unix 毫秒。URL 和文件内容属于私密数据。 */
export type SourceKind = "url" | "file";

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  /** 远程 URL 或原始文件名，不保存可公开访问的文件副本。 */
  location: string;
  createdAt: number;
  lastSuccessAt: number;
  lastErrorCategory: string | null;
  revision: number;
  channelCount: number;
  favoriteCount: number;
}

export interface ParsedChannel {
  identityKey: string;
  /** 稳定的逻辑频道分组，由仓库层填充。 */
  groupKey?: string;
  name: string;
  groupName: string;
  tvgId: string | null;
  logoUrl: string | null;
  /** 只使用节目单显式元数据；缺少元数据时保持未标注。 */
  countries?: string[];
  languages?: string[];
  streamUrl: string;
  /** 只使用节目单显式清晰度，绝不根据显示名称推断。 */
  qualityLabel?: string | null;
  qualityRank?: number | null;
  sortIndex: number;
}

export interface Channel extends ParsedChannel {
  id: string;
  sourceId: string;
  sourceName: string;
  active: boolean;
  lastSeenRevision: number;
  favorite: boolean;
  lastPlayedAt: number | null;
  /** 手动可用性检测：地址曾响应，不代表能够播放。 */
  checkStatus: "ok" | "unreachable" | null;
  checkedAt: number | null;
}

export type ImportIssueReason =
  | "dangling_extinf"
  | "missing_extinf"
  | "invalid_extinf"
  | "invalid_url"
  | "unsafe_url"
  | "unsupported_protocol"
  | "relative_without_base"
  | "duplicate";

export const IMPORT_ISSUE_LABELS: Record<ImportIssueReason, string> = {
  dangling_extinf: "频道信息后缺少播放地址",
  missing_extinf: "地址前缺少频道信息",
  invalid_extinf: "频道信息格式错误",
  invalid_url: "地址格式错误",
  unsafe_url: "不支持的本机、私网或特殊地址",
  unsupported_protocol: "不支持的地址协议",
  relative_without_base: "本地文件中无法解析的相对地址",
  duplicate: "重复频道",
};

export interface ImportIssue {
  line: number;
  reason: ImportIssueReason;
}

export interface ImportPreview {
  channels: ParsedChannel[];
  stats: {
    valid: number;
    duplicates: number;
    ignored: number;
    total: number;
    http: number;
    bytes: number;
    lines: number;
  };
  /** 有长度上限且已脱敏的诊断信息，绝不包含完整 URL 或 M3U 原文。 */
  issues: ImportIssue[];
  issueCounts: Partial<Record<ImportIssueReason, number>>;
}

export interface ImportSourceInput {
  name: string;
  kind: SourceKind;
  location: string;
  preview: ImportPreview;
  /** 文件来源必须提供；仅存放在私有 SQLite 中。 */
  content?: string;
}

export interface ChannelQuery {
  sourceId?: string;
  groupName?: string;
  /** undefined 表示全部；空字符串选择未标注的频道。 */
  country?: string;
  language?: string;
  search?: string;
  mode?: "all" | "favorites" | "recent";
  includeInactive?: boolean;
  /** 内部维护操作可能需要读取每一个真实播放地址。 */
  includeVariants?: boolean;
  /** 渐进展示所用的分页参数；各行保持查询定义的稳定顺序。 */
  limit?: number;
  offset?: number;
}

export interface RefreshToken {
  sourceId: string;
  revision: number;
  generation: number;
}
