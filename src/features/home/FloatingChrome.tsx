import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CloseIcon } from "../player/playerIcons";
import type { FloatingSide } from "./useFloatingWindow";

/** 窗口边缘用于缩放的隐形条带宽度。 */
const EDGE_GRAB = 14;

/**
 * 浮窗画面上自己的控件。✕ 轻淡地放在靠屏幕边缘的顶部角落，
 * 触控区域为 40dp。拖动顶部边缘或朝向屏幕内部的侧边可缩放，
 * 边缘不绘制标记，让画面保持干净。贴屏幕的两条边不处理，
 * 因为难以抓取，也容易与系统边缘手势冲突。
 */
export function FloatingChrome({
  side,
  onClose,
  onEdgeTouch,
  onEdgeTouchEnd,
}: {
  side: FloatingSide;
  onClose: () => void;
  onEdgeTouch: () => void;
  onEdgeTouchEnd: () => void;
}) {
  const outer = side === "right" ? styles.right : styles.left;
  const inner = side === "right" ? styles.left : styles.right;
  // 边缘条仅用于拖动缩放；TalkBack 不执行缩放，因此跳过这些条。
  const edge = {
    importantForAccessibility: "no-hide-descendants" as const,
    accessibilityElementsHidden: true,
    onTouchStart: onEdgeTouch,
    onTouchEnd: onEdgeTouchEnd,
    onTouchCancel: onEdgeTouchEnd,
  };
  return (
    <>
      <View testID="floating-resize-top" style={styles.topEdge} {...edge} />
      <View style={[styles.sideEdge, inner]} {...edge} />
      <Pressable
        style={[styles.closeKey, outer]}
        accessibilityRole="button"
        accessibilityLabel="停止播放"
        onPress={onClose}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.closeDisc,
              side === "right" ? styles.discRight : styles.discLeft,
              pressed && styles.closePressed,
            ]}
          >
            <CloseIcon size={12} weight={1.5} color="#F1F5F5B3" />
          </View>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: EDGE_GRAB,
  },
  sideEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: EDGE_GRAB,
  },
  left: { left: 0 },
  right: { right: 0 },
  closeKey: { position: "absolute", top: 0, width: 40, height: 40 },
  // 靠近角落并保持低对比，既可找到，也不过多遮挡画面。
  closeDisc: {
    position: "absolute",
    top: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#0B111566",
    alignItems: "center",
    justifyContent: "center",
  },
  discRight: { right: 5 },
  discLeft: { left: 5 },
  closePressed: { backgroundColor: "#0B1115CC" },
});
