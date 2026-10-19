import { GBK_ROWS, GBK_TRAIL_COUNT } from "./gbkTable";

export type PlaylistEncoding = "utf-8" | "gbk";

export class TextEncodingError extends Error {
  constructor() {
    super("无法识别文件编码，请另存为 UTF-8 后导入");
    this.name = "TextEncodingError";
  }
}

/** 分片收集字符，避免大文件构造出一个巨大的函数参数列表。 */
const SLICE_LENGTH = 8192;

/**
 * 严格 GBK：WHATWG 双字节形式，以及表示“€”的 0x80。任何表外字节对、
 * 不完整字节对或 GB18030 四字节序列都会失败，不以替换字符掩盖错误。
 */
export function decodeGbk(bytes: Uint8Array): string {
  const parts: string[] = [];
  const codes = new Uint16Array(SLICE_LENGTH);
  let filled = 0;
  const flush = () => {
    parts.push(String.fromCharCode(...codes.subarray(0, filled)));
    filled = 0;
  };
  for (let position = 0; position < bytes.length; position += 1) {
    const lead = bytes[position];
    let code: number;
    if (lead < 0x80) code = lead;
    else if (lead === 0x80) code = 0x20ac;
    else if (lead === 0xff) throw new TextEncodingError();
    else {
      const trail = bytes[position + 1];
      if (trail === undefined || trail < 0x40 || trail === 0x7f || trail > 0xfe)
        throw new TextEncodingError();
      const column = trail < 0x7f ? trail - 0x40 : trail - 0x41;
      if (column >= GBK_TRAIL_COUNT) throw new TextEncodingError();
      code = GBK_ROWS[lead - 0x81].charCodeAt(column);
      position += 1;
    }
    codes[filled] = code;
    filled += 1;
    if (filled === SLICE_LENGTH) flush();
  }
  if (filled) flush();
  return parts.join("");
}

/**
 * 从原始字节读取节目单文本：有效 UTF-8（可带 BOM）优先，
 * 否则按 GBK 解码，许多中文 TXT 和 M3U 列表仍使用这种编码。
 */
export function decodePlaylistBytes(bytes: Uint8Array): {
  text: string;
  encoding: PlaylistEncoding;
} {
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    return { text: decodeGbk(bytes), encoding: "gbk" };
  }
}
