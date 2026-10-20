import React from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackBar, ErrorNotice, Heading } from "../../components/ui";
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
  onRefresh: (source: Source) => void;
  onRename: (source: Source) => void;
  onRemove: (source: Source) => void;
  sourceSaving?: string | null;
  onEnabledChange: (source: Source, enabled: boolean) => void;
  onCheck: (source: Source, force?: boolean) => void;
  onStopCheck: () => void;
  /** 当前正在通过 iptv-org 数据库查询语言的来源。 */
  languageLookup?: string | null;
  languageMessages?: Record<string, string>;
  onLookupLanguages?: (source: Source) => void;
  onStopLanguageLookup?: () => void;
}

/**
 * 来源管理采用与入口设置页一致的布局：一行用于添加来源，
 * 随后每个来源各占一张卡片。
 */
export function SourceManagerModal(props: ManagerProps) {
  const { check, sources } = props;
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <SafeAreaView style={styles.screen}>
        <BackBar onBack={props.onClose} />
        <ScrollView
          contentContainerStyle={[styles.content, managerStyles.content]}
        >
          <Heading title="节目来源" />
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
                  languageLookup={props.languageLookup ?? null}
                  languageMessage={props.languageMessages?.[source.id]}
                  onRefresh={props.onRefresh}
                  onRename={props.onRename}
                  onRemove={props.onRemove}
                  onEnabledChange={props.onEnabledChange}
                  onCheck={props.onCheck}
                  onStopCheck={props.onStopCheck}
                  onLookupLanguages={props.onLookupLanguages}
                  onStopLanguageLookup={props.onStopLanguageLookup}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
