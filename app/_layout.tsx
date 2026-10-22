import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0B1115" },
          }}
        />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
