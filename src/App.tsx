import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Heading, Notice } from "./components/ui";
import { styles } from "./theme";

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Heading title="静看" subtitle="只留下你想看的频道" />
        <Notice title="从一份节目单开始" body="频道资料会保存在这台手机。" />
      </View>
    </SafeAreaView>
  );
}
