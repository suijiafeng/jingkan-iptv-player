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
  /** 选中筛选标签的底色：强调色的 16% 不透明度。 */
  accentSoft: "#8CE7D429",
  ink: "#092B26",
  line: "#293B43",
  warn: "#F3C58B",
  bad: "#FFB4AC",
};
/** 以 16 号正文为基准；频道页与播放器面板共享字号和行高，文字继续跟随系统字体缩放。 */
export const type = {
  /** 页面标题：频道、设置、管理节目来源。 */
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  /** 分区标题和卡片标题。 */
  heading: { fontSize: 18, lineHeight: 26, fontWeight: "600" },
  /** 正文、输入框和主按钮。 */
  body: { fontSize: 16, lineHeight: 24 },
  /** 标题或列表行下方的次要说明。 */
  muted: { fontSize: 14, lineHeight: 20 },
  /** 紧凑标签：频道行的分组或筛选维度名称。 */
  caption: { fontSize: 13, lineHeight: 18 },
  /** 筛选标签或页签。 */
  chip: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  /** 频道行的名称。 */
  rowTitle: { fontSize: 16, lineHeight: 24, fontWeight: "500" },
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
  /** 频道行的最小高度；实际高度还会根据文字行高和系统字体缩放增加。 */
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
    ...type.body,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
});
