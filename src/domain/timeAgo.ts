import { formatRelativeDays } from "../i18n/core";
const DAY_MS = 24 * 60 * 60 * 1000;

/** 按自然日显示“今天”“昨天”或“N 天前”；没有时间戳时返回空字符串。 */
export function daysAgo(timestamp: number | null | undefined, now: number) {
  if (
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  )
    return "";
  const current = new Date(now);
  const previous = new Date(timestamp);
  // 用本地日历日期计算天数，避免夏令时的 23/25 小时日造成偏差。
  const calendarDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.max(
    0,
    Math.round((calendarDay(current) - calendarDay(previous)) / DAY_MS),
  );
  return formatRelativeDays(days);
}
