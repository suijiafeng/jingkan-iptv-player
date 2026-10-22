import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui";
import { colors, styles } from "../../theme";

/** 频道页和播放器共享此提示，避免部分列表读取失败时悄无声息。 */
export function ChannelLoadNotice({
  loading = false,
  error,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  if (!loading && !error) return null;
  return (
    <View style={noticeStyles.container}>
      <View style={noticeStyles.message}>
        {!error && <ActivityIndicator size="small" color={colors.accent} />}
        <Text
          accessibilityRole={error ? "alert" : "text"}
          accessibilityLiveRegion="polite"
          style={[
            styles.muted,
            noticeStyles.copy,
            !!error && noticeStyles.error,
          ]}
        >
          {error || "正在读取其余频道…"}
        </Text>
      </View>
      {!!error && onRetry && (
        <Button secondary label="重新读取频道" onPress={onRetry} />
      )}
    </View>
  );
}

const noticeStyles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 8 },
  message: { flexDirection: "row", alignItems: "center", gap: 8 },
  copy: { flex: 1 },
  error: { color: colors.bad },
});
