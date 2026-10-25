import { useEffect, useRef, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import * as Brightness from "expo-brightness";
import { TAP_SLOP_DP } from "./playerShared";

/** 全屏拖动达到此垂直距离（dp）后，才视为调节操作。 */
export const ADJUST_START_DP = 10;
/** 沿画面高度的这一比例拖动，即可覆盖完整的 0–1 调节范围。 */
const FULL_RANGE_SHARE = 0.8;

export type AdjustKind = "brightness" | "volume";

/** 左半边调整亮度，右半边调整音量。 */
export const adjustKindAt = (offset: number, width: number): AdjustKind =>
  offset < width / 2 ? "brightness" : "volume";

/** 从 startLevel 开始拖动 dy 后的数值，向下为正方向。 */
export const levelAfterDrag = (
  startLevel: number,
  dy: number,
  height: number,
) =>
  Math.min(
    1,
    Math.max(0, startLevel - dy / Math.max(1, height * FULL_RANGE_SHARE)),
  );

export const adjustLabel = (kind: AdjustKind, level: number) =>
  `${kind === "brightness" ? "亮度" : "音量"} ${Math.round(level * 100)}%`;

// 首次在全屏修改亮度前的屏幕亮度，退出时恢复。
let savedBrightness: number | null = null;

/** 当前屏幕亮度，并为 restoreBrightness 记住原值。 */
export async function startBrightness(): Promise<number> {
  const level = await Brightness.getBrightnessAsync();
  if (savedBrightness === null) savedBrightness = level;
  return level;
}

export function setBrightness(level: number) {
  void Brightness.setBrightnessAsync(level).catch(() => {});
}

/** 恢复进入全屏前的亮度；没有改动时不执行操作。 */
export function restoreBrightness() {
  const level = savedBrightness;
  savedBrightness = null;
  if (level !== null) setBrightness(level);
}

/** 手指抬起后，调节值在屏幕上保留的时间。 */
const LABEL_MS = 800;

interface Drag {
  x: number;
  y: number;
  /** 拖动在画面中的起始位置，用于确定操作哪一侧。 */
  localX: number;
  kind: AdjustKind | null;
  /** 异步读取亮度后得到的手势起始值。 */
  start: number | null;
}

/** 画面触摸处理：轻触切换覆盖控件；全屏时在左半边上下拖动调节亮度，右半边调节音量。 */
export function useEdgeAdjust({
  fullscreen,
  volume,
  onVolumeChange,
  onTap,
}: {
  fullscreen: boolean;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onTap: () => void;
}) {
  const drag = useRef<Drag | null>(null);
  const size = useRef({ width: 1, height: 1 });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const finish = (tapAllowed: boolean, event?: GestureResponderEvent) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.kind) {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setLabel(null), LABEL_MS);
      return;
    }
    if (!tapAllowed || !event) return;
    const dx = event.nativeEvent.pageX - current.x;
    const dy = event.nativeEvent.pageY - current.y;
    if (Math.abs(dx) < TAP_SLOP_DP && Math.abs(dy) < TAP_SLOP_DP) onTap();
  };

  const handlers = {
    onLayout: ({ nativeEvent }: LayoutChangeEvent) => {
      size.current = nativeEvent.layout;
    },
    onStartShouldSetResponder: () => true,
    // 调整进行期间持续持有当前触摸。
    onResponderTerminationRequest: () => !drag.current?.kind,
    onResponderGrant: ({ nativeEvent }: GestureResponderEvent) => {
      drag.current = {
        x: nativeEvent.pageX,
        y: nativeEvent.pageY,
        localX: nativeEvent.locationX,
        kind: null,
        start: null,
      };
    },
    onResponderMove: ({ nativeEvent }: GestureResponderEvent) => {
      const current = drag.current;
      if (!current || !fullscreen) return;
      const dx = nativeEvent.pageX - current.x;
      const dy = nativeEvent.pageY - current.y;
      if (!current.kind) {
        if (Math.abs(dy) < ADJUST_START_DP || Math.abs(dy) <= Math.abs(dx))
          return;
        current.kind = adjustKindAt(current.localX, size.current.width);
        if (current.kind === "volume") current.start = volume;
        else
          startBrightness()
            .then((level) => {
              current.start = level;
            })
            .catch(() => {});
      }
      if (current.start === null) return;
      const level = levelAfterDrag(current.start, dy, size.current.height);
      if (current.kind === "volume") onVolumeChange(level);
      else setBrightness(level);
      clearTimeout(hideTimer.current);
      setLabel(adjustLabel(current.kind, level));
    },
    onResponderRelease: (event: GestureResponderEvent) => finish(true, event),
    onResponderTerminate: () => finish(false),
  };
  return { handlers, label };
}
