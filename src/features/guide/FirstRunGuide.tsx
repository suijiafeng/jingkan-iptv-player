import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui";
import type { SourceKind } from "../../domain/types";
import { colors, sizes, styles, type } from "../../theme";

/** 引导的结束方式：开始添加第一份节目单，或者稍后再添加。 */
export type GuideExit = SourceKind | null;

/** 首次使用引导：一页说明应用用途，然后提供两种添加节目单方式。联网、移动数据及本地存储在实际发生时，通过许可对话框或“关于”解释，不在这里提前铺陈。 */
export function FirstRunGuide({
  visible,
  onFinish,
}: {
  visible: boolean;
  onFinish: (exit: GuideExit) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={() => onFinish(null)}
    >
      <SafeAreaView
        style={styles.screen}
        edges={["top", "bottom", "left", "right"]}
      >
        <View style={guideStyles.topBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onFinish(null)}
            hitSlop={8}
            style={({ pressed }) => [
              guideStyles.textAction,
              pressed && guideStyles.pressed,
            ]}
          >
            <Text style={guideStyles.textActionLabel}>稍后再说</Text>
          </Pressable>
        </View>
        <View style={guideStyles.page}>
          <Text accessibilityRole="header" style={guideStyles.title}>
            静看 TV
          </Text>
          <Text style={guideStyles.body}>播放你自己添加的节目单。</Text>
        </View>
        <View style={guideStyles.footer}>
          <Button label="添加节目单链接" onPress={() => onFinish("url")} />
          <Button
            label="从文件导入"
            secondary
            onPress={() => onFinish("file")}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const guideStyles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    minHeight: sizes.touch,
    paddingHorizontal: 8,
  },
  textAction: {
    minHeight: sizes.touch,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  textActionLabel: { ...type.body, color: colors.muted },
  pressed: { opacity: 0.6 },
  page: { flex: 1, paddingHorizontal: 28, paddingTop: 96, gap: 12 },
  title: { ...styles.title, fontSize: 28, lineHeight: 36 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  footer: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
});
