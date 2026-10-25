import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenModal } from "../common/ScreenModal";
import Constants from "expo-constants";
import { BackBar } from "../../components/ui";
import { colors, sizes, styles, type } from "../../theme";
import { RISK } from "../common/confirm";
import { Chevron, SettingRow } from "./SettingRows";
import { SettingIcon } from "./SettingIcon";

export const versionLabel = () =>
  `版本 ${Constants.expoConfig?.version ?? "未知"}`;

/**
 * 将应用其它位置无法当场说明的事项放入折叠分组。
 * 联网部分保留完整的知情许可说明，绝不缩减。
 */
const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "使用",
    paragraphs: [
      "使用“添加节目单”导入可信链接或本地 M3U/TXT 文件。同一频道的多个地址列在“线路”里，播放失败会依次自动尝试。",
    ],
  },
  {
    title: "隐私与资料",
    paragraphs: [
      "无广告、账号或遥测，不内置节目来源。节目单、收藏与偏好只存在本机，不记录完整地址或观看历史。",
      "不使用系统备份，卸载即删除资料；换机前请导出备份。备份文件未加密，可能含来源令牌。",
    ],
  },
  {
    title: "后台播放",
    paragraphs: [
      "默认开启，切到后台或锁屏仍会播放并提供系统媒体控制，会持续耗电并使用流量；可在设置中关闭。",
    ],
  },
  { title: "联网说明", paragraphs: [RISK] },
  {
    title: "台标、地区与语言",
    paragraphs: [
      "台标默认关闭，需单独允许，只接受 HTTPS 地址；图片重定向无法保证全程加密，失败时显示频道首字。",
      "地区只参考手机地区与时区，不查询 IP、不定位，手动选择优先。",
      "导入预览中的「自动补全语言」开启时，保存后会连接 iptv-org 下载一次公开数据库（约 8 MB）。",
    ],
  },
  {
    title: "开源组件",
    paragraphs: [
      "基于 Expo、React Native、Expo Video、SQLite 等开源组件，许可证见发行包 THIRD_PARTY_NOTICES.txt。",
    ],
  },
];

function Section({
  title,
  paragraphs,
}: {
  title: string;
  paragraphs: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={aboutStyles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [
          aboutStyles.sectionHeader,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[styles.body, aboutStyles.sectionTitle]}>{title}</Text>
        <Text style={aboutStyles.arrow} accessible={false}>
          {open ? "▲" : "▼"}
        </Text>
      </Pressable>
      {open &&
        paragraphs.map((paragraph) => (
          <Text key={paragraph} style={styles.muted}>
            {paragraph}
          </Text>
        ))}
    </View>
  );
}

export function About() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingRow
        title="关于静看 TV"
        icon={<SettingIcon name="about" />}
        value={Constants.expoConfig?.version}
        trailing={<Chevron />}
        onPress={() => setOpen(true)}
      />
      <ScreenModal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView
          style={styles.screen}
          edges={["top", "bottom", "left", "right"]}
        >
          <BackBar title="静看 TV" onBack={() => setOpen(false)} />
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.muted}>{versionLabel()}</Text>
            <View>
              {SECTIONS.map((section) => (
                <Section key={section.title} {...section} />
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </ScreenModal>
    </>
  );
}

const aboutStyles = StyleSheet.create({
  section: {
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sectionHeader: {
    minHeight: sizes.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: { flex: 1, fontWeight: "600" },
  arrow: { ...type.body, color: colors.muted, paddingLeft: 12 },
});
