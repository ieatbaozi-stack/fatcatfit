"use client";
// แก้ค่าในเซ็ต (UX 4 "แก้ค่าในเซ็ต"): ช่องพิมพ์ + ปุ่ม −/+ · ไม่ใช้ dropdown · ตัวเลข ≥ 16px
// ต่างจาก NumberInput กลาง: ไม่ตัดค่าที่เกินช่วงให้เอง (ผู้ใช้เห็นข้อความแล้วแก้เอง · UX 13.5) · ปุ่ม −/+ ปิดเมื่อถึงขอบ
// เวลา: พิมพ์ต่อจากขวา (130 = 1:30)

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { formatNumber, parseNumber, roundTo, decimalsOf } from "@/components/ui/number-field";
import { formatClock } from "@/lib/offline/timer";
import type { SetField } from "@/lib/data/shared/workout";
import { decimalsOfField, durationFromDigits, limitsOf } from "./set-logic";

type Props = {
  field: SetField;
  label: string;
  value: number | null;
  /** หน่วยของช่อง (kg/lb · km/mi · kmh/mph · %) ว่างสำหรับครั้ง/เวลา */
  unit: string;
  step: number;
  onChange: (n: number | null) => void;
  onBlur: () => void;
  onDone: () => void;
};

const STEP_BTN =
  "grid size-12 flex-none cursor-pointer place-items-center rounded-full border border-line bg-paper-2 text-ink transition-[transform,background-color] duration-150 enabled:active:scale-95 enabled:active:bg-accent enabled:active:text-on-accent disabled:cursor-not-allowed disabled:opacity-35";

export function ValueEditor({ field, label, value, unit, step, onChange, onBlur, onDone }: Props) {
  const t = useTranslations("ui");
  const tl = useTranslations("log");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const isTime = field === "duration";
  const decimals = Math.max(decimalsOfField(field), decimalsOf(step));
  const [draft, setDraft] = useState<string | null>(null);
  const lim = limitsOf(field, unit);

  useEffect(() => {
    input.current?.focus();
    input.current?.select?.();
  }, []);

  const shown = draft ?? (isTime ? (value === null ? "" : formatClock(value)) : formatNumber(value, decimals));
  const atMin = value !== null && value <= lim.min;
  const atMax = value !== null && value >= lim.max;

  function type(text: string) {
    if (isTime) {
      setDraft(null);
      onChange(durationFromDigits(text));
      return;
    }
    setDraft(text);
    if (text.trim() === "") return onChange(null);
    const parsed = parseNumber(text);
    if (parsed !== null) onChange(parsed);
  }

  function nudge(direction: 1 | -1) {
    setDraft(null);
    if (value === null) return onChange(direction === 1 ? Math.max(step, lim.min) : null);
    const next = roundTo(value + direction * step, Math.max(decimals, decimalsOf(value)));
    // เวลา: ก้าว −15 ถึงขอบล่าง = เหลือ 1 วิ · ช่องอื่นไม่ล้ำขอบด้วยปุ่ม
    onChange(Math.min(lim.max, Math.max(isTime ? lim.min : lim.min, next)));
  }

  const stepName = unit && !isTime ? `${label} ${unit}` : label;

  return (
    <div className="flex items-end gap-2 py-2">
      <button type="button" disabled={atMin || value === null} aria-label={`${t("decrease")} ${stepName}`} onClick={() => nudge(-1)} className={STEP_BTN}>
        <Icon name="minus" size={22} strokeWidth={2.4} />
      </button>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-center text-caption text-ink-3">
          {label}
          {unit && !isTime ? ` (${unit === "kmh" ? "km/h" : unit})` : ""}
        </label>
        <input
          id={id}
          ref={input}
          type="text"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          enterKeyHint="done"
          autoComplete="off"
          value={shown}
          placeholder={isTime ? "0:00" : "–"}
          onChange={(e) => type(e.target.value)}
          onBlur={() => {
            setDraft(null);
            onBlur();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onDone();
          }}
          className="num min-h-12 w-full min-w-0 appearance-none rounded-none border-0 border-b-2 border-ink bg-transparent p-0 text-center text-numeral placeholder:font-light placeholder:text-ink-3"
        />
      </div>
      <button type="button" disabled={atMax} aria-label={`${t("increase")} ${stepName}`} onClick={() => nudge(1)} className={STEP_BTN}>
        <Icon name="plus" size={22} strokeWidth={2.4} />
      </button>
      <button type="button" onClick={onDone} className="inline-flex min-h-12 flex-none cursor-pointer items-center px-2 text-body text-ink underline-hand">
        {tl("done")}
      </button>
    </div>
  );
}
