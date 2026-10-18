/** 中文 IPTV 应用中常见的 TXT 频道目录（DIYP / TVBox 风格）：
 * 央视频道,#genre#
 * CCTV-1,http://example.com/cctv1.m3u8
 * CCTV-1,http://a.example.com/1.m3u8#http://b.example.com/1.m3u8
 * CCTV-2,http://example.com/cctv2.m3u8$线路一
 * “名称,#genre#”开始一个分组；频道行采用“名称,地址”。多个地址可用“#”连接，末尾的“$备注”用于给线路命名，不属于地址。 */
export type TxtLine =
  | { kind: "group"; name: string }
  | { kind: "channel"; name: string; urls: string[] }
  | { kind: "comment" }
  | { kind: "invalid" };

const GENRE_MARK = /^#genre#$/i;
/** 用于开始另一个绝对地址的“#”，而不是 URL 片段。 */
const ALTERNATIVE_SEPARATOR = /#(?=[a-z][a-z0-9+.-]*:\/\/)/i;
/** 末尾的 "$label" 备注，前提是备注不可能属于路径或查询参数。 */
const LINE_LABEL = /\$[^/?=&]*$/;
/** 频道行：名称、逗号，以及后面的带协议地址。 */
const CHANNEL_LINE = /^[^#,\n][^,\n]*,\s*[a-z][a-z0-9+.-]*:\/\//im;
const GENRE_LINE = /^[^,\n]+,\s*#genre#\s*$/im;

/** 文本更像 TXT 频道列表而不是 M3U 时返回 true。 */
export function looksLikeTxtPlaylist(text: string): boolean {
  return CHANNEL_LINE.test(text) || GENRE_LINE.test(text);
}

export function parseTxtLine(line: string): TxtLine {
  if (line.startsWith("#") || line.startsWith("//")) return { kind: "comment" };
  const comma = line.indexOf(",");
  if (comma <= 0) return { kind: "invalid" };
  const name = line.slice(0, comma).trim();
  const rest = line.slice(comma + 1).trim();
  if (!name) return { kind: "invalid" };
  if (GENRE_MARK.test(rest)) return { kind: "group", name };
  const urls = rest
    .split(ALTERNATIVE_SEPARATOR)
    .map((address) => address.replace(LINE_LABEL, "").trim())
    .filter(Boolean);
  return urls.length ? { kind: "channel", name, urls } : { kind: "invalid" };
}
