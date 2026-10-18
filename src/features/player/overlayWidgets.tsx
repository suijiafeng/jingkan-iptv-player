import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { colors } from "../../theme";
import { LIVE_EDGE_MARGIN_S, type MediaHandle } from "./mediaHandle";
import { SLOW_START_SECONDS } from "./playerShared";

/** 每 DOTS_CYCLE_MS 循环一次 ""、"."、".."、"..."。 */
const DOTS_CYCLE_MS = 1200;
const DOTS_FRAMES = ["", ".", "..", "..."];

/** 用末尾逐步增加的圆点代替等待状态的旋转指示器；开启“减少动态效果”后固定显示省略号。圆点使用独立定宽区域，避免标题位置变化。 */
export function LoadingTitle({
  title,
  style,
}: {
  title: string;
  style?: StyleProp<TextStyle>;
}) {
  const [frame, setFrame] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (live) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(
      () => setFrame((current) => (current + 1) % DOTS_FRAMES.length),
      DOTS_CYCLE_MS / DOTS_FRAMES.length,
    );
    return () => clearTimeout(timer);
  }, [frame, reduceMotion]);
  return (
    <View style={styles.loadingTitle} pointerEvents="none">
      <Text style={style}>{title}</Text>
      <Text style={[style, styles.loadingDots]} accessibilityElementsHidden>
        {reduceMotion ? "…" : DOTS_FRAMES[frame]}
      </Text>
    </View>
  );
}

/** 原型中的视觉角色：pill 为画面上的 38dp 文字按钮；
 * quiet 为 40dp 图标，按下前无底色；ring 为 44dp 换台键，
 * 带半透明圆底及细边框；solid 放在不透明表面上。 */
export type OverlayVariant = "pill" | "quiet" | "ring" | "solid";

export function OverlayButton({
  label,
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  variant = "pill",
  compact = false,
  selected,
}: {
  label: string;
  /** 用图形代替标签文字；无障碍标签仍保留按钮名称。 */
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: OverlayVariant;
  /** 竖屏画面：环形按钮从 44dp 缩小到 40dp。 */
  compact?: boolean;
  selected?: boolean;
}) {
  const round = variant === "quiet" || variant === "ring";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        disabled,
        ...(selected === undefined ? {} : { selected }),
      }}
      disabled={disabled}
      hitSlop={round ? 4 : 6}
      style={({ pressed }) => [
        styles.overlayButton,
        variant === "quiet" && styles.overlayButtonQuiet,
        variant === "ring" && styles.overlayButtonRing,
        variant === "ring" && compact && styles.overlayButtonRingCompact,
        variant === "solid" && styles.overlayButtonSolid,
        pressed && styles.pressed,
        pressed && variant === "quiet" && styles.overlayButtonQuietPressed,
        disabled && styles.overlayButtonDisabled,
      ]}
      onPress={onPress}
    >
      {icon ?? (
        <Text
          style={[
            styles.overlayButtonText,
            variant === "ring" && styles.overlayButtonRingText,
            variant === "ring" &&
              compact &&
              styles.overlayButtonRingTextCompact,
            variant === "quiet" && styles.overlayButtonQuietText,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** 先以强调色显示清晰度，再显示来源；点击可打开备用线路。 */
export function SourceChip({
  quality,
  sourceName,
  count,
  solid = false,
  disabled = false,
  accessibilityLabel,
  onPress,
}: {
  quality: string;
  sourceName: string;
  count: number;
  /** 放在竖屏频道信息块的不透明表面上，而非视频画面上。 */
  solid?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        solid && styles.chipSolid,
        pressed && styles.pressed,
        disabled && styles.chipDisabled,
      ]}
      onPress={onPress}
    >
      <Text style={styles.chipText} numberOfLines={1}>
        <Text style={styles.chipQuality}>{quality}</Text>
        {` ${sourceName}`}
        {count > 1 ? ` · ${count} 个 ▾` : ""}
      </Text>
    </Pressable>
  );
}

/** 在覆盖栏后方还原原型的渐变遮罩，由多层半透明条带叠成；现有依赖中没有渐变模块。 */
const SHADE_STEPS = 8;
export function Shade({
  edge,
  heightRatio,
}: {
  edge: "top" | "bottom";
  /** 渐变覆盖画面的比例：顶部 0.46，底部 0.52。 */
  heightRatio: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.shade,
        edge === "top" ? styles.shadeTop : styles.shadeBottom,
        { height: `${Math.round(heightRatio * 100)}%` },
      ]}
    >
      {Array.from({ length: SHADE_STEPS }, (_unused, step) => {
        // 最靠近边缘的条带最暗，透明度向中心逐渐降低。
        const alpha = 0.74 * (1 - step / SHADE_STEPS);
        return (
          <View
            key={step}
            style={[
              styles.shadeStrip,
              { backgroundColor: `rgba(4, 8, 10, ${alpha.toFixed(3)})` },
            ]}
          />
        );
      })}
    </View>
  );
}

