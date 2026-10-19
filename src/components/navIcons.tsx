import React from "react";
import { StyleSheet, Text, View } from "react-native";

/** 底部导航图标与播放器图标一样使用普通 View 绘制（见 playerIcons.tsx），不需要图标字体或 SVG 依赖。 */
interface NavIconProps {
  color: string;
  /** 选中标签时，在更易识别的图形上使用填充样式，例如星标。 */
  filled?: boolean;
  size?: number;
}

/** 频道图标：带短支架的屏幕。 */
export function TvIcon({ color, size = 22 }: NavIconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.9,
          height: size * 0.62,
          borderRadius: 3,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.4,
          height: 2,
          marginTop: 2,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** 收藏：沿用频道行中的星形。 */
export function StarIcon({ color, filled = false, size = 22 }: NavIconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Text
        allowFontScaling={false}
        style={{ color, fontSize: size, lineHeight: size + 2 }}
      >
        {filled ? "★" : "☆"}
      </Text>
    </View>
  );
}

/** 最近：带两根指针的钟面。 */
export function ClockIcon({ color, size = 22 }: NavIconProps) {
  const face = size * 0.86;
  const hand = { position: "absolute" as const, backgroundColor: color };
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: face,
          height: face,
          borderRadius: face / 2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      {/* 时针从中心竖直向上，分针向右。 */}
      <View
        style={[
          hand,
          {
            width: 2,
            height: face * 0.3,
            left: size / 2 - 1,
            top: size / 2 - face * 0.3,
          },
        ]}
      />
      <View
        style={[
          hand,
          {
            width: face * 0.26,
            height: 2,
            left: size / 2 - 1,
            top: size / 2 - 1,
          },
        ]}
      />
    </View>
  );
}

/** 设置：三条滑轨，实心旋钮分别位于不同位置。 */
export function SlidersIcon({ color, size = 22 }: NavIconProps) {
  const knob = size * 0.26;
  return (
    <View style={[styles.box, { width: size, height: size, gap: size * 0.1 }]}>
      {[0.2, 0.62, 0.38].map((position) => (
        <View key={position} style={[styles.box, { width: size * 0.9 }]}>
          <View
            style={{
              width: "100%",
              height: 2,
              borderRadius: 1,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: size * 0.9 * position - knob / 2,
              width: knob,
              height: knob,
              borderRadius: knob / 2,
              backgroundColor: color,
            }}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});
