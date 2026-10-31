import type { AppLocale } from "@/i18n/dictionaries";
import { TIMEZONE } from "@/server/time";
export { formatSar } from "@/server/pricing/quote";

export function fmtDateTime(d: Date, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  }).format(d);
}

export function fmtTime(d: Date, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE }).format(d);
}

export function fmtDay(dateStr: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateStr}T00:00:00Z`));
}
