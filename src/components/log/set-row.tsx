"use client";
// แถวเซ็ตในหน้าจด (UX 3–4 · 13.5): เลขเซ็ต · ช่องค่าตามชนิดการจด · ✓ 56px · ▶ จับเวลา (ท่าเวลา)
// - ค่าที่แสดง = ร่าง · แก้ไม่ผ่านช่วงค่า (D4) เก็บไว้ในแถวก่อน (local) ไม่เขียนลงร่าง/คิว · ✓ ปิดจนกว่าจะแก้ให้ถูก
// - ส้มของจอ = ✓ ที่ติ๊กแล้วเท่านั้น (UX 6) · ดาวสถิติเป็นเส้นดำ

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { TickButton } from "@/components/ui/tick-button";
import type { ActiveSessionDraft, DraftExercise, DraftSet, SetValues } from "@/lib/offline/session";
import { formatClock, stopwatchElapsedS } from "@/lib/offline/timer";
import { SET_RANGES, type SetField } from "@/lib/data/shared/workout";
import {
  canTick,
  columnsOf,
  decimalsOfField,
  estimatedDistance,
  fieldErrors,
  fieldKey,
  fmtNum,
  getField,
  hasRequired,
  needOf,
  paceOf,
  setField,
  stepOf,
  unitLabel,
  unitOf,
  valuesOfDraft,
  visibleErrors,
  type DisplayUnits,
} from "./set-logic";
import { useNow } from "./use-now";
import { ValueEditor } from "./value-editor";

type Props = {
  ex: DraftExercise;
  set: DraftSet;
  /** เลขเซ็ตที่แสดง ("W" = วอร์มอัพ) */
  label: string;
  units: DisplayUnits;
  locale: string;
  star: boolean;
  stopwatch: ActiveSessionDraft["stopwatch"];
  onTick: (set: DraftSet) => void;
  onUntick: (set: DraftSet) => void;
  onValues: (set: DraftSet, values: SetValues) => void;
  onMenu: (set: DraftSet) => void;
  onPlay: (set: DraftSet) => void;
  onStop: () => void;
};

/** คอลัมน์ตามจำนวนช่อง (+ ปุ่ม ▶ ของท่าเวลา) */
function gridClass(cols: number, play: boolean): string {
  if (play) return "grid-cols-[2.5rem_minmax(0,1fr)_3rem_3.5rem]";
  if (cols === 1) return "grid-cols-[2.5rem_minmax(0,1fr)_3.5rem]";
  if (cols === 2) return "grid-cols-[2.5rem_repeat(2,minmax(0,1fr))_3.5rem]";
  return "grid-cols-[2.5rem_repeat(3,minmax(0,1fr))_3.5rem]";
}

