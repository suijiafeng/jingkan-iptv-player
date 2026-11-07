import { en, enSingular } from "./en";

export type Locale = "zh-Hans" | "en";
export type LanguagePreference = "system" | Locale;
export const LANGUAGE_SETTING = "interfaceLanguage";
const listeners = new Set<() => void>();
let systemLocale: Locale = "en";
let snapshot: { preference: LanguagePreference; locale: Locale } = {
  preference: "system",
  locale: systemLocale,
};

export function resolveLocale(languageTag: string | undefined | null): Locale {
  return /^zh(?:[-_]|$)/i.test(languageTag ?? "") ? "zh-Hans" : "en";
}
export function parseLanguagePreference(value: unknown): LanguagePreference {
  return value === "zh-Hans" || value === "en" ? value : "system";
}
function publish(preference: LanguagePreference) {
  const locale = preference === "system" ? systemLocale : preference;
  if (snapshot.preference === preference && snapshot.locale === locale) return;
  snapshot = { preference, locale };
  listeners.forEach((listener) => listener());
}
export const getLanguageSnapshot = () => snapshot;
export const getLocale = () => snapshot.locale;
export const subscribeLanguage = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setSystemLanguage(languageTag: string | undefined | null) {
  systemLocale = resolveLocale(languageTag);
  publish(snapshot.preference);
}
export function setLanguagePreference(value: LanguagePreference) {
  publish(parseLanguagePreference(value));
}

// 每条文案以完整句子为单位，插值不改变用户输入或持久数据。
// eslint-disable-next-line id-length -- Conventional translation helper.
export function t(
  message: string,
  values: Record<string, string | number | null | undefined> = {},
): string {
  const translated = (en as Record<string, string>)[message];
  let template =
    getLocale() === "en" && typeof translated === "string"
      ? translated
      : message;
  if (getLocale() === "en" && Number(values.value0) === 1) {
    const single = enSingular[message];
    if (typeof single === "string") template = single;
  }
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = values[name];
    if (value === undefined || value === null) return token;
    return typeof value === "number" ? formatNumber(value) : value;
  });
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 2,
  }).format(value);
}
const collators = new Map<Locale, Intl.Collator>();
export function compareLabels(left: string, right: string): number {
  const locale = getLocale();
  let collator = collators.get(locale);
  if (!collator) {
    collator = new Intl.Collator(locale);
    collators.set(locale, collator);
  }
  return collator.compare(left, right);
}
export function formatRelativeDays(days: number): string {
  try {
    return new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(
      -days,
      "day",
    );
  } catch {
    if (days === 0) return t("今天");
    if (days === 1) return t("昨天");
    return t("{value0} 天前", { value0: days });
  }
}
