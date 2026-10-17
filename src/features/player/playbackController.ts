/** 不持有来源内容的状态机：播放 URL 和原生错误均不进入 UI 状态。 */
export type PlaybackPhase =
  | "paused"
  | "checking"
  | "connecting"
  | "playing"
  | "buffering"
  | "cellular"
  | "blocked"
  | "offline"
  | "timeout"
  | "error"
  | "ended";
export type PauseReason =
  "manual" | "background" | "interrupted" | "cellular-declined";
export interface PlaybackSnapshot {
  phase: PlaybackPhase;
  attemptId: number | null;
  pauseReason?: PauseReason;
}
export interface ConnectionState {
  type?: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
}
interface ControllerOptions {
  remoteAllowed: boolean;
  mobileWarning: boolean;
  checkNetwork: () => Promise<ConnectionState>;
  isAppActive: () => boolean;
  onStarted: () => void;
}
export const INITIAL_PLAY_TIMEOUT_MS = 30_000;
const activePhases: PlaybackPhase[] = [
  "checking",
  "connecting",
  "playing",
  "buffering",
];
/**
 * 只有缺少网络连接才算离线。isInternetReachable 反映 Android 自身的
 * 联通性探测结果（Google connectivitycheck）；在阻止该探测的网络中
 * 可能失败，例如中国大陆，即使实际能够联网。因此应由真实请求判断。
 */
export const isOffline = (network: ConnectionState) =>
  network.isConnected === false || network.type === "NONE";
/** VPN 或未知传输类型不能证明播放正在使用不计费的 Wi-Fi。 */
export const mightUseMobileData = (network: ConnectionState) =>
  !["WIFI", "ETHERNET", "BLUETOOTH"].includes(network.type ?? "UNKNOWN");

export class PlaybackController {
  private options: ControllerOptions;
  private snapshot: PlaybackSnapshot;
  private listeners = new Set<() => void>();
  private generation = 0;
  private networkVersion = 0;
  private latestNetwork: ConnectionState | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private startedAttempt: number | null = null;
  private disposed = false;

