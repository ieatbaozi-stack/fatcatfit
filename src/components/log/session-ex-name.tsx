"use client";
// ชื่อท่าในเซสชัน: ชื่อตอนจด (สำเนาใน session_exercise · ADR 0003) · ไทย: ชื่อไทยใหญ่ + อังกฤษเล็กใต้ · อังกฤษ: อังกฤษอย่างเดียว (UX 12.5)

import { cx } from "@/components/ui/cx";

export type SessionExNameProps = { exercise_name: string; exercise_name_th: string | null };

export function exNames(e: SessionExNameProps, locale: string): { primary: string; secondary: string | null } {
  if (locale === "th" && e.exercise_name_th && e.exercise_name_th.trim() !== "") return { primary: e.exercise_name_th, secondary: e.exercise_name };
  return { primary: e.exercise_name, secondary: null };
}

export function SessionExName({ ex, locale, large = false, className }: { ex: SessionExNameProps; locale: string; large?: boolean; className?: string }) {
  const n = exNames(ex, locale);
  return (
    <span className={cx("flex min-w-0 flex-col", className)}>
      <span className={cx("line-clamp-2 break-words font-medium text-ink", large ? "text-section" : "text-body")}>{n.primary}</span>
      {n.secondary ? <span className="truncate text-caption text-ink-3">{n.secondary}</span> : null}
    </span>
  );
}
