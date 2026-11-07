import React, { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import * as Localization from "expo-localization";
import {
  getLanguageSnapshot,
  setSystemLanguage,
  subscribeLanguage,
} from "./core";

export function useLanguage() {
  return useSyncExternalStore(
    subscribeLanguage,
    getLanguageSnapshot,
    getLanguageSnapshot,
  );
}

/** 系统语言在回到前台时重新读取；切换语言不重新挂载播放器或资料库。 */
export function LanguageRuntime({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const refresh = () => {
      try {
        setSystemLanguage(Localization.getLocales()[0]?.languageTag);
      } catch {
        setSystemLanguage("en");
      }
    };
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, []);
  return <>{children}</>;
}
