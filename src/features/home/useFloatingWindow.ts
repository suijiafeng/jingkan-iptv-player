import { useEffect, useState } from "react";
import {
  Animated,
  PanResponder,
  useWindowDimensions,
  type GestureResponderEvent,
  type NativeTouchEvent,
} from "react-native";

/** 尚未缩放时，停靠画面的宽度。 */
export const MINI_DEFAULT_WIDTH = 176;
/** 最小宽度；再窄就难以看清画面。 */
export const MINI_MIN_WIDTH = 144;
/** 屏幕左右两侧以及顶部安全区上方所保留的边距。 */
export const MINI_EDGE = 12;
/** 超过此移动距离后，将触摸视为拖动而非点击。 */
const DRAG_SLOP = 6;

export type FloatingSide = "left" | "right";

export interface Offset {
  x: number;
  y: number;
}

export interface FloatingGeometry {
  width: number;
  screenWidth: number;
  /** 从小窗默认底边到顶部外边距的可用高度。 */
  room: number;
}

/** 窗口仅包含 16:9 的画面。 */
export function pictureHeight(width: number) {
  return Math.round((width * 9) / 16);
}

/** 保持宽度清晰可读、不超出屏幕，并位于顶部留白以下。 */
export function clampWidth(
  width: number,
  limits: { screenWidth: number; maxHeight: number },
) {
  const widest = Math.min(
    limits.screenWidth - 2 * MINI_EDGE,
    (limits.maxHeight * 16) / 9,
  );
  return Math.round(Math.max(MINI_MIN_WIDTH, Math.min(width, widest)));
}

/**
 * 拖动缩放边缘时的宽度：边缘包括顶部及朝向屏幕内部的一侧；
 * 向内或向上拖动会放大。
 */
export function resizedWidth(
  start: number,
  drag: { dx: number; dy: number },
  side: FloatingSide,
) {
  const inward = side === "right" ? -drag.dx : drag.dx;
  const upward = (-drag.dy * 16) / 9;
  return start + (Math.abs(inward) >= Math.abs(upward) ? inward : upward);
}

/** 使窗口停靠在左侧边距处的 x 偏移量。 */
function leftX(geometry: FloatingGeometry) {
  return -(geometry.screenWidth - 2 * MINI_EDGE - geometry.width);
}

/**
 * 释放后的浮窗停靠位置。偏移相对于右下角的初始位置：
 * x 吸附到更近的一侧，y 保持在初始位置与顶部之间。
 */
export function settle(offset: Offset, geometry: FloatingGeometry): Offset {
  const left = leftX(geometry);
  const maxUp = geometry.room - pictureHeight(geometry.width);
  return {
    x: offset.x < left / 2 ? left : 0,
    // 上方没有空间（屏幕较矮）时，保持默认位置。
    y: maxUp > 0 ? Math.min(0, Math.max(-maxUp, offset.y)) : 0,
  };
}

function spread(touches: readonly NativeTouchEvent[]) {
  const [first, second] = touches;
  return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
}

/** 手势的可变状态保存在每个窗口只创建一次的对象中；响应器从该对象读取最新几何信息，而非读取 React 状态。 */
function createFloatingGesture(
  onWidth: (width: number) => void,
  onSide: (side: FloatingSide) => void,
) {
  const offset = new Animated.ValueXY();
  const geometry: FloatingGeometry = {
    width: MINI_DEFAULT_WIDTH,
    screenWidth: 0,
    room: 0,
  };
  let resting: Offset = { x: 0, y: 0 };
  let side: FloatingSide = "right";
  // 当前触摸的操作：移动、从边缘缩放或双指缩放。
  let mode: "move" | "edge" | "pinch" = "move";
  let start = { width: geometry.width, spread: 0 };
  let moved: Offset | null = null;

  /** 放大或缩小；位于左侧时保持左边缘位置不变。 */
  const resize = (raw: number) => {
    const width = clampWidth(raw, {
      screenWidth: geometry.screenWidth,
      maxHeight: geometry.room + resting.y,
    });
    moved = {
      x: side === "left" ? resting.x + (width - start.width) : resting.x,
      y: resting.y,
    };
    geometry.width = width;
    offset.setValue(moved);
    onWidth(width);
  };
  const release = () => {
    resting = settle(moved ?? resting, geometry);
    side = resting.x < 0 ? "left" : "right";
    onSide(side);
    mode = "move";
    moved = null;
    Animated.spring(offset, {
      toValue: resting,
      useNativeDriver: false,
    }).start();
  };
  const responder = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      gesture.numberActiveTouches >= 2 ||
      Math.abs(gesture.dx) > DRAG_SLOP ||
      Math.abs(gesture.dy) > DRAG_SLOP,
    onPanResponderGrant: () => {
      moved = null;
      start = { width: geometry.width, spread: 0 };
    },
    onPanResponderMove: (event: GestureResponderEvent, gesture) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        if (mode !== "pinch") {
          mode = "pinch";
          start = { width: geometry.width, spread: spread(touches) };
          return;
        }
        resize((start.width * spread(touches)) / start.spread);
        return;
      }
      if (mode === "edge") {
        resize(resizedWidth(start.width, gesture, side));
        return;
      }
      // 双指缩放时抬起一根手指，不能使窗口跳动。
      if (mode === "pinch") return;
      moved = { x: resting.x + gesture.dx, y: resting.y + gesture.dy };
      offset.setValue(moved);
    },
    onPanResponderRelease: release,
    onPanResponderTerminate: release,
  });
  return {
    /** 屏幕宽度和纵向可用空间，变化时更新。 */
    measure(screenWidth: number, room: number) {
      geometry.screenWidth = screenWidth;
      geometry.room = room;
    },
    /** 触点落在缩放边缘上，此次手势用于缩放。 */
    edge() {
      mode = "edge";
    },
    /** 轻触边缘但没有移动时，下一次触摸恢复为移动窗口。 */
    edgeEnd() {
      if (!moved) mode = "move";
    },
    transform: offset.getTranslateTransform(),
    panHandlers: responder.panHandlers,
  };
}

/**
 * 以浮窗呈现的停靠播放器：单指拖动，释放时吸附到更近的一侧；
 * 拖动顶部、朝内侧边缘或双指操作可缩放。只有发生移动后才接管手势，
 * 因此点击仍会传给内部按钮。位置和尺寸只在本次会话中有效，不持久保存。
 */
export function useFloatingWindow({
  bottomOffset,
  topInset,
}: {
  /** 从屏幕底部到小窗默认位置的距离。 */
  bottomOffset: number;
  topInset: number;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [width, setWidth] = useState(MINI_DEFAULT_WIDTH);
  const [side, setSide] = useState<FloatingSide>("right");
  const [gesture] = useState(() => createFloatingGesture(setWidth, setSide));
  useEffect(() => {
    gesture.measure(
      screenWidth,
      screenHeight - bottomOffset - topInset - MINI_EDGE,
    );
  }, [gesture, screenWidth, screenHeight, bottomOffset, topInset]);
  return {
    width,
    height: pictureHeight(width),
    side,
    onEdgeTouch: gesture.edge,
    onEdgeTouchEnd: gesture.edgeEnd,
    transform: gesture.transform,
    panHandlers: gesture.panHandlers,
  };
}
