import React, { useEffect, useRef, type MutableRefObject } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorNotice, Heading, Notice } from "../../components/ui";
import type { Source } from "../../domain/types";
import { colors, styles } from "../../theme";
import type { Repository } from "../../data/repository";
import { SourceLanguageSection } from "./SourceLanguageSection";
import {
  useSourceEdit,
  type SourceEdit,
  type SourceEditDeps,
} from "./useSourceEdit";

/**
 * 在一个页面编辑来源名称、链接（本地列表显示文件，点击可重选），
 * 以及节目单未标注语言时使用的默认语言。点击一次“保存”统一应用。
 * 每个来源都挂载新页面，使字段从该来源的原有数据开始。
 */
export function EditSourceModal({
  source,
  repo,
  close,
  changed,
  deps,
}: {
  source: Source | null;
  repo: Repository;
  close: () => void;
  changed: () => void;
  deps: SourceEditDeps;
}) {
  // 内部页面负责未保存内容的放弃确认；系统返回键
  // 此处仍可处理关闭，而弹层本身保持挂载以完成退出动画。
  const requestCloseRef = useRef<() => void>(close);
  return (
    <Modal
      testID="source-edit-modal"
      visible={!!source}
      animationType="slide"
      onRequestClose={() => requestCloseRef.current()}
    >
      {source && (
        <EditSourceScreen
          key={source.id}
          source={source}
          repo={repo}
          close={close}
          changed={changed}
          deps={deps}
          requestCloseRef={requestCloseRef}
        />
      )}
    </Modal>
  );
}

function EditSourceScreen(props: {
  source: Source;
  repo: Repository;
  close: () => void;
  changed: () => void;
  deps: SourceEditDeps;
  requestCloseRef: MutableRefObject<() => void>;
}) {
  const edit = useSourceEdit(props);
  const { requestCloseRef } = props;
  useEffect(() => {
    requestCloseRef.current = edit.cancel;
  });
  return <EditSourceView source={props.source} edit={edit} />;
}

/** 将页面视图与状态分离，使页面本身能够单独展示。 */
export function EditSourceView({
  source,
  edit,
}: {
  source: Source;
  edit: SourceEdit;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Heading title="编辑节目来源" />
        <ErrorNotice message={edit.error} onDismiss={edit.dismissError} />
        <Text style={styles.caption}>名称</Text>
        <TextInput
          accessibilityLabel="来源名称"
          style={styles.input}
          value={edit.name}
          editable={!edit.busy}
          onChangeText={edit.setName}
          maxLength={100}
        />
        <Text style={styles.caption}>
          {source.kind === "file" ? "文件" : "链接"}
        </Text>
        {source.kind === "file" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`更换文件，当前 ${edit.fileName}`}
            disabled={edit.busy}
            onPress={edit.chooseFile}
            style={({ pressed }) => [
              styles.input,
              editStyles.fileRow,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.body, editStyles.fileName]} numberOfLines={1}>
              {edit.fileName}
            </Text>
            <Text style={editStyles.fileAction}>更换</Text>
          </Pressable>
        ) : (
          <TextInput
            accessibilityLabel="节目单链接"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            value={edit.url}
            editable={!edit.busy}
            onChangeText={edit.setUrl}
            placeholder="https://example.com/channels.m3u"
            placeholderTextColor={colors.muted}
          />
        )}
        {edit.languagesLoading && (
          <Text style={styles.muted} accessibilityLiveRegion="polite">
            正在读取语言设置…
          </Text>
        )}
        {!!edit.languagesError && (
          <>
            <Notice title={edit.languagesError} error />
            <Button
              label="重试读取语言设置"
              secondary
              disabled={edit.busy}
              onPress={edit.retryLanguages}
            />
          </>
        )}
        {edit.languages && (
          <SourceLanguageSection
            languages={edit.languages}
            groups={edit.groups}
            disabled={edit.busy}
            onChange={edit.setLanguages}
          />
        )}
        <Button
          label={
            edit.committing ? "正在保存…" : edit.busy ? "正在读取…" : "保存"
          }
          disabled={edit.busy || !edit.name.trim()}
          onPress={edit.save}
        />
        {edit.committing && (
          <Text style={styles.muted} accessibilityLiveRegion="polite">
            正在写入本地资料，完成后即可返回
          </Text>
        )}
        <Button
          label="取消"
          secondary
          disabled={edit.committing}
          onPress={edit.cancel}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const editStyles = StyleSheet.create({
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  fileName: { flex: 1 },
  fileAction: { color: colors.accent, fontWeight: "600" },
});
