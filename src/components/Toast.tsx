import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "../theme";

/** 单条提示在屏幕上的停留时长。 */
export const TOAST_MS = 3000;

interface ToastState {
  id: number;
  text: string;
}

let current: ToastState | null = null;
let lastId = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => current;

/**
 * 应用唯一的提示：在屏幕顶部显示约 3 秒的简短文字。
 * 新提示替换当前提示，不进行排队。
 */
export function showToast(text: string) {
  if (timer !== null) clearTimeout(timer);
  current = { id: ++lastId, text };
  timer = setTimeout(hideToast, TOAST_MS);
  emit();
}

export function hideToast() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (current === null) return;
  current = null;
  emit();
}

/** 当前屏幕上的提示文字，没有提示时为 null。 */
export const currentToast = () => current?.text ?? null;

/** 在应用根视图的所有内容之上绘制提示，但不覆盖系统对话框或模态页。提示不接收触摸；每条新提示只向读屏用户播报一次。 */
export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
    AccessibilityInfo.announceForAccessibility(toast.text);
  }, [toast, opacity]);
  if (!toast) return null;
  return (
    <View
      testID="global-toast-host"
      pointerEvents="none"
      style={[
        toastStyles.host,
        { top: insets.top + 12, left: insets.left, right: insets.right },
      ]}
    >
      <Animated.View
        testID="global-toast"
        importantForAccessibility="no-hide-descendants"
        style={[toastStyles.toast, { opacity }]}
      >
        <Text style={toastStyles.text} numberOfLines={2}>
          {toast.text}
        </Text>
      </Animated.View>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  // 避开状态栏下方 40dp 的角落按钮（返回、画中画），
  // 位于状态栏下方；较长的提示改为换行显示。
  host: { position: "absolute", alignItems: "center", paddingHorizontal: 56 },
  toast: {
    minHeight: 36,
    maxWidth: 360,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    justifyContent: "center",
    backgroundColor: colors.raised,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { ...type.chip, fontWeight: "400", color: colors.text },
});
