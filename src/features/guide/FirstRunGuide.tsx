import { t } from "../../i18n/core";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenModal } from "../common/ScreenModal";
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
    <ScreenModal
      sheet={false}
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
            <Text style={guideStyles.textActionLabel}>{t("稍后再说")}</Text>
          </Pressable>
        </View>
        <ScrollView
          style={guideStyles.scroller}
          contentContainerStyle={guideStyles.content}
        >
          <View style={guideStyles.page}>
            <Text accessibilityRole="header" style={guideStyles.title}>
              {t("静看 TV")}
            </Text>
            <Text style={guideStyles.body}>
              {t("播放你自己添加的节目单。")}
            </Text>
            <Text style={guideStyles.body}>
              {t(
                "应用不提供节目来源。请添加可信且有权使用的节目单链接或 M3U/TXT 文件。",
              )}
            </Text>
          </View>
          <View style={guideStyles.footer}>
            <Button
              label={t("添加节目单链接")}
              onPress={() => onFinish("url")}
            />
            <Button
              label={t("从文件导入")}
              secondary
              onPress={() => onFinish("file")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenModal>
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
  scroller: { flex: 1 },
  content: { flexGrow: 1 },
  page: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 40,
    gap: 12,
  },
  title: { ...styles.title, fontSize: 28, lineHeight: 36 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  footer: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
});
