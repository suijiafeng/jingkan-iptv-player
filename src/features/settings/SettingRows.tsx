import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, sizes, styles, type } from "../../theme";

/** 分组卡片上方的说明标题。 */
export function SettingSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={rowStyles.section}>
      <Text style={[styles.caption, rowStyles.sectionLabel]}>{label}</Text>
      <View style={rowStyles.card}>
        {rows.map((row, index) => (
          <React.Fragment key={index}>
            {index > 0 && <View style={rowStyles.divider} />}
            {row}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** 单行布局：标题可带状态标签，下方放说明，末尾放开关、文字操作或箭头。提供 onPress 时，整行均可点击。 */
export function SettingRow({
  title,
  caption,
  status,
  trailing,
  onPress,
  accessibilityLabel,
  danger = false,
  dimmed = false,
}: {
  title: string;
  caption?: string;
  status?: { label: string; tone: "accent" | "muted" | "warn" };
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** 破坏性操作行，标题使用错误色。 */
  danger?: boolean;
  /** 当前不适用时淡化显示，与禁用的开关一致。 */
  dimmed?: boolean;
}) {
  const body = (
    <>
      <View style={rowStyles.text}>
        <View style={rowStyles.titleLine}>
          <Text style={[styles.body, danger && rowStyles.dangerTitle]}>
            {title}
          </Text>
          {status && (
            <Text style={[rowStyles.pill, rowStyles[`pill_${status.tone}`]]}>
              {status.label}
            </Text>
          )}
        </View>
        {caption && <Text style={styles.caption}>{caption}</Text>}
      </View>
      {trailing}
    </>
  );
  if (!onPress)
    return (
      <View style={[rowStyles.row, dimmed && rowStyles.dimmed]}>{body}</View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [rowStyles.row, pressed && rowStyles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/**
 * 行尾的次要操作，例如“撤销”：沿用旁边紧凑按钮的胶囊形状，
 * 使用填充背景，让它在卡片上明确呈现为按钮。
 */
export function RowAction({
  label,
  onPress,
  danger = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [rowStyles.action, pressed && rowStyles.pressed]}
    >
      <Text style={[rowStyles.actionText, danger && rowStyles.dangerTitle]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chevron() {
  return (
    <Text accessible={false} style={rowStyles.chevron}>
      ›
    </Text>
  );
}

const rowStyles = StyleSheet.create({
  section: { gap: 6 },
  sectionLabel: { paddingHorizontal: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 12,
  },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.4 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  dangerTitle: { color: colors.bad },
  pill: {
    ...type.caption,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: "hidden",
  },
  pill_accent: { color: colors.ink, backgroundColor: colors.accent },
  pill_muted: { color: colors.muted, backgroundColor: colors.raised },
  pill_warn: { color: colors.ink, backgroundColor: colors.warn },
  action: {
    minHeight: sizes.chip,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionText: { ...type.chip, color: colors.accent },
  chevron: { ...type.heading, color: colors.muted, paddingHorizontal: 4 },
});
