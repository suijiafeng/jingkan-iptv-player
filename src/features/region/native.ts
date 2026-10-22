import * as Localization from "expo-localization";
import { isCountryCode } from "../../domain/channelFacets";
import type { DeviceEvidence } from "./policy";

export function readDeviceEvidence(): DeviceEvidence {
  let region: string | null = null;
  let language: string | null = null;
  let timeZone: string | null = null;
  try {
    const locale = Localization.getLocales()?.[0];
    const candidate = locale?.regionCode?.toUpperCase();
    region = isCountryCode(candidate) ? candidate : null;
    language =
      typeof locale?.languageCode === "string" ? locale.languageCode : null;
  } catch {
    /* 不支持的设备可能没有本机配置。 */
  }
  try {
    const candidate = Localization.getCalendars()?.[0]?.timeZone;
    timeZone = typeof candidate === "string" ? candidate : null;
  } catch {
    /* 不提供时区提示，比根据 UTC 偏移推断时区更稳妥。 */
  }
  return { region, language, timeZone };
}
