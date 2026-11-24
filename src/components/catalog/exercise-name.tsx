"use client";

import { useLocale, useTranslations } from "next-intl";
import { cx } from "@/components/ui/cx";
import { displayNames, type ExerciseRow, type Locale } from "./exercise-logic";

type NameProps = Pick<ExerciseRow, "name" | "name_th" | "owner_user_id" | "category" | "track_type">;

/**
 * ชื่อท่า — component เดียวใช้ทุกที่ (D3 · UX 12.5)
 * ไทย · คลัง: ชื่อไทยตัวใหญ่ (ขึ้นได้ 2 บรรทัด) + ชื่ออังกฤษตัวเล็กใต้ (บรรทัดเดียว ตัดด้วย …)
 * อังกฤษ · คลัง: ชื่ออังกฤษอย่างเดียว · ท่าของฉัน: ชื่อที่พิมพ์ + บรรทัดรอง "ของฉัน · หมวด · ชนิดการจด"
 * muted = ท่าที่เก็บเข้ากรุ (ตัวหนังสือ --ink-3)
 */
export function ExerciseName({ exercise, muted = false, className }: { exercise: NameProps; muted?: boolean; className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations();
  const names = displayNames(exercise, locale);
  const second =
    names.secondary === "english"
      ? names.english
      : names.secondary === "mine"
        ? t("exercises.mineMeta", { category: t(`exercise.category.${exercise.category}`), track: t(`exercise.track.${exercise.track_type}`) })
        : null;
  return (
    <span className={cx("flex min-w-0 flex-col", className)}>
      <span className={cx("line-clamp-2 text-body font-medium break-words", muted ? "text-ink-3" : "text-ink")}>{names.primary}</span>
      {second ? <span className="truncate text-caption text-ink-3">{second}</span> : null}
    </span>
  );
}