export function LiveBadge({ catchup = false }: { catchup?: boolean }) {
  return (
    <View
      style={styles.liveBadge}
      accessible
      accessibilityLabel={catchup ? "正在看直播" : "直播，不可回看"}
    >
      <View style={styles.liveDot} />
      <Text style={styles.liveText}>直播</Text>
    </View>
  );
}

export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${sec}`
    : `${minutes}:${sec}`;
}

/** 跳转范围由媒体流决定；读屏操作每次移动 30 秒。 */
const SEEK_STEP_S = 30;

/**
 * 支持回看的直播或点播显示时间轴，普通直播只显示标记，
 * 因而覆盖控件不会提供媒体流本身无法执行的跳转。
 */
export function MediaStatus({
  media,
  onScrubbingChange,
}: {
  media: MediaHandle;
  onScrubbingChange: (scrubbing: boolean) => void;
}) {
  const info = useSyncExternalStore(
    media.subscribeInfo,
    media.getInfo,
    media.getInfo,
  );
  const timeline = useSyncExternalStore(
    media.subscribeTimeline,
    media.getTimeline,
    media.getTimeline,
  );
  const [width, setWidth] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  if (!info.seekable || !timeline) return info.isLive ? <LiveBadge /> : null;
  const { duration } = timeline;
  const shown = preview ?? timeline.position;
  const fraction =
    duration > 0 ? Math.min(Math.max(shown / duration, 0), 1) : 0;
  const behind = duration - shown;
  const behindLive = info.isLive && behind > LIVE_EDGE_MARGIN_S + 5;
  // 位于直播边缘时不显示差距，落后时显示距离；点播显示进度。
  const label = info.isLive
    ? behindLive
      ? `落后 ${clock(behind)}`
      : ""
    : `${clock(shown)} / ${clock(duration)}`;
  const at = (offsetX: number) =>
    width > 0 ? Math.min(Math.max(offsetX / width, 0), 1) * duration : shown;
  const scrub = (value: number | null) => {
    setPreview(value);
    onScrubbingChange(value !== null);
  };
  return (
    <View style={styles.timelineRow} testID="media-timeline">
      {!!label && <Text style={styles.timelineText}>{label}</Text>}
      <View
        style={styles.timelineTrack}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={info.isLive ? "回看进度" : "播放进度"}
        accessibilityValue={{ text: label }}
        accessibilityActions={[
          { name: "increment", label: `前进 ${SEEK_STEP_S} 秒` },
          { name: "decrement", label: `后退 ${SEEK_STEP_S} 秒` },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          media.seekTo(
            timeline.position +
              (nativeEvent.actionName === "increment"
                ? SEEK_STEP_S
                : -SEEK_STEP_S),
          );
        }}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={({ nativeEvent }) => scrub(at(nativeEvent.locationX))}
        onResponderMove={({ nativeEvent }) => scrub(at(nativeEvent.locationX))}
        onResponderRelease={({ nativeEvent }) => {
          media.seekTo(at(nativeEvent.locationX));
          scrub(null);
        }}
        onResponderTerminate={() => scrub(null)}
      >
        <View style={styles.timelineBar} pointerEvents="none">
          <View
            style={[styles.timelineFill, { width: `${fraction * 100}%` }]}
          />
        </View>
        <View
          pointerEvents="none"
          style={[styles.timelineThumb, { left: `${fraction * 100}%` }]}
        />
      </View>
      {info.isLive &&
        (behindLive ? (
          <OverlayButton label="回到直播" onPress={() => media.goLive()} />
        ) : (
          <LiveBadge catchup />
        ))}
    </View>
  );
}

/** 记录没有画面的等待秒数，避免失效来源让用户无提示地等上 30 秒。使用按尝试标识区分的独立组件，使每秒计时只重渲染自身。 */
export function WaitProgress() {
  const [started] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    // 以开始时刻为基准，对齐整秒连续设置超时，而不使用 setInterval。
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const timer = setTimeout(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      (elapsed + 1) * 1000 - (Date.now() - started),
    );
    return () => clearTimeout(timer);
  }, [started, seconds]);
  const slow = seconds >= SLOW_START_SECONDS;
  // 一个数字提示：“已等 12 秒（最多 30 秒）”，随后变为“已等 16 秒 · 比平时慢”。
  if (seconds <= 0) return null;
  const line = slow
    ? `已等 ${seconds} 秒 · 比平时慢`
    : `已等 ${seconds} 秒（最多 30 秒）`;
  return (
    <Text style={styles.noticeBody} numberOfLines={1}>
      {line}
    </Text>
  );
}

const styles = StyleSheet.create({
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 32,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF6B5E",
  },
  liveText: {
    color: colors.text,
    letterSpacing: 0.7,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  noticeBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  noticeText: { gap: 8 },
  loadingTitle: { flexDirection: "row", justifyContent: "center" },
  loadingDots: { width: 22, textAlign: "left" },
  overlayButton: {
    height: 38,
    minWidth: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF24",
    flexShrink: 1,
  },
  overlayButtonQuiet: {
    width: 40,
    height: 40,
    minWidth: 40,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  overlayButtonQuietPressed: { backgroundColor: "#FFFFFF38" },
  overlayButtonQuietText: { fontSize: 18, lineHeight: 22 },
  overlayButtonRing: {
    width: 44,
    height: 44,
    minWidth: 44,
    paddingHorizontal: 0,
    backgroundColor: "#00000059",
    borderWidth: 1,
    borderColor: "#FFFFFF33",
  },
  overlayButtonRingCompact: { width: 40, height: 40, minWidth: 40 },
  overlayButtonRingText: { fontSize: 20, lineHeight: 24 },
  overlayButtonRingTextCompact: { fontSize: 18, lineHeight: 22 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFFFFF1F",
    flexShrink: 1,
  },
  chipSolid: { backgroundColor: colors.raised },
  chipDisabled: { opacity: 0.7 },
  chipText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  chipQuality: { color: colors.accent, fontWeight: "600" },
  shade: { position: "absolute", left: 0, right: 0 },
  shadeTop: { top: 0, flexDirection: "column" },
  shadeBottom: { bottom: 0, flexDirection: "column-reverse" },
  shadeStrip: { flex: 1 },
  overlayButtonDisabled: { opacity: 0.4 },
  overlayButtonSolid: { backgroundColor: colors.raised },
  overlayButtonText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
  },
  pressed: { opacity: 0.7 },
  timelineBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF40",
    overflow: "hidden",
  },
  timelineFill: { height: 4, backgroundColor: colors.accent },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timelineText: {
    color: "#FFFFFFCC",
    fontSize: 11,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
    minWidth: 64,
  },
  timelineThumb: {
    position: "absolute",
    top: 10,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: colors.text,
  },
  timelineTrack: { flex: 1, height: 32, justifyContent: "center" },
});
