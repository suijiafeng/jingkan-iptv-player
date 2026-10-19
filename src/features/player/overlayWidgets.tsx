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
  testID,
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
  testID?: string;
}) {
  const round = variant === "quiet" || variant === "ring";
  return (
    <Pressable
      testID={testID}
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

/**
 * 先用强调色显示清晰度，再显示当前来源在总数中的位置（“1/3”）；
 * 点击可打开备用线路，来源名称显示在打开的列表中。
 * 清晰度未知时省略它（“1/2”）；只有一个来源且没有清晰度时，
 * 按钮没有有效信息，因此不绘制。
 */
export function SourceChip({
  quality,
  position,
  count,
  solid = false,
  disabled = false,
  accessibilityLabel,
  onPress,
}: {
  /** 仅使用明确标注的画质，绝不从频道名称猜测。 */
  quality: string | null;
  /** 正在播放的来源在 `count` 个来源中的位置，从 1 开始。 */
  position: number;
  count: number;
  /** 放在竖屏频道信息块的不透明表面上，而非视频画面上。 */
  solid?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  if (!quality && count < 2) return null;
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
        {!!quality && <Text style={styles.chipQuality}>{quality}</Text>}
        {count > 1 ? `${quality ? " · " : ""}${position}/${count}` : ""}
      </Text>
    </Pressable>
  );
}

/** 原生连续渐变：控件附近较暗，向中心逐渐透明。 */
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
    />
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

/**
 * 离开直播边缘时，“直播”文字变为这个标签：红点变灰，
 * 点击后跳回直播边缘。
 */
function BackToLive({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="回到直播"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.backToLive, pressed && styles.pressed]}
    >
      <View style={[styles.liveDot, styles.liveDotBehind]} />
      <Text style={styles.backToLiveText}>回到直播</Text>
    </Pressable>
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
      ? `-${clock(behind)}`
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
          <BackToLive onPress={() => media.goLive()} />
        ) : (
          <LiveBadge catchup />
        ))}
    </View>
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
  liveDotBehind: { backgroundColor: colors.muted },
  backToLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF24",
  },
  backToLiveText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  liveText: {
    color: colors.text,
    letterSpacing: 0.7,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
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
  shadeTop: {
    top: 0,
    backgroundImage:
      "linear-gradient(to bottom, rgba(4, 8, 10, 0.55), rgba(4, 8, 10, 0))",
  },
  shadeBottom: {
    bottom: 0,
    backgroundImage:
      "linear-gradient(to top, rgba(4, 8, 10, 0.55), rgba(4, 8, 10, 0))",
  },
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
