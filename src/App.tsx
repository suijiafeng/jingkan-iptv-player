import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1115" }}>
      <View style={{ padding: 20 }}>
        <Text style={{ color: "#F1F5F5", fontSize: 24 }}>静看</Text>
      </View>
    </SafeAreaView>
  );
}
