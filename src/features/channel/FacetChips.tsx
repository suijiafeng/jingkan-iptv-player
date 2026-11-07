import { t } from "../../i18n/core";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, sizes } from "../../theme";

/** 在搜索行末放一个图标，替代常驻的“国家/地区 全部 ▾ 语言 全部 ▾”一整行；只有用户需要时才展开菜单。 */
export function FacetToggle({
  open,
  active,
  onPress,
}: {
  open: boolean;
  /** 有条件生效时，仅用小圆点提示。 */
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        active ? t("筛选，已启用条件") : t("按国家/地区或语言筛选")
      }
      accessibilityState={{ expanded: open, selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        chipStyles.toggle,
        open && chipStyles.toggleOn,
        pressed && { opacity: 0.7 },
      ]}
    >
      {/* 三条逐渐缩短的横线，即常见的“筛选”图形。 */}
      <View style={chipStyles.glyph}>
        <View style={[chipStyles.bar, { width: 16 }]} />
        <View style={[chipStyles.bar, { width: 11 }]} />
        <View style={[chipStyles.bar, { width: 6 }]} />
      </View>
      {active && (
        <View
          accessible={false}
          testID="active-filter-indicator"
          style={chipStyles.activeDot}
        />
      )}
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  toggle: {
    width: sizes.field,
    height: sizes.field,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.raised,
  },
  toggleOn: { backgroundColor: colors.accentSoft },
  glyph: { gap: 3, alignItems: "center" },
  bar: { height: 2, borderRadius: 1, backgroundColor: colors.accent },
  activeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
});
