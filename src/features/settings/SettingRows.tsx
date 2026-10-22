import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { colors, sizes, styles, type } from "../../theme";

/** 分组卡片上方的说明标题。 */
export function SettingSection({
  label,
  children,
}: {
  /** 上方已有内容说明卡片用途时，省略此项。 */
  label?: string;
  children: React.ReactNode;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={rowStyles.section}>
      {!!label && (
        <Text style={[styles.caption, rowStyles.sectionLabel]}>{label}</Text>
      )}
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

/**
 * 一行设置：标题可附状态标签，下方仅在有必要时显示说明，
 * 可选当前值，末尾是开关、文字操作或箭头。
 * 提供 onPress 时，整行都可以点击。
 */
export function SettingRow({
  title,
  caption,
  status,
  value,
  trailing,
  onPress,
  accessibilityLabel,
  danger = false,
  dimmed = false,
  warn = false,
}: {
  title: string;
  caption?: string;
  status?: { label: string; tone: "accent" | "muted" | "warn" };
  /** 当前值以弱化颜色显示在末尾控件之前，例如“2 份”。 */
  value?: string;
  /** 警告色说明：存在需要用户处理的事项。 */
  warn?: boolean;
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** 破坏性操作行，标题使用错误色。 */
  danger?: boolean;
  /** 当前不适用时淡化显示，与禁用的开关一致。 */
  dimmed?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  // 控件占据大半行时，仍保持标题和状态可读。
  const stacked = width / Math.max(1, fontScale) < 340;
  const body = (
    <>
      <View style={[rowStyles.text, stacked && rowStyles.stackedText]}>
        <View style={rowStyles.titleLine}>
          <Text
            style={[
              styles.body,
              rowStyles.title,
              danger && rowStyles.dangerTitle,
            ]}
          >
            {title}
          </Text>
          {status && (
            <Text style={[rowStyles.pill, rowStyles[`pill_${status.tone}`]]}>
              {status.label}
            </Text>
          )}
        </View>
        {caption && (
          <Text style={[styles.caption, warn && rowStyles.warnCaption]}>
            {caption}
          </Text>
        )}
      </View>
      {(value || trailing) && (
        <View
          style={[rowStyles.controls, stacked && rowStyles.stackedControls]}
        >
          {value && <Text style={rowStyles.value}>{value}</Text>}
          {trailing && <View style={rowStyles.trailing}>{trailing}</View>}
        </View>
      )}
    </>
  );
  if (!onPress)
    return (
      <View
        style={[
          rowStyles.row,
          stacked && rowStyles.stackedRow,
          dimmed && rowStyles.dimmed,
        ]}
      >
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.row,
        stacked && rowStyles.stackedRow,
        pressed && rowStyles.pressed,
      ]}
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
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        rowStyles.action,
        disabled && rowStyles.dimmed,
        pressed && rowStyles.pressed,
      ]}
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
  stackedRow: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  stackedText: { flex: 0 },
  titleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  title: { flexShrink: 1 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
  },
  trailing: { maxWidth: "100%", flexShrink: 1 },
  stackedControls: {
    alignSelf: "flex-end",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    maxWidth: "100%",
  },
  dangerTitle: { color: colors.bad },
  warnCaption: { color: colors.warn },
  value: { ...type.body, color: colors.muted, flexShrink: 1 },
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
