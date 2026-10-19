import React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Heading, Notice } from "../../components/ui";
import { colors, styles } from "../../theme";

/** 本地数据库打开期间显示；打开失败时提供重试。 */
export function StartupScreen({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Heading title="静看 TV" subtitle="只留下你想看的频道" />
        {error ? (
          <>
            <Notice title={error} error />
            <Button label="重新打开本地资料" onPress={onRetry} />
          </>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    </SafeAreaView>
  );
}
