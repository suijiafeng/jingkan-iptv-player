import { StyleSheet, type TextStyle } from "react-native";
export const colors = {
  bg: "#0B1115",
  surface: "#131D23",
  raised: "#1C2A31",
  text: "#F1F5F5",
  muted: "#A6B6BD",
  /** 行旁未选中的星标或图标：使用次要色的 60% 不透明度。 */
  mutedFaint: "#A6B6BD99",
  accent: "#8CE7D4",
  ink: "#092B26",
  line: "#293B43",
  warn: "#F3C58B",
  bad: "#FFB4AC",
};
/** 各页面共用从播放器确定的字号体系；频道页与播放器面板会并排出现，因此文字尺寸必须一致。 */
export const type = {
  /** 页面标题：频道、设置、管理节目来源。 */
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  /** 分区标题和卡片标题。 */
  heading: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  /** 正文、输入框和主按钮。 */
  body: { fontSize: 14, lineHeight: 20 },
  /** 标题或列表行下方的次要说明。 */
  muted: { fontSize: 12, lineHeight: 18 },
  /** 紧凑标签：频道行的分组或筛选维度名称。 */
  caption: { fontSize: 11, lineHeight: 16 },
  /** 筛选标签或页签。 */
  chip: { fontSize: 13, lineHeight: 20, fontWeight: "500" },
  /** 频道行的名称。 */
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
} satisfies Record<string, TextStyle>;
/** 页面、弹层和播放器共享的控件高度，单位 dp。 */
export const sizes = {
  /** 主按钮、次按钮和选项行。 */
  button: 44,
  /** 筛选标签和范围标签。 */
  chip: 34,
  /** 搜索框和维度筛选触发区域。 */
  field: 40,
  /** 纯文字操作（清除、管理、删除）的点击区域。 */
  touch: 48,
  /** 列表行中的频道台标或首字标识。 */
  logo: 40,
  /** 频道行：40dp 台标，上下各 8dp 留白。 */
  row: 56,
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  title: { ...type.title, color: colors.text },
  heading: { ...type.heading, color: colors.text },
  body: { ...type.body, color: colors.text },
  muted: { ...type.muted, color: colors.muted },
  caption: { ...type.caption, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: {
    minHeight: sizes.field,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.raised,
    color: colors.text,
    fontSize: type.body.fontSize,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
});
