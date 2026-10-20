import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorNotice, Heading } from "../../components/ui";
import type { Source } from "../../domain/types";
import { colors, styles } from "../../theme";
import type { Repository } from "../../data/repository";
import {
  useSourceEdit,
  type SourceEdit,
  type SourceEditDeps,
} from "./useSourceEdit";

/**
 * 在同一页面编辑来源名称和链接；本地列表则显示文件，点击可重新选择。
 * 一个“保存”同时应用两项修改。每个来源都会挂载新页面，
 * 因而字段从该来源的值开始。
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
  return (
    <Modal visible={!!source} animationType="slide" onRequestClose={close}>
      {source && (
        <EditSourceScreen
          key={source.id}
          source={source}
          repo={repo}
          close={close}
          changed={changed}
          deps={deps}
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
}) {
  const edit = useSourceEdit(props);
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
      <View style={styles.content}>
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
        <Button
          label={edit.busy ? "正在保存…" : "保存"}
          disabled={edit.busy || !edit.name.trim()}
          onPress={edit.save}
        />
        <Button label="取消" secondary onPress={edit.cancel} />
      </View>
    </SafeAreaView>
  );
}

const editStyles = StyleSheet.create({
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  fileName: { flex: 1 },
  fileAction: { color: colors.accent, fontWeight: "600" },
});
