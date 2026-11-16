// ภาษาของแอป — ไม่มี locale ใน URL เก็บใน cookie (S4)
export const locales = ["th", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "th";

/** ชื่อ cookie ตามค่าเริ่มต้นของ next-intl */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** ค่าที่ไม่รู้จัก/ว่าง → ไทย */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}
