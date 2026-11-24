"use client";
// ท่าหนึ่งในหน้าจด: หัว (ชื่อ · ⋯) + หัวคอลัมน์ + แถวเซ็ต · ท่าที่ไม่ได้เปิดพับเป็นแถวเดียว (UX 4)

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import type { ExerciseSummary } from "@/lib/data/shared/workout";
import type { ActiveSessionDraft, DraftExercise, DraftSet, SetValues } from "@/lib/offline/session";
import { evaluateLive } from "./pr";
import { SessionExName } from "./session-ex-name";
import { SetRow } from "./set-row";
import { columnsOf, fieldKey, formatSetValues, setLabels, unitLabel, valuesOfDraft, type DisplayUnits } from "./set-logic";

type Props = {
  ex: DraftExercise;
  open: boolean;
  /** ท่าทีละข้าง (ป้าย "ข้างละ" ใต้หัวคอลัมน์ครั้ง) */
  unilateral: boolean;
  summary: Pick<ExerciseSummary, "bests"> | undefined;
  units: DisplayUnits;
  locale: string;
  stopwatch: ActiveSessionDraft["stopwatch"];
  onToggle: () => void;
  onExerciseMenu: () => void;
  onTick: (ex: DraftExercise, set: DraftSet) => void;
  onUntick: (ex: DraftExercise, set: DraftSet) => void;
  onValues: (ex: DraftExercise, set: DraftSet, values: SetValues) => void;
  onSetMenu: (ex: DraftExercise, set: DraftSet, label: string) => void;
  onPlay: (ex: DraftExercise, set: DraftSet) => void;
  onStop: () => void;
};

export function ExerciseBlock({ ex, open, unilateral, summary, units, locale, stopwatch, onToggle, onExerciseMenu, onTick, onUntick, onValues, onSetMenu, onPlay, onStop }: Props) {
  const t = useTranslations("log");
  const ev = useMemo(() => evaluateLive(ex, summary), [ex, summary]);
  const sets = [...ex.sets].sort((a, b) => a.position - b.position);
  const done = sets.filter((s) => s.completed_at !== null);
  const lastDone = done.at(-1);
  const cols = columnsOf(ex.track_type);

  const labels = setLabels(sets);

  if (!open) {
    return (
      <div className="border-b border-ink-3/40">
        <button type="button" aria-expanded={false} onClick={onToggle} className="flex min-h-14 w-full cursor-pointer items-center gap-3 py-2 text-left">
          <SessionExName ex={ex} locale={locale} className="flex-1" />
          <span className="num flex-none text-caption text-ink-3">
            {done.length > 0 ? t("collapsedSets", { count: done.length }) : t("collapsedNone")}
            {lastDone ? ` · ${formatSetValues(ex.track_type, ex.load_mode, valuesOfDraft(lastDone), locale)}` : ""}
          </span>
          <Icon name="down" size={20} className="flex-none text-ink-3" />
        </button>
      </div>
    );
  }

  const unitOfHead = (f: (typeof cols)[number]): string => {
    const sample = sets[0] ? valuesOfDraft(sets[0]) : null;
    switch (f) {
      case "weight":
        return sample?.weight_unit ?? units.weight;
      case "distance":
        return sample?.distance_unit ?? units.distance;
      case "speed":
        return sample?.speed_unit ?? units.speed;
      default:
        return "";
    }
  };

  return (
    <section aria-label={ex.exercise_name} className="flex flex-col gap-1 pb-2">
      <div className="flex items-start gap-2">
        <button type="button" aria-expanded onClick={onToggle} className="min-h-11 min-w-0 flex-1 cursor-pointer text-left">
          <SessionExName ex={ex} locale={locale} large />
        </button>
        <button type="button" aria-haspopup="dialog" aria-label={t("exerciseMenu", { name: ex.exercise_name })} onClick={onExerciseMenu} className="grid size-11 flex-none cursor-pointer place-items-center rounded-hand text-ink">
          <Icon name="more" size={24} strokeWidth={3.2} />
        </button>
      </div>

      {/* หัวคอลัมน์ ตรงกับแถวด้านล่าง */}
      <div
        aria-hidden="true"
        className={cx(
          "grid items-end gap-2 text-caption text-ink-3",
          ex.track_type === "duration" ? "grid-cols-[2.75rem_minmax(0,1fr)_3rem_3.5rem]" : cols.length === 1 ? "grid-cols-[2.75rem_minmax(0,1fr)_3.5rem]" : cols.length === 2 ? "grid-cols-[2.75rem_repeat(2,minmax(0,1fr))_3.5rem]" : "grid-cols-[2.75rem_repeat(3,minmax(0,1fr))_3.5rem]",
        )}
      >
        <span className="text-center">{t("head.set")}</span>
        {cols.map((f) => {
          const u = unitOfHead(f);
          return (
            <span key={f} className="truncate text-center">
              {t(`field.${fieldKey(f, ex.load_mode)}`)}
              {u ? ` ${unitLabel(u)}` : ""}
              {f === "reps" && unilateral ? <span className="block text-caption">{t("perSide")}</span> : null}
            </span>
          );
        })}
        {ex.track_type === "duration" ? <span /> : null}
        <span />
      </div>

      {sets.map((s) => (
        <SetRow
          key={s.id}
          ex={ex}
          set={s}
          label={labels.get(s.id) ?? ""}
          units={units}
          locale={locale}
          star={(ev.get(s.id)?.records.length ?? 0) > 0}
          stopwatch={stopwatch}
          onTick={(set) => onTick(ex, set)}
          onUntick={(set) => onUntick(ex, set)}
          onValues={(set, v) => onValues(ex, set, v)}
          onMenu={(set) => onSetMenu(ex, set, labels.get(set.id) ?? "")}
          onPlay={(set) => onPlay(ex, set)}
          onStop={onStop}
        />
      ))}
    </section>
  );
}
