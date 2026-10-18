import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../../theme";

/**
 * 播放器图形由普通 View 的边框和角落绘制，各设备上的外观一致，
 * 无须图标字体或 SVG 依赖。
 */
interface IconProps {
  size?: number;
  color?: string;
}

/** 返回：简单的 "<" 箭头，用于竖屏收起和退出全屏。 */
export function ChevronLeftIcon({ size = 22, color = colors.text }: IconProps) {
  const arm = size * 0.42;
  return (
    <View style={[s.box, { width: size, height: size }]} pointerEvents="none">
      <View
        style={{
          width: arm,
          height: arm,
          marginLeft: arm * 0.45,
          borderLeftWidth: 2.5,
          borderBottomWidth: 2.5,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}

/** 进入全屏：四个朝外的角标，位于竖屏画面右下角。 */
export function FullscreenIcon({ size = 22, color = colors.text }: IconProps) {
  const corner = size * 0.32;
  const edge = { width: corner, height: corner, borderColor: color };
  return (
    <View style={[s.box, { width: size, height: size }]} pointerEvents="none">
      <View
        style={[
          s.corner,
          edge,
          { top: 1, left: 1, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
        ]}
      />
      <View
        style={[
          s.corner,
          edge,
          { top: 1, right: 1, borderTopWidth: 2.5, borderRightWidth: 2.5 },
        ]}
      />
      <View
        style={[
          s.corner,
          edge,
          { bottom: 1, left: 1, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
        ]}
      />
      <View
        style={[
          s.corner,
          edge,
          {
            bottom: 1,
            right: 1,
            borderBottomWidth: 2.5,
            borderRightWidth: 2.5,
          },
        ]}
      />
    </View>
  );
}

/** 关闭面板：两条交叉的线。 */
export function CloseIcon({ size = 20, color = colors.text }: IconProps) {
  const bar = {
    position: "absolute" as const,
    width: size * 0.7,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: color,
  };
  return (
    <View style={[s.box, { width: size, height: size }]} pointerEvents="none">
      <View style={[bar, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[bar, { transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

/** 把列表定位到当前播放频道：带中心圆点的圆环。 */
export function LocateIcon({ size = 20, color = colors.text }: IconProps) {
  const ring = size * 0.7;
  return (
    <View style={[s.box, { width: size, height: size }]} pointerEvents="none">
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.22,
          height: size * 0.22,
          borderRadius: size,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** 打开频道列表的三横线图标。 */
export function MenuIcon({ size = 20, color = colors.text }: IconProps) {
  const bar = {
    width: size * 0.75,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: color,
  };
  return (
    <View
      style={[s.box, { width: size, height: size, gap: size * 0.18 }]}
      pointerEvents="none"
    >
      <View style={bar} />
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}

const s = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute" },
});
