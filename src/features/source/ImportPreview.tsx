import { t } from "../../i18n/core";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Button } from "../../components/ui";
import { channelRowHeight } from "../../components/ChannelRow";
import { displayGroups } from "../../domain/channelLabels";
import {
  IMPORT_ISSUE_LABELS,
  type ImportIssueReason,
  type ParsedChannel,
} from "../../domain/types";
import { colors, sizes, styles, type } from "../../theme";
import type { SourceFormState } from "./form";
import { needsLanguageLookup } from "./iptvOrgLanguages";

/**
 * 保存前的节目单解析预览。惰性渲染并列出全部频道，支持滚动；
 * 统计和警告位于列表开头，“导入”固定在底部，无需滚动寻找。
 * iptv-org 频道缺少语言时，可通过默认开启的开关在保存后补全；
 * 开关标题注明该操作需联网下载约 8 MB。
 */
export function ImportPreviewBody({
  preview,
  header,
  busy,
  fillLanguages,
  onFillLanguages,
  onSave,
  onBack,
}: {
  preview: NonNullable<SourceFormState["preview"]>;
  /** 页面标题及错误信息，显示在统计数字上方。 */
  header: React.ReactNode;
  busy: boolean;
  fillLanguages: boolean;
  onFillLanguages: (on: boolean) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const rowHeight = channelRowHeight(fontScale);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const { stats } = preview;
  const skipped = stats.duplicates + stats.ignored;
  const unlabelled = useMemo(
    () => preview.channels.filter(needsLanguageLookup).length,
    [preview.channels],
  );
  return (
    <View style={previewStyles.root}>
      <FlatList
        testID="import-preview-list"
        data={preview.channels}
        keyExtractor={(channel) => channel.identityKey}
        renderItem={({ item }) => (
          <PreviewRow channel={item} height={rowHeight} />
        )}
        getItemLayout={(_rows, index) => ({
          length: rowHeight,
          offset: rowHeight * index,
          index,
        })}
        initialNumToRender={20}
        windowSize={11}
        contentContainerStyle={previewStyles.content}
        ListHeaderComponent={
          <View style={previewStyles.header}>
            {header}
            {stats.http > 0 && (
              <Text style={previewStyles.warnText}>
                {t("{value0} 个频道未加密（HTTP）", { value0: stats.http })}
              </Text>
            )}
            {unlabelled > 0 && (
              <View style={previewStyles.fillRow}>
                <View style={previewStyles.fillText}>
                  {/* 知情许可提示只放在标题行。 */}
                  <Text style={styles.body}>
                    {t("自动补全语言")}
                    <Text style={styles.muted}> {t(" · 联网约 8 MB")}</Text>
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={t("导入后自动补全语言")}
                  accessibilityHint={t("从 iptv-org 公开数据库下载约 8 MB")}
                  value={fillLanguages}
                  disabled={busy}
                  onValueChange={onFillLanguages}
                  trackColor={{ true: colors.accent }}
                />
              </View>
            )}
            {skipped > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: skippedOpen }}
                onPress={() => setSkippedOpen((open) => !open)}
                style={previewStyles.skippedToggle}
              >
                <Text style={styles.muted}>
                  {t("{value0} 条未导入", { value0: skipped })}
                </Text>
                <Text style={styles.muted}>
                  {skippedOpen ? t("收起") : "›"}
                </Text>
              </Pressable>
            )}
            {skippedOpen &&
              Object.entries(preview.issueCounts).map(([reason, count]) => (
                <Text key={reason} style={styles.muted}>
                  {t("{value0}：{value1}", {
                    value0: t(IMPORT_ISSUE_LABELS[reason as ImportIssueReason]),
                    value1: count,
                  })}
                </Text>
              ))}
          </View>
        }
      />
      <View style={previewStyles.footer}>
        <Button
          style={previewStyles.footerButton}
          label={t("返回修改")}
          secondary
          disabled={busy}
          onPress={onBack}
        />
        <Button
          style={previewStyles.footerButton}
          label={busy ? t("正在保存…") : t("导入")}
          accessibilityLabel={t("导入 {value0} 个频道", {
            value0: stats.valid,
          })}
          disabled={busy || !stats.valid}
          onPress={onSave}
        />
      </View>
    </View>
  );
}

function PreviewRow({
  channel,
  height,
}: {
  channel: ParsedChannel;
  height: number;
}) {
  return (
    <View style={[previewStyles.row, { height }]}>
      <View style={previewStyles.titleLine}>
        <Text style={previewStyles.name} numberOfLines={1}>
          {channel.name}
        </Text>
        {channel.qualityLabel && (
          <Text style={previewStyles.tag}>{t(channel.qualityLabel)}</Text>
        )}
      </View>
      <Text style={styles.caption} numberOfLines={1}>
        {displayGroups(channel.groupName)}
      </Text>
    </View>
  );
}

const previewStyles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 16 },
  header: { gap: 12, paddingTop: 20, paddingBottom: 8 },
  warnText: { ...type.body, color: colors.warn },
  fillRow: {
    minHeight: sizes.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fillText: { flex: 1, gap: 2 },
  skippedToggle: {
    minHeight: sizes.touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: {
    justifyContent: "center",
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { ...type.rowTitle, color: colors.text, flexShrink: 1 },
  tag: {
    ...type.caption,
    color: colors.muted,
    backgroundColor: colors.raised,
    borderRadius: 6,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  footerButton: { flex: 1 },
});
