"use client";
// สรุปจบเซสชัน (UX 4 · wireframe "สรุปจบเซสชัน"): ชมการมา ไม่ชมตัวเลข · ไม่มีแคลอรี่ · ส้ม = จุดสถิติใหม่ (คู่กับดาวและคำว่า "สถิติ")
// ออฟไลน์: "จะส่งเมื่อมีเน็ต" · "บันทึกเป็นเทมเพลต" เป็นงาน R4 (ยังไม่มี)

import { useLocale, useTranslations } from "next-intl";
import { Cat } from "@/components/doodle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useOnline } from "@/pwa/use-online";
import { SessionExName } from "./session-ex-name";
import { titleOfCategories } from "./session-title";
import type { SummaryData } from "./session-logic";

export function SummaryView({ data, onDone }: { data: SummaryData; onDone: () => void }) {
  const t = useTranslations("log");
  const tc = useTranslations("exercise.category");
  const locale = useLocale();
  const online = useOnline();
  const title = titleOfCategories(data.categories, t, tc);
  const minutes = Math.max(1, Math.round(data.durationMs / 60000));

  return (
    <div className="flex flex-1 flex-col items-center gap-3 pt-8 text-center">
      <Cat pose={data.prCount > 0 ? "new-record" : "thanks"} size={150} motion className="text-ink" />
      <h1 className="text-page">{t("summary.title")}</h1>
      <p className="text-body text-ink-2">
        {title} · {data.placeName}
      </p>
      <p className="num text-body text-ink-2">
        {t("summary.minutes", { count: minutes })} · {t("summary.sets", { count: data.totalSets })} · {t("summary.exercises", { count: data.exercises.length })}
      </p>
      {data.prCount > 0 ? (
        <p className="flex items-center gap-2 text-body font-medium text-ink">
          <span aria-hidden="true" className="size-3 rounded-blob bg-accent" />
          <Icon name="star" size={18} />
          {t("summary.records", { count: data.prCount })}
        </p>
      ) : null}
      {!online ? <p role="status" className="text-caption text-ink-3">{t("summary.offline")}</p> : null}

      <ul className="m-0 mt-2 flex w-full list-none flex-col p-0 text-left">
        {data.exercises.map((e, i) => (
          <li key={i} className="flex min-h-14 items-center gap-3 border-b border-line py-2 last:border-b-0">
            <SessionExName ex={{ exercise_name: e.name, exercise_name_th: e.nameTh }} locale={locale} className="flex-1" />
            <span className="num flex-none text-caption text-ink-2">
              {t("summary.sets", { count: e.sets })}
              {e.best ? ` · ${e.best}` : ""}
            </span>
            {e.pr ? (
              <span className="flex flex-none items-center gap-1 text-caption text-ink">
                <span aria-hidden="true" className="size-2.5 rounded-blob bg-accent" />
                <Icon name="star" size={16} />
                {t("record")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-auto w-full pt-8 pb-4">
        <Button onClick={onDone}>{t("summary.done")}</Button>
      </div>
    </div>
  );
}
