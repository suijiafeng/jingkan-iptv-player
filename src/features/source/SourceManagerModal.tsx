import React, { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenModal } from "../common/ScreenModal";
import { BackBar, ErrorNotice } from "../../components/ui";
import type { Source, SourceKind } from "../../domain/types";
import { colors, styles, type } from "../../theme";
import { Chevron, SettingRow, SettingSection } from "../settings/SettingRows";
import type { CheckProgress, CheckSummary } from "./availability";
import { SourceCard } from "./SourceCard";

interface ManagerProps {
  visible: boolean;
  sources: Source[];
  check: CheckProgress | null;
  summaries: Record<string, CheckSummary>;
  error?: string;
  onDismissError?: () => void;
  onClose: () => void;
  onAdd: (kind: SourceKind) => void;
  onRename: (source: Source) => void;
  onRemove: (source: Source) => void;
  sourceSaving?: string | null;
  onEnabledChange: (source: Source, enabled: boolean) => void;
  onCheck: (source: Source, force?: boolean) => void;
  onStopCheck: () => void;
  /** 从这里打开的页面；iOS 只能从当前弹层呈现它们。 */
  children?: ReactNode;
}

/**
 * 来源管理采用与入口设置页一致的布局：一行用于添加来源，
 * 随后每个来源各占一张卡片。
 */
export function SourceManagerModal(props: ManagerProps) {
  const { check, sources } = props;
  return (
    <ScreenModal
      visible={props.visible}
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <SafeAreaView style={styles.screen}>
        <BackBar title="节目来源" onBack={props.onClose} />
        <ScrollView
          contentContainerStyle={[styles.content, managerStyles.content]}
        >
          <ErrorNotice message={props.error} onDismiss={props.onDismissError} />
          {/* 在表单内选择链接或文件，不要重复选择两次。 */}
          <SettingSection label="添加">
            <SettingRow
              title="添加节目来源"
              trailing={<Chevron />}
              onPress={() => props.onAdd("url")}
            />
          </SettingSection>
          {sources.length === 0 ? (
            <View style={managerStyles.emptyCard}>
              <View style={managerStyles.emptyMark} accessible={false}>
                <Text style={managerStyles.emptyMarkText}>＋</Text>
              </View>
              <Text style={styles.heading}>还没有节目来源</Text>
            </View>
          ) : (
            <View style={managerStyles.list}>
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  check={check}
                  summary={props.summaries[source.id]}
                  saving={props.sourceSaving === source.id}
                  onRename={props.onRename}
                  onRemove={props.onRemove}
                  onEnabledChange={props.onEnabledChange}
                  onCheck={props.onCheck}
                  onStopCheck={props.onStopCheck}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      {props.children}
    </ScreenModal>
  );
}

const managerStyles = StyleSheet.create({
  content: { gap: 16 },
  list: { gap: 10 },
  emptyCard: {
    minHeight: 200,
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface,
  },
  emptyMark: {
    width: 48,
    height: 48,
    marginBottom: 4,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.raised,
  },
  emptyMarkText: { ...type.title, color: colors.accent },
});
