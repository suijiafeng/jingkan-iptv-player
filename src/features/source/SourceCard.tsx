import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { daysAgo } from "../../domain/timeAgo";
import type { Source } from "../../domain/types";
import { colors, sizes, styles, type } from "../../theme";
import type { CheckProgress, CheckSummary } from "./availability";

interface Props {
  source: Source;
  /** 当前可能运行的唯一一次批量检测，不论属于哪个来源。 */
  check: CheckProgress | null;
  summary?: CheckSummary;
  saving: boolean;
  onRename: (source: Source) => void;
  onRemove: (source: Source) => void;
  onEnabledChange: (source: Source, enabled: boolean) => void;
  onCheck: (source: Source, force?: boolean) => void;
  onStopCheck: () => void;
}

/**
 * 来源管理中的一张卡片：首行左侧是名称，右侧是频道数和更新时间；
 * 只有需要注意时才额外显示一行警告色文字。底部一行容纳全部操作：
 * 左侧是“检测”“编辑”（名称和链接）以及错误色的“删除”，
 * 最右侧是启用开关。
 */
export function SourceCard({
  source,
  check,
  summary,
  saving,
  ...props
}: Props) {
  // 按天显示即可，使用管理页打开时的时间已足够精确。
  const [now] = useState(() => Date.now());
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / Math.max(1, fontScale) < 340;
  const running = check?.sourceId === source.id;
  const checked = !!summary || typeof source.lastCheckedAt === "number";
  const unreachable = summary ? summary.unreachable : source.unreachableCount;
  // 按列表的显示方式统计频道；只有当某些
  // 其中部分地址无法连接。
  const meta = [
    `${source.channelCount} 个频道`,
    updatedAgo(source.lastSuccessAt, now),
  ]
    .filter(Boolean)
    .join(" · ");
  // 来源停用时仍保留该部分，并与其他内容一起变淡，避免切换
  // 切换开关绝不改变卡片高度。
  const attention = [
    // 检测按地址执行，不按频道执行。
    checked && unreachable > 0 ? `${unreachable} 个地址暂时无法连接` : "",
    summary?.stopped ? "测试已停止" : "",
    source.lastErrorCategory ? "上次刷新未完成，旧频道已保留" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.head}>
        <View style={[cardStyles.text, !source.enabled && cardStyles.dimmed]}>
          {/* 字体较大时，名称单独占一行，不要把几乎全部空间
              都让给频道数量。 */}
          <View
            style={[cardStyles.titleLine, stacked && cardStyles.stackedTitle]}
          >
            <Text
              style={[cardStyles.title, stacked && cardStyles.stackedName]}
              numberOfLines={stacked ? 2 : 1}
            >
              {source.name}
            </Text>
            <Text
              style={[styles.caption, cardStyles.meta]}
              numberOfLines={stacked ? undefined : 1}
            >
              {meta}
            </Text>
          </View>
          {!!attention && (
            <Text
              style={[styles.caption, cardStyles.warnText]}
              numberOfLines={stacked ? 2 : 1}
            >
              {attention}
            </Text>
          )}
        </View>
      </View>
      {running && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`正在检测 ${source.name}`}
          accessibilityValue={
            check.total === null
              ? undefined
              : { min: 0, max: check.total, now: check.done }
          }
          style={cardStyles.progressLine}
        >
          <Text style={styles.caption}>
            {check.total === null
              ? "正在读取待测试频道…"
              : `正在检测 ${check.done}/${check.total}`}
          </Text>
          <View style={cardStyles.progressTrack}>
            <View
              style={[
                cardStyles.progressFill,
                {
                  width: `${
                    check.total
                      ? Math.min(100, (check.done / check.total) * 100)
                      : 12
                  }%`,
                },
              ]}
            />
          </View>
        </View>
      )}
      {/* 每张卡都显示相同的四项操作；当前不能使用的操作
          保留在原位并置灰，不将其隐藏。 */}
      <View style={cardStyles.footer}>
        {running ? (
          <FooterAction
            label="停止测试"
            accessibilityLabel={`停止测试 ${source.name}`}
            onPress={props.onStopCheck}
          />
        ) : (
          <FooterAction
            label="检测"
            accessibilityLabel={`${checked ? "重新检测" : "检测"} ${source.name}`}
            disabled={
              !source.enabled || saving || !!check || !source.channelCount
            }
            onPress={() =>
              summary ? props.onCheck(source, true) : props.onCheck(source)
            }
          />
        )}
        <FooterAction
          label="编辑"
          accessibilityLabel={`编辑 ${source.name}`}
          disabled={saving}
          onPress={() => props.onRename(source)}
        />
        <FooterAction
          label="删除"
          accessibilityLabel={`删除 ${source.name}`}
          danger
          disabled={saving}
          onPress={() => props.onRemove(source)}
        />
        {/* 开关位于行的末尾，让上方文字可以
            使用卡片的完整宽度。 */}
        <Switch
          style={cardStyles.switch}
          accessibilityLabel={`${source.enabled ? "停用" : "启用"} ${source.name}`}
          accessibilityHint={saving ? "正在保存" : undefined}
          value={source.enabled}
          disabled={saving || running}
          trackColor={{ true: colors.accent }}
          onValueChange={(enabled) => props.onEnabledChange(source, enabled)}
        />
      </View>
    </View>
  );
}

/** 卡片底部的纯文字操作。 */
function FooterAction({
  label,
  accessibilityLabel,
  disabled = false,
  danger = false,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  /** 破坏性操作“删除”，使用错误颜色绘制。 */
  danger?: boolean;
  onPress: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  // 这些标签使用中日韩字符：每个字预留一字宽，再给小图标
  // 留白，否则 Android 字体回退或取整可能让最后一个字换行
  // 在部分设备上会超出 Yoga 测量得到的文字宽度。
  const minWidth = Math.ceil(
    (type.chip.fontSize * label.length + 4) * Math.max(1, fontScale) + 24,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        cardStyles.footerAction,
        { minWidth },
        disabled && cardStyles.dimmed,
        pressed && cardStyles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[cardStyles.footerText, danger && cardStyles.danger]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 显示“今天更新”“昨天更新”“3 天前更新”；时间未知时不显示。 */
export function updatedAgo(timestamp: number, now: number) {
  const ago = daysAgo(timestamp, now);
  return ago ? `${ago}更新` : "";
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    paddingBottom: 12,
    paddingLeft: 14,
    paddingRight: 12,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  switch: { marginLeft: "auto", marginRight: 8 },
  titleLine: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  stackedTitle: { flexDirection: "column", alignItems: "stretch", gap: 2 },
  stackedName: { flex: 0 },
  title: { ...type.rowTitle, color: colors.text, flex: 1, minWidth: 0 },
  meta: { flexShrink: 0 },
  dimmed: { opacity: 0.45 },
  warnText: { color: colors.warn },
  note: { paddingHorizontal: 14, paddingBottom: 10 },
  progressLine: { gap: 6, paddingHorizontal: 14, paddingBottom: 12 },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: colors.raised,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  footerAction: {
    minHeight: sizes.touch,
    flexShrink: 0,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 4,
    justifyContent: "center",
  },
  footerText: { ...type.chip, color: colors.accent, fontWeight: "600" },
  danger: { color: colors.bad },
  pressed: { opacity: 0.7 },
});