export function SetRow({ ex, set, label, units, locale, star, stopwatch, onTick, onUntick, onValues, onMenu, onPlay, onStop }: Props) {
  const t = useTranslations("log");
  const [local, setLocal] = useState<SetValues | null>(null);
  const [editing, setEditing] = useState<SetField | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<SetField>>(new Set());
  const checked = set.completed_at !== null;
  const running = stopwatch !== null && stopwatch.set_id === set.id && stopwatch.stopped_at === null;
  const otherRunning = stopwatch !== null && stopwatch.set_id !== set.id && stopwatch.stopped_at === null;
  const now = useNow(running, 250);
  const v = local ?? valuesOfDraft(set);
  const cols = columnsOf(ex.track_type);
  const fmt = (n: number) => fmtNum(n, locale, 2);
  const errors = fieldErrors(v, ex.track_type, ex.load_mode, units, fmt);
  const shown = visibleErrors(errors, touched);
  const ok = canTick(v, ex.track_type, ex.load_mode, units, fmt);
  const hasPlay = ex.track_type === "duration" && !checked;
  const elapsed = running && stopwatch ? stopwatchElapsedS(stopwatch, now) : 0;
  const capped = running && elapsed >= SET_RANGES.durationS.max;

  // ท่าเวลาจับครบ 24 ชม. หยุดเอง (UX 13.5)
  useEffect(() => {
    if (capped) onStop();
  }, [capped, onStop]);

  function change(f: SetField, n: number | null) {
    const next = setField(v, f, n, units);
    const errs = fieldErrors(next, ex.track_type, ex.load_mode, units, fmt);
    // เซ็ตที่ติ๊กแล้วต้องครบและถูกช่วงก่อนถึงจะเขียนลงคิว · แถวที่ยังไม่ติ๊กขอแค่ไม่นอกช่วง
    const commit = checked ? hasRequired(next, ex.track_type, ex.load_mode) && errs.length === 0 : errs.length === 0;
    if (commit) {
      setLocal(null);
      onValues(set, next);
    } else setLocal(next);
  }

  const headOf = (f: SetField) => t(`field.${fieldKey(f, ex.load_mode)}`);
  const cell = (f: SetField) => {
    const n = getField(v, f);
    const unit = unitOf(v, f, units);
    const required = needOf(ex.track_type, ex.load_mode, f) === "required";
    const bad = shown.some((e) => e.field === f);
    const text = n === null ? "–" : f === "duration" ? formatClock(n) : fmtNum(n, locale, decimalsOfField(f));
    const dense = cols.length === 3;
    if (f === "duration" && running) {
      return (
        <span key={f} className={cx("num flex min-h-12 items-center justify-center border-b-2 border-ink", dense ? "text-section" : "text-numeral")} aria-live="off">
          {formatClock(elapsed)}
        </span>
      );
    }
    return (
      <button
        key={f}
        type="button"
        aria-label={`${headOf(f)} ${n === null ? t("empty") : text}${unit && f !== "duration" ? ` ${unitLabel(unit)}` : ""}`}
        onClick={() => setEditing(f)}
        className={cx(
          "flex min-h-12 min-w-0 cursor-pointer flex-col items-center justify-center border-0 border-b-2 bg-transparent px-0 leading-tight",
          bad ? "border-warn" : checked ? "border-ink" : required ? "border-dashed border-ink-3" : "border-dashed border-ink-3/60",
        )}
      >
        <span className={cx("num max-w-full truncate", dense ? "text-section" : "text-numeral", n === null ? "font-light text-ink-3" : checked ? "text-ink" : "text-ink-2")}>{text}</span>
      </button>
    );
  };

  const extra =
    ex.track_type === "distance_duration" ? paceOf(v) : ex.track_type === "incline_speed_duration" ? (estimatedDistance(v, units) !== null ? `≈ ${fmtNum(estimatedDistance(v, units) ?? 0, locale)} ${unitLabel(units.distance)}` : null) : null;

  return (
    <div className="border-b border-ink-3/20 pb-1">
      <div className={cx("grid items-center gap-2 py-1", gridClass(cols.length, hasPlay))}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={set.set_kind === "warmup" ? t("setMenuWarmup", { n: label }) : t("setMenu", { n: label })}
          onClick={() => onMenu(set)}
          className="flex min-h-11 cursor-pointer flex-col items-center justify-center text-body font-medium text-ink"
        >
          <span className="num">{label}</span>
          {star ? (
            <>
              <Icon name="star" size={14} strokeWidth={2} className="text-ink" />
              <span className="sr-only">{t("record")}</span>
            </>
          ) : null}
        </button>
        {cols.map((f) => cell(f))}
        {hasPlay ? (
          <button
            type="button"
            disabled={otherRunning}
            aria-label={running ? t("stopwatchStop") : t("stopwatchStart")}
            onClick={() => (running ? onStop() : onPlay(set))}
            className="grid size-12 cursor-pointer place-items-center rounded-blob border-draw border-ink bg-transparent text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Icon name={running ? "stop" : "play"} size={20} strokeWidth={2.4} />
          </button>
        ) : null}
        <TickButton
          pressed={checked}
          label={t("tick", { n: label })}
          disabled={checked ? local !== null : !ok || running}
          onClick={() => (checked ? onUntick(set) : onTick(set))}
        />
      </div>
      {extra ? <p className="num ml-10 text-caption text-ink-3">{extra}</p> : null}
      {shown.map((e) => (
        <p key={e.key} role="alert" className="ml-10 text-caption text-warn">
          {t(`range.${e.key}`, e.params)}
        </p>
      ))}
      {editing ? (
        <ValueEditor
          key={editing}
          field={editing}
          label={headOf(editing)}
          value={getField(v, editing)}
          unit={unitOf(v, editing, units)}
          step={stepOf(editing, units, v)}
          onChange={(n) => change(editing, n)}
          onBlur={() => setTouched((s) => new Set(s).add(editing))}
          onDone={() => {
            setTouched((s) => new Set(s).add(editing));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
