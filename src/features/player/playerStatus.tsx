import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { showToast } from "../../components/Toast";
import { PlayIcon } from "./playerIcons";
import { colors } from "../../theme";
import type { PlaybackSnapshot } from "./playbackController";
import { descriptions, SLOW_START_SECONDS } from "./playerShared";

const DOT_OFFSETS = [0, 0.14, 0.28];

/** 是否开启“减少动态效果”；开启时停止循环动画。 */
function useReduceMotion() {
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
  return reduceMotion;
}

/**
 * 一个圆点的呼吸周期：先等待自身在周期中的延迟，再上升 2dp、
 * 放大并变亮，经过周期的 0.6 后恢复。
 */
const breath = (progress: Animated.Value, offset: number) => {
  const inputRange =
    offset === 0
      ? [0, 0.3, 0.6, 1]
      : [0, offset, offset + 0.3, offset + 0.6, 1];
  const lift = (rest: number, peak: number) =>
    progress.interpolate({
      inputRange,
      outputRange:
        offset === 0
          ? [rest, peak, rest, rest]
          : [rest, rest, peak, rest, rest],
    });
  return {
    opacity: lift(0.35, 1),
    transform: [{ translateY: lift(0, -2) }, { scale: lift(1, 1.25) }],
  };
};

/**
 * 等待画面时，柔和胶囊中有三个点依次轻轻呼吸；
 * 超过慢启动阈值后改为琥珀色，并放慢动画。
 */
export function LoadingDots({ slow }: { slow: boolean }) {
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: slow ? 1900 : 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion, slow]);
  const color = slow ? colors.warn : colors.accent;
  return (
    <View
      testID="loading-dots"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={slow ? "正在加载，比平时慢" : "正在加载"}
      style={statusStyles.dotsPill}
    >
      {DOT_OFFSETS.map((offset) => (
        <Animated.View
          key={offset}
          style={[
            statusStyles.dot,
            { backgroundColor: color },
            reduceMotion ? statusStyles.dotStill : breath(progress, offset),
          ]}
        />
      ))}
    </View>
  );
}

/** 画面中央的唯一操作，使用描边标签按钮。 */
export function CenterChip({
  label,
  icon,
  accessibilityLabel,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        statusStyles.chip,
        pressed && statusStyles.pressed,
        disabled && statusStyles.disabled,
      ]}
    >
      {icon}
      <Text style={statusStyles.chipText}>{label}</Text>
    </Pressable>
  );
}

/**
 * 画面中央的移动数据确认：说明后果、提供唯一操作，并允许勾选
 * 不再询问（会关闭“移动网络提醒”）。
 */
export function MobileDataPrompt({
  stopReminding,
  onStopRemindingChange,
  disabled,
  onContinue,
}: {
  stopReminding: boolean;
  onStopRemindingChange: (checked: boolean) => void;
  disabled: boolean;
  onContinue: () => void;
}) {
  return (
    <View style={statusStyles.prompt}>
      <Text style={statusStyles.promptText}>播放将消耗流量，是否继续播放</Text>
      <CenterChip
        label="用流量播放"
        icon={<PlayIcon size={13} />}
        disabled={disabled}
        onPress={onContinue}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="不再提醒"
        accessibilityState={{ checked: stopReminding }}
        hitSlop={8}
        onPress={() => onStopRemindingChange(!stopReminding)}
        style={statusStyles.checkRow}
      >
        <View
          style={[statusStyles.checkBox, stopReminding && statusStyles.checked]}
        >
          {stopReminding && <View style={statusStyles.checkMark} />}
        </View>
        <Text style={statusStyles.checkText}>不再提醒</Text>
      </Pressable>
    </View>
  );
}

const NOT_SLOW = Symbol("not slow");

/**
 * 当前等待（按播放尝试区分）超过慢启动阈值后变为 true。
 * 计时器记录哪次等待已经变慢，因此新尝试自然重新开始，
 * 不必手动重置状态。
 */
export function useSlowStart(waiting: boolean, attemptKey: unknown) {
  const [slowFor, setSlowFor] = useState<unknown>(NOT_SLOW);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(
      () => setSlowFor(attemptKey),
      SLOW_START_SECONDS * 1000,
    );
    return () => clearTimeout(timer);
  }, [waiting, attemptKey]);
  return waiting && slowFor === attemptKey;
}

/** 某个播放状态需要显示的全局提示，没有则为空。 */
export function playerNotice({
  phase,
  connectingTitle,
  failedBody,
  pausedBody,
  unreachable,
  slow,
}: {
  phase: PlaybackSnapshot["phase"];
  connectingTitle: string | null;
  failedBody: string;
  pausedBody: string;
  unreachable: boolean;
  slow: boolean;
}): string | null {
  if (phase === "timeout" || phase === "error")
    return [
      descriptions[phase].title,
      failedBody,
      unreachable ? "上次检测也打不开" : "",
    ]
      .filter(Boolean)
      .join("，");
  if (phase === "offline" || phase === "ended" || phase === "blocked")
    return descriptions[phase].title;
  if (phase === "paused") return pausedBody || null;
  if (slow) return "加载较慢";
  if (phase === "checking" || phase === "connecting") return connectingTitle;
  return null;
}

/** 每条新提示只显示一次，并通过应用的全局提示呈现。 */
export function usePlayerNotices(notice: string | null, attemptKey: unknown) {
  useEffect(() => {
    if (notice) showToast(notice);
  }, [notice, attemptKey]);
}

const statusStyles = StyleSheet.create({
  dotsPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: 50,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#04080A66",
  },
  dot: { width: 5.5, height: 5.5, borderRadius: 3 },
  dotStill: { opacity: 0.7 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#F1F5F552",
  },
  chipText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  prompt: { alignItems: "center", gap: 14, paddingHorizontal: 16 },
  promptText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  checkBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#F1F5F5B3",
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: colors.accent, borderColor: colors.accent },
  // 勾选标记：小方框的两条边，旋转 45°。
  checkMark: {
    width: 5,
    height: 9,
    marginTop: -2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.ink,
    transform: [{ rotate: "45deg" }],
  },
  checkText: { color: "#F1F5F5BF", fontSize: 12, lineHeight: 18 },
});