  constructor(options: ControllerOptions) {
    this.options = options;
    this.snapshot = {
      phase: options.remoteAllowed ? "paused" : "blocked",
      attemptId: null,
    };
  }
  /** React 开发环境的 StrictMode 可能会重新执行所属的 effect。 */
  activate() {
    this.disposed = false;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: PlaybackSnapshot) {
    if (this.disposed) return;
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  private clearTimer() {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
  }
  private stop(phase: PlaybackPhase, pauseReason?: PauseReason) {
    ++this.generation;
    this.clearTimer();
    this.publish({
      phase,
      attemptId: null,
      ...(pauseReason ? { pauseReason } : {}),
    });
  }
  setOnStarted(onStarted: () => void) {
    this.options = { ...this.options, onStarted };
  }
  setPolicy(remoteAllowed: boolean, mobileWarning: boolean) {
    const revoked = this.options.remoteAllowed && !remoteAllowed;
    const newlyWarned = !this.options.mobileWarning && mobileWarning;
    this.options = { ...this.options, remoteAllowed, mobileWarning };
    if (!remoteAllowed) {
      if (revoked || this.snapshot.phase !== "blocked") this.stop("blocked");
    } else if (this.snapshot.phase === "blocked") {
      // 设置变更绝不会偷偷开始播放。
      this.stop("paused", "manual");
    } else if (
      newlyWarned &&
      this.latestNetwork &&
      mightUseMobileData(this.latestNetwork) &&
      activePhases.includes(this.snapshot.phase)
    ) {
      this.stop("cellular");
    }
  }
  async requestPlay(allowMobileForThisAttempt = false): Promise<void> {
    if (this.disposed) return;
    if (!this.options.remoteAllowed) {
      this.stop("blocked");
      return;
    }
    if (!this.options.isAppActive()) {
      this.stop("paused", "background");
      return;
    }
    this.clearTimer();
    const token = ++this.generation;
    const networkVersion = this.networkVersion;
    this.publish({ phase: "checking", attemptId: null });
    let network: ConnectionState;
    try {
      network = await this.options.checkNetwork();
    } catch {
      if (token === this.generation && !this.disposed) this.stop("error");
      return;
    }
    if (this.disposed || token !== this.generation) return;
    // 延迟返回的网络查询绝不能覆盖更新的连接事件。
    if (networkVersion !== this.networkVersion && this.latestNetwork)
      network = this.latestNetwork;
    this.latestNetwork = network;
    if (!this.options.remoteAllowed) {
      this.stop("blocked");
      return;
    }
    if (!this.options.isAppActive()) {
      this.stop("paused", "background");
      return;
    }
    if (isOffline(network)) {
      this.stop("offline");
      return;
    }
    if (
      this.options.mobileWarning &&
      mightUseMobileData(network) &&
      !allowMobileForThisAttempt
    ) {
      this.stop("cellular");
      return;
    }
    this.startedAttempt = null;
    this.publish({ phase: "connecting", attemptId: token });
    this.timeout = setTimeout(() => {
      if (this.isCurrentAttempt(token) && this.startedAttempt !== token)
        this.stop("timeout");
    }, INITIAL_PLAY_TIMEOUT_MS);
  }
  pause(reason: PauseReason = "manual") {
    this.stop(this.options.remoteAllowed ? "paused" : "blocked", reason);
  }
  appStateChanged(state: string) {
    if (state !== "active") this.pause("background");
    // 回到前台时刻意不自动恢复播放。
  }
  networkChanged(network: ConnectionState) {
    if (this.disposed) return;
    const previous = this.latestNetwork;
    this.latestNetwork = network;
    ++this.networkVersion;
    if (!activePhases.includes(this.snapshot.phase)) return;
    if (isOffline(network)) {
      this.stop("offline");
      return;
    }
    if (
      this.options.mobileWarning &&
      mightUseMobileData(network) &&
      (!previous || !mightUseMobileData(previous))
    ) {
      // 移除本次尝试，会在确认前先卸载并释放其解码器。
      this.stop("cellular");
    }
  }
  isCurrentAttempt = (id: number) =>
    !this.disposed &&
    this.options.remoteAllowed &&
    this.options.isAppActive() &&
    this.snapshot.attemptId === id &&
    activePhases.includes(this.snapshot.phase);
  nativeStarted(id: number) {
    if (!this.isCurrentAttempt(id)) return;
    this.clearTimer();
    this.publish({ phase: "playing", attemptId: id });
    if (this.startedAttempt !== id) {
      this.startedAttempt = id;
      this.options.onStarted();
    }
  }
  nativeStatus(id: number, status: string) {
    if (!this.isCurrentAttempt(id)) return;
    if (status === "error") this.stop("error");
    else if (status === "loading")
      this.publish({
        phase: this.startedAttempt === id ? "buffering" : "connecting",
        attemptId: id,
      });
    // readyToPlay 不能证明媒体已经真正播放。
  }
  nativeStopped(id: number) {
    if (!this.isCurrentAttempt(id)) return;
    // 缓冲也会发出 isPlaying=false；只有就绪状态下真正暂停才算
    // 由原生适配层传入此处；绝不通过错误文本猜测音频焦点状态。
    if (this.startedAttempt === id) this.pause("interrupted");
  }
  nativeEnded(id: number) {
    // 未设置来源的空 ExoPlayer 会立即报告 ENDED。
    // 只有真正播放过的流才能结束；更早的“结束”交给
    // 等待首次连接超时或真实错误。
    if (this.isCurrentAttempt(id) && this.startedAttempt === id)
      this.stop("ended");
  }
  dispose() {
    this.disposed = true;
    ++this.generation;
    this.clearTimer();
    this.listeners.clear();
  }
}

export function adjacentChannelIndex(
  length: number,
  currentIndex: number,
  direction: -1 | 1,
): number | null {
  const target = currentIndex + direction;
  return currentIndex < 0 || target < 0 || target >= length ? null : target;
}

/**
 * 与 adjacentChannelIndex 相似，但会跨过调用方要求跳过的频道，
 * 例如最近一次手动检测发现无法连接的频道。到达边界后不循环。
 */
export function adjacentPlayableIndex<T>(
  items: readonly T[],
  currentIndex: number,
  direction: -1 | 1,
  skip: (item: T) => boolean = () => false,
): number | null {
  if (currentIndex < 0) return null;
  for (
    let target = currentIndex + direction;
    target >= 0 && target < items.length;
    target += direction
  )
    if (!skip(items[target])) return target;
  return null;
}

export function backDestination(
  sheetOpen: boolean,
  fullscreen: boolean,
): "sheet" | "fullscreen" | "close" {
  return sheetOpen ? "sheet" : fullscreen ? "fullscreen" : "close";
}
