import { t } from "../../i18n/core";
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
  t("版本 {value0}", { value0: Constants.expoConfig?.version ?? t("未知") });

/**
 * 将应用其它位置无法当场说明的事项放入折叠分组。
 * 联网部分保留完整的知情许可说明，绝不缩减。
 */
const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "关于播放器",
    paragraphs: [
      "静看 TV 是一款由你自行添加节目单的播放器，不内置或提供节目来源。请仅导入可信且有权使用的节目单。",
      "支持从链接或本地 M3U/TXT 文件导入。同一频道的多个播放地址可在“线路”中选择；连接超时或部分网络、媒体故障时，会尝试其他线路。实际播放效果取决于来源、网络和设备支持。",
    ],
  },
  {
    title: "隐私与资料",
    paragraphs: [
      "无需注册账号。节目来源、完整地址（可能含访问令牌）、频道、收藏、最近播放记录与偏好保存在设备本地。最近列表最多保留 100 个频道。",
      "播放、导入和地址检测会直接访问相应服务器；台标与语言补全也会访问外部服务，服务器可能收到你的 IP 地址和请求信息。",
      "可在最近页管理观看记录，或在设置中清除所有本地资料。清除资料不会删除你原来的节目单文件，也不会删除此前导出的备份文件。",
      "JSON 备份包含节目来源、频道、收藏及部分偏好，不包含最近播放记录和联网、台标许可。备份未加密，可能包含完整地址与访问令牌，请妥善保管。当前备份导出仅支持 Android。",
    ],
  },
  {
    title: "后台播放",
    paragraphs: [
      "后台播放默认开启。播放时切换应用或锁屏后，仍可继续播放并显示系统媒体控制，会持续耗电并消耗网络流量；可在设置中关闭。实际行为受系统限制影响。",
    ],
  },
  { title: "联网说明", paragraphs: [RISK] },
  {
    title: "台标、地区与语言",
    paragraphs: [
      "台标默认关闭，开启前会单独征求同意。应用仅接受 HTTPS 台标地址；服务器重定向后无法保证全程加密。台标缺失或加载失败时显示频道首字。",
      "地区筛选参考设备的地区、语言和时区设置，不通过 IP 查询地区，也不使用 GPS 定位。手动选择的地区优先。",
      "导入时开启“自动补全语言”，保存后会访问 iptv-org 的公开数据库（约 8 MB），查询符合条件的频道语言信息。该数据库不提供本应用的节目来源。",
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
        accessibilityLabel={t(title)}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [
          aboutStyles.sectionHeader,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[styles.body, aboutStyles.sectionTitle]}>{t(title)}</Text>
        <Text style={aboutStyles.arrow} accessible={false}>
          {open ? "▲" : "▼"}
        </Text>
      </Pressable>
      {open &&
        paragraphs.map((paragraph) => (
          <Text key={paragraph} style={styles.muted}>
            {t(paragraph)}
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
        title={t("关于静看 TV")}
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
          <BackBar title={t("静看 TV")} onBack={() => setOpen(false)} />
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
