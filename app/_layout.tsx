import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { LanguageRuntime } from "../src/i18n/react";
export default function Layout() {
  return (
    <LanguageRuntime>
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
    </LanguageRuntime>
  );
}
