"use client";
// ชื่อเซสชัน = หมวดของท่า (contract: ไม่เก็บชื่อ · คำนวณตอนแสดง) เช่น "อกและแขน" · ยังไม่มีท่า = "เซสชันใหม่"

import { useTranslations } from "next-intl";
import { useLocalView } from "@/components/sync/use-offline";
import type { ActiveSessionDraft } from "@/lib/offline/session";
import { categoryLookup, sessionCategories } from "./session-logic";

type T = ReturnType<typeof useTranslations>;

/** รวมหมวดเป็นชื่อ: 1 หมวด = ชื่อหมวด · 2 = "A และ B" · 3+ = "A และอีก N หมวด" */
export function titleOfCategories(categories: readonly string[], t: T, tc: T): string {
  const label = (c: string) => tc(c as never);
  if (categories.length === 0) return t("sessionNew");
  if (categories.length === 1) return label(categories[0]);
  if (categories.length === 2) return t("sessionNameTwo", { a: label(categories[0]), b: label(categories[1]) });
  return t("sessionNameMany", { a: label(categories[0]), count: categories.length - 1 });
}

/** ใช้ในหน้าจดและแถบ "กำลังเล่น" */
export function useSessionTitle(d: ActiveSessionDraft | null): string {
  const t = useTranslations("log");
  const tc = useTranslations("exercise.category");
  const view = useLocalView();
  if (!d) return t("sessionNew");
  return titleOfCategories(sessionCategories(d, categoryLookup(view)), t, tc);
}

/** ชื่อของร่างที่ยังไม่ได้อยู่ใน state (เช่นจบให้เอง) */
export function useTitleOf(): (d: ActiveSessionDraft) => string {
  const t = useTranslations("log");
  const tc = useTranslations("exercise.category");
  const view = useLocalView();
  return (d) => titleOfCategories(sessionCategories(d, categoryLookup(view)), t, tc);
}
