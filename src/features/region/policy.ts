import { countryLabel, isCountryCode } from "../../domain/channelFacets";

export interface CountryPreference {
  mode: "auto" | "manual";
  countryCode: string | null;
  /** 历史遗留存储字段；统一规范化为 false，绝不用于请求。 */
  ipAllowed: boolean;
  locationAllowed: boolean;
}

export interface RegionResult {
  countryCode: string | null;
  source: "device" | "conflict" | "none";
  /** 结果的判断依据：在国家菜单中用一行简短文字说明。 */
  message: string;
}

export interface DeviceEvidence {
  region: string | null;
  language: string | null;
  timeZone: string | null;
}

export const DEFAULT_COUNTRY_PREFERENCE: CountryPreference = {
  mode: "auto",
  countryCode: null,
  ipAllowed: false,
  locationAllowed: false,
};

export const NO_REGION: RegionResult = {
  countryCode: null,
  source: "none",
  message: "暂无法判断地区",
};

// 来自 IANA zone1970.tab（2026-10-18）的单国家/地区时区，并包含旧别名
// 必须先解析；即使 Tokyo、Singapore、Bangkok 等命名时区也覆盖
// 该数据集中对应多个地区，因此有意不将其作为证据。
// 这些只是本机配置提示，绝不代表坐标，也不根据 UTC 偏移推断。
const TIME_ZONE_COUNTRIES: Record<string, string> = {
  "Asia/Shanghai": "CN",
  "Asia/Chongqing": "CN",
  "Asia/Harbin": "CN",
  "Asia/Urumqi": "CN",
  "Asia/Kashgar": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Macau": "MO",
  "Asia/Macao": "MO",
  "Asia/Taipei": "TW",
  "Asia/Seoul": "KR",
  "Asia/Pyongyang": "KP",
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Saigon": "VN",
  "Asia/Jakarta": "ID",
  "Asia/Makassar": "ID",
  "Asia/Jayapura": "ID",
  "Asia/Manila": "PH",
  "Asia/Jerusalem": "IL",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Kathmandu": "NP",
  "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES",
  "Europe/Lisbon": "PT",
  "Atlantic/Azores": "PT",
  "Europe/Dublin": "IE",
  "Europe/Moscow": "RU",
  "Asia/Vladivostok": "RU",
  "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA",
  "Europe/Warsaw": "PL",
  "Europe/Athens": "GR",
  "Europe/Vienna": "AT",
  "Europe/Istanbul": "TR",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "America/Vancouver": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "America/St_Johns": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "America/Bogota": "CO",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Australia/Darwin": "AU",
  "Australia/Hobart": "AU",
  "Pacific/Chatham": "NZ",
  "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA",
};

export function timeZoneCountry(timeZone: string | null): string | null {
  return timeZone ? (TIME_ZONE_COUNTRIES[timeZone] ?? null) : null;
}

export function parseCountryPreference(value: unknown): CountryPreference {
  if (!value || typeof value !== "object")
    return { ...DEFAULT_COUNTRY_PREFERENCE };
  const input = value as Record<string, unknown>;
  const mode = input.mode === "manual" ? "manual" : "auto";
  const countryCode = isCountryCode(input.countryCode)
    ? input.countryCode
    : mode === "manual" && input.countryCode === ""
      ? ""
      : null;
  return {
    mode,
    countryCode,
    ipAllowed: false,
    locationAllowed: false,
  };
}

/** 推荐地区只参考本机设置，忽略旧的联网或定位授权。 */
export function resolveRegion(device: DeviceEvidence): RegionResult {
  const region = isCountryCode(device.region) ? device.region : null;
  const zone = timeZoneCountry(device.timeZone);
  if (region && zone === region)
    return {
      countryCode: region,
      source: "device",
      message: "依据：手机地区与时区设置",
    };
  if (region && zone && region !== zone)
    return {
      countryCode: null,
      source: "conflict",
      message: "手机地区与时区不一致",
    };
  return { ...NO_REGION };
}

export function effectiveCountry(
  preference: CountryPreference,
  result: RegionResult,
  availableCountries: readonly string[],
): string | null {
  if (preference.mode === "manual") return preference.countryCode;
  return result.countryCode && availableCountries.includes(result.countryCode)
    ? result.countryCode
    : null;
}

/**
 * 国家/地区菜单顶部的一行简短说明，解释当前显示地区的依据。
 * 主页面只显示结果本身。
 */
export function regionBasis(
  preference: CountryPreference,
  result: RegionResult,
  shownCountry: string | null,
): string {
  if (preference.mode === "manual") return "手动选择";
  if (result.countryCode && shownCountry === null)
    return `识别为${countryLabel(result.countryCode)}，节目单中无该地区频道`;
  return result.message;
}
