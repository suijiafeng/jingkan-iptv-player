export interface StreamHead {
  bytes: Uint8Array;
  /** 响应体在限制内结束，因此没有截断内容。 */
  ended: boolean;
}

/**
 * 最多读取正文开头的 `limit` 字节，然后取消读取；
 * 直播流可能忽略 Range 并一直传输下去。
 */
export async function readStreamHead(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<StreamHead> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let ended = false;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) {
        ended = true;
        break;
      }
      const part = value.subarray(0, limit - size);
      chunks.push(part);
      size += part.byteLength;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, ended };
}
