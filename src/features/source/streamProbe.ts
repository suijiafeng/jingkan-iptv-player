import { fetch as expoFetch } from "expo/fetch";
import { normalizeRemoteUrl } from "../../domain/url";
import { abortableDelay, linkedDeadline } from "../../lib/abort";
import { readStreamHead } from "../../lib/streamHead";
import {
  audioLanguages,
  looksLikePlaylist,
  nextProbeStep,
} from "./playlistProbe";

/** 每次请求的上限；一次尝试最多发起四个请求，见 CHECK_ATTEMPT_BUDGET_MS。 */
export const CHECK_TIMEOUT_MS = 8000;
/** 在唯一一次重试前暂停片刻，让短暂网络波动有机会恢复。 */
export const CHECK_RETRY_DELAY_MS = 1000;
/** 每次尝试最多沿“主清单 → 媒体清单 → 分片”跟进。 */
export const CHECK_ATTEMPT_BUDGET_MS = 15000;
/** 读取节目单直到首个可用行，绝不超过此限制。 */
export const PLAYLIST_MAX_BYTES = 64 * 1024;
const PROBE_BYTES = 1024;
const MAX_PLAYLIST_DEPTH = 2;

/**
 * "error" 表示没有可用响应，但稍后可能改变，例如 DNS、连接、
 * 连接重置、超时或临时状态码（408、429、5xx）。
 */
type Attempt = "ok" | "failed" | "error";

/** 可达地址还可声明它包含的音轨语言，直接从检测本来就会获取的主清单读取。没有可读主清单时，不提供该字段。 */
export interface StreamCheck {
  ok: boolean;
  languages?: string[];
}

interface Fetched {
  status: number;
  ok: boolean;
  url: string;
  mime: string;
  text: string;
  /** 正文已经完整读完，因此末尾一行没有被截断。 */
  complete: boolean;
}

const temporaryStatus = (status: number) =>
  status === 408 || status === 429 || (status >= 500 && status <= 599);

const outcome = (fetched: Fetched): Attempt | null =>
  fetched.ok ? null : temporaryStatus(fetched.status) ? "error" : "failed";

async function request(
  url: string,
  signal: AbortSignal,
  range: boolean,
  limit: number,
): Promise<Fetched> {
  const deadline = linkedDeadline(signal, CHECK_TIMEOUT_MS);
  try {
    const response = await expoFetch(url, {
      signal: deadline.signal,
      ...(range ? { headers: { Range: `bytes=0-${PROBE_BYTES - 1}` } } : {}),
    });
    const fetched: Fetched = {
      status: response.status,
      ok: response.ok,
      url: response.url || url,
      mime: response.headers?.get("content-type") ?? "",
      text: "",
      complete: false,
    };
    if (!response.ok || !response.body) {
      void response.body?.cancel().catch(() => {});
      return fetched;
    }
    const head = await readStreamHead(response.body, limit);
    fetched.text = new TextDecoder("utf-8").decode(head.bytes);
    // 长度小于请求范围的 206 响应，表示已经返回完整文件。
    fetched.complete =
      head.ended &&
      (response.status !== 206 || head.bytes.byteLength < PROBE_BYTES);
    return fetched;
  } finally {
    deadline.close();
  }
}

/** 部分服务器对 Range 请求返回 416，此时不带 Range 再请求一次。 */
async function requestHead(url: string, signal: AbortSignal) {
  const head = await request(url, signal, true, PROBE_BYTES);
  return head.status === 416 ? request(url, signal, false, PROBE_BYTES) : head;
}

async function followAddress(
  url: string,
  signal: AbortSignal,
  depth: number,
  found: { languages?: string[] },
): Promise<Attempt> {
  const head = await requestHead(url, signal);
  const headFailure = outcome(head);
  if (headFailure) return headFailure;
  if (depth > MAX_PLAYLIST_DEPTH || !looksLikePlaylist(head.mime, head.text))
    return "ok";
  // Range 响应只包含开头 1 KiB；因此还要读取清单本身。
  const playlist = head.complete
    ? head
    : await request(head.url, signal, false, PLAYLIST_MAX_BYTES);
  const playlistFailure = outcome(playlist);
  if (playlistFailure) return playlistFailure;
  if (depth === 0)
    found.languages =
      audioLanguages(playlist.text, playlist.complete) ?? undefined;
  const step = nextProbeStep(playlist.text, playlist.complete);
  // 节目单已响应，空的直播窗口无法进一步探测。
  if (!step) return "ok";
  let next: string;
  try {
    // 使用与导入相同的地址规则：不探测私网或特殊用途主机。
    next = normalizeRemoteUrl(step.uri, playlist.url);
  } catch {
    return "ok";
  }
  return followAddress(
    next,
    signal,
    step.kind === "playlist" ? depth + 1 : MAX_PLAYLIST_DEPTH + 1,
    found,
  );
}

async function attemptStream(
  url: string,
  signal: AbortSignal,
  found: { languages?: string[] },
): Promise<Attempt> {
  const deadline = linkedDeadline(signal, CHECK_ATTEMPT_BUDGET_MS);
  try {
    return await followAddress(url, deadline.signal, 0, found);
  } catch {
    return "error";
  } finally {
    deadline.close();
  }
}

/** 只能由用户触发。每个地址使用 Range 0-1023 请求；遇到 HLS 清单时，继续按相同方式探测第一个变体和第一个分片。“ok”只表示每一步都返回成功状态，不代表能够解码或播放。网络错误或临时状态只重试一次，其它 HTTP 错误是服务器的明确响应，不再重试。 */
export async function checkStream(
  url: string,
  signal: AbortSignal,
): Promise<boolean> {
  return (await probeStream(url, signal)).ok;
}

/** checkStream 的检测结果，加上可达 HLS 主播放列表声明的音轨语言。 */
export async function probeStream(
  url: string,
  signal: AbortSignal,
): Promise<StreamCheck> {
  let found: { languages?: string[] } = {};
  let attempt = await attemptStream(url, signal, found);
  if (attempt === "error") {
    await abortableDelay(CHECK_RETRY_DELAY_MS, signal);
    if (signal.aborted) return { ok: false };
    found = {};
    attempt = await attemptStream(url, signal, found);
  }
  return attempt === "ok" ? { ok: true, ...found } : { ok: false };
}
