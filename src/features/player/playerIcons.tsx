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

/** 带声波的扬声器；静音时显示划线扬声器。 */
export function VolumeIcon({
  muted,
  size = 22,
  color = colors.text,
}: IconProps & { muted: boolean }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <View
        style={{
          position: "absolute",
          left: 0,
          top: size * 0.35,
          width: size * 0.26,
          height: size * 0.3,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.15,
          top: size * 0.15,
          borderTopWidth: size * 0.35,
          borderBottomWidth: size * 0.35,
          borderRightWidth: size * 0.35,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
          borderRightColor: color,
        }}
      />
      {muted
        ? ["45deg", "-45deg"].map((rotate) => (
            <View
              key={rotate}
              style={{
                position: "absolute",
                left: size * 0.59,
                top: size * 0.46,
                width: size * 0.42,
                height: 2,
                backgroundColor: color,
                transform: [{ rotate }],
              }}
            />
          ))
        : [0.22, 0.38].map((radius) => (
            <View
              key={radius}
              style={{
                position: "absolute",
                left: size * (0.5 - radius),
                top: size * (0.5 - radius),
                width: size * radius * 2,
                height: size * radius * 2,
                borderRadius: size,
                borderWidth: 2,
                borderRightColor: color,
                borderTopColor: "transparent",
                borderBottomColor: "transparent",
                borderLeftColor: "transparent",
              }}
            />
          ))}
    </View>
  );
}

export function PictureInPictureIcon({
  size = 22,
  color = colors.text,
}: IconProps) {
  return (
    <View
      pointerEvents="none"
      style={{
        width: size,
        height: size * 0.75,
        borderWidth: 2,
        borderColor: color,
      }}
    >
      <View
        style={{
          position: "absolute",
          right: 1,
          bottom: 1,
          width: size * 0.4,
          height: size * 0.3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** 返回：简单的 "<" 箭头，用于竖屏收起和退出全屏。 */
export function ChevronLeftIcon({ size = 22, color = colors.text }: IconProps) {
  const arm = size * 0.42;
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      pointerEvents="none"
    >
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

/** 四个角标；向内模式会将各角标转向中心。 */
function CornerBrackets({
  size,
  color,
  inward,
}: Required<IconProps> & { inward: boolean }) {
  const corner = size * 0.32;
  const edge = { width: corner, height: corner, borderColor: color };
  const corners = [
    { vertical: "top", horizontal: "left" },
    { vertical: "top", horizontal: "right" },
    { vertical: "bottom", horizontal: "left" },
    { vertical: "bottom", horizontal: "right" },
  ] as const;
  const opposite = {
    top: "Bottom",
    bottom: "Top",
    left: "Right",
    right: "Left",
  } as const;
  const capital = {
    top: "Top",
    bottom: "Bottom",
    left: "Left",
    right: "Right",
  } as const;
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      pointerEvents="none"
    >
      {corners.map(({ vertical, horizontal }) => {
        const borderVertical = inward ? opposite[vertical] : capital[vertical];
        const borderHorizontal = inward
          ? opposite[horizontal]
          : capital[horizontal];
        return (
          <View
            key={`${vertical}-${horizontal}`}
            style={[
              styles.corner,
              edge,
              {
                [vertical]: 1,
                [horizontal]: 1,
                [`border${borderVertical}Width`]: 2.5,
                [`border${borderHorizontal}Width`]: 2.5,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** 进入全屏：四个朝外的角标，位于竖屏画面右下角。 */
export function FullscreenIcon({ size = 22, color = colors.text }: IconProps) {
  return <CornerBrackets size={size} color={color} inward={false} />;
}

/** 退出全屏：使用朝内的同款角标，位于全屏底栏。 */
export function ExitFullscreenIcon({
  size = 22,
  color = colors.text,
}: IconProps) {
  return <CornerBrackets size={size} color={color} inward />;
}

/** 关闭面板：两条交叉线；weight 参数可让小尺寸图标的线条更细。 */
export function CloseIcon({
  size = 20,
  color = colors.text,
  weight = 2.5,
}: IconProps & { weight?: number }) {
  const bar = {
    position: "absolute" as const,
    width: size * 0.7,
    height: weight,
    borderRadius: 2,
    backgroundColor: color,
  };
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      pointerEvents="none"
    >
      <View style={[bar, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[bar, { transform: [{ rotate: "-45deg" }] }]} />
    </View>
  );
}

/** 把列表定位到当前播放频道：带中心圆点的圆环。 */
export function LocateIcon({ size = 20, color = colors.text }: IconProps) {
  const ring = size * 0.7;
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      pointerEvents="none"
    >
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
      style={[styles.box, { width: size, height: size, gap: size * 0.18 }]}
      pointerEvents="none"
    >
      <View style={bar} />
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}

/** 播放：实心三角形略向右移，使视觉上居中。 */
export function PlayIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      pointerEvents="none"
    >
      <View
        style={{
          marginLeft: size * 0.12,
          borderLeftWidth: size * 0.6,
          borderTopWidth: size * 0.35,
          borderBottomWidth: size * 0.35,
          borderLeftColor: color,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
        }}
      />
    </View>
  );
}

/** 暂停图标：两根竖线。 */
export function PauseIcon({ size = 22, color = colors.text }: IconProps) {
  const bar = {
    width: size * 0.18,
    height: size * 0.68,
    borderRadius: 1.5,
    backgroundColor: color,
  };
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, flexDirection: "row", gap: size * 0.18 },
      ]}
      pointerEvents="none"
    >
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}

/**
 * 重试图标：右上方留缺口的圆环，十二点方向的末端
 * 带一个顺时针方向的小箭头。
 */
export function RefreshIcon({ size = 16, color = colors.text }: IconProps) {
  const ring = size * 0.78;
  const head = size * 0.2;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View
        style={{
          position: "absolute",
          left: (size - ring) / 2,
          top: (size - ring) / 2,
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: 2,
          borderColor: color,
          borderTopColor: "transparent",
          transform: [{ rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size / 2 - head * 0.2,
          top: (size - ring) / 2 - head * 0.6 + 1,
          borderLeftWidth: head,
          borderTopWidth: head * 0.6,
          borderBottomWidth: head * 0.6,
          borderLeftColor: color,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
        }}
      />
    </View>
  );
}

/** 只听声音图标：头梁弧线及两端的耳罩。 */
export function HeadphonesIcon({ size = 22, color = colors.text }: IconProps) {
  const band = size * 0.74;
  const cup = { width: size * 0.2, height: size * 0.32, top: size * 0.56 };
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View
        style={{
          position: "absolute",
          left: (size - band) / 2,
          top: size * 0.14,
          width: band,
          height: band * 0.62,
          borderTopLeftRadius: band / 2,
          borderTopRightRadius: band / 2,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
      <View
        style={[
          styles.cup,
          cup,
          { left: (size - band) / 2 - 1, backgroundColor: color },
        ]}
      />
      <View
        style={[
          styles.cup,
          cup,
          { right: (size - band) / 2 - 1, backgroundColor: color },
        ]}
      />
    </View>
  );
}

/** 恢复看画面：短支架上的屏幕轮廓。 */
export function ScreenIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <View
      style={[styles.box, { width: size, height: size, gap: size * 0.1 }]}
      pointerEvents="none"
    >
      <View
        style={{
          width: size * 0.84,
          height: size * 0.56,
          borderRadius: 3,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.36,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute" },
  cup: { position: "absolute", borderRadius: 2 },
});
