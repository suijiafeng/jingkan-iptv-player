import { saveLanguagePreference } from "../../i18n/preferences";
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Repository } from "../../data/repository";
import { t, type LanguagePreference } from "../../i18n/core";
import { useLanguage } from "../../i18n/react";
import { colors, sizes, type } from "../../theme";
import { Chevron, SettingRow, SettingSection } from "./SettingRows";

const choices: { value: LanguagePreference; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "en", label: "English" },
];

export function LanguageSettings({
  repo,
}: {
  repo: Repository | null | undefined;
}) {
  const { preference } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const select = async (value: LanguagePreference) => {
    if (!repo || running.current) return;
    if (value === preference) {
      setExpanded(false);
      return;
    }
    running.current = true;
    setSaving(true);
    setError(false);
    try {
      // 持久化成功后才切换，失败时界面与存储仍使用原来的设置。
      await saveLanguagePreference(repo, value);
      setExpanded(false);
    } catch {
      setError(true);
    } finally {
      running.current = false;
      setSaving(false);
    }
  };
  const selectedLabel =
    choices.find((choice) => choice.value === preference)?.label ?? "跟随系统";
  return (
    <SettingSection>
      <SettingRow
        title={t("界面语言")}
        value={preference === "system" ? t(selectedLabel) : selectedLabel}
        trailing={<Chevron />}
        onPress={saving ? undefined : () => setExpanded((value) => !value)}
      />
      {expanded && (
        <View accessibilityRole="radiogroup" style={styles.options}>
          {choices.map(({ value, label }) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={value === "system" ? t(label) : label}
              accessibilityState={{
                checked: preference === value,
                disabled: !repo || saving,
              }}
              disabled={!repo || saving}
              onPress={() => void select(value)}
              style={({ pressed }) => [
                styles.option,
                preference === value && styles.selected,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[styles.label, preference === value && styles.active]}
              >
                {value === "system" ? t(label) : label}
              </Text>
              {preference === value && <Text style={styles.active}>✓</Text>}
            </Pressable>
          ))}
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t("语言设置未保存，请重试")}
            </Text>
          )}
        </View>
      )}
    </SettingSection>
  );
}
const styles = StyleSheet.create({
  options: { padding: 8, gap: 4 },
  option: {
    minHeight: sizes.touch,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  selected: { backgroundColor: colors.accentSoft },
  label: { ...type.body, color: colors.text, flexShrink: 1 },
  active: { color: colors.accent },
  error: { ...type.muted, color: colors.bad, padding: 12 },
});
