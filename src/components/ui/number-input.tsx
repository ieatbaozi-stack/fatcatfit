"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { clamp, decimalsOf, formatNumber, parseNumber, stepValue } from "./number-field";
import { cx } from "./cx";
import { Icon } from "./icon";

type NumberInputProps = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** ขนาดก้าวของ +/− (เช่น 2.5 กก., 1 ครั้ง) */
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  placeholder?: string;
  hint?: string;
  /** ตัวเลขใหญ่ (44px) สำหรับช่องหลักของหน้าจด */
  big?: boolean;
  disabled?: boolean;
};

/**
 * ช่องตัวเลขพร้อมปุ่ม −/+ : พิมพ์ได้ (inputmode ตามชนิดเลข) หรือกดปุ่ม · ไม่ใช้ dropdown
 * ตัวเลข ≥ 16px (กัน iOS ซูม) · ปุ่ม 48px
 */
export function NumberInput({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  placeholder,
  hint,
  big = false,
  disabled = false,
}: NumberInputProps) {
  const t = useTranslations("ui");
  const id = useId();
  const decimals = decimalsOf(step);
  // draft = ข้อความที่กำลังพิมพ์ (null = ไม่ได้พิมพ์ แสดงค่าจริง)
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNumber(value, decimals);

  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;

  function handleType(text: string) {
    setDraft(text);
    if (text.trim() === "") return onChange(null);
    const parsed = parseNumber(text);
    if (parsed !== null) onChange(parsed);
  }

  function handleBlur() {
    if (draft !== null) {
      const parsed = parseNumber(draft);
      if (parsed !== null) onChange(clamp(parsed, min, max));
    }
    setDraft(null);
  }

  const stepButton = (direction: 1 | -1) => (
    <button
      type="button"
      disabled={disabled || (direction === 1 ? atMax : atMin)}
      aria-label={`${direction === 1 ? t("increase") : t("decrease")} ${label}`}
      onClick={() => {
        setDraft(null);
        onChange(stepValue(value, direction, step, min, max));
      }}
      className="grid size-12 flex-none cursor-pointer place-items-center rounded-blob border-draw border-ink bg-transparent text-ink enabled:active:translate-y-0.5 enabled:active:bg-accent enabled:active:text-on-accent disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Icon name={direction === 1 ? "plus" : "minus"} size={22} strokeWidth={2.4} />
    </button>
  );

  return (
    <div>
      <label htmlFor={id} className="block text-caption text-ink-3">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-3">
        {stepButton(-1)}
        <div className="flex min-w-0 flex-1 items-baseline justify-center rounded-underline border-b-2 border-ink">
          <input
            id={id}
            type="text"
            inputMode={decimals > 0 ? "decimal" : "numeric"}
            enterKeyHint="done"
            autoComplete="off"
            value={shown}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => handleType(e.target.value)}
            onBlur={handleBlur}
            className={cx(
              "num min-h-11 w-full min-w-0 appearance-none rounded-none border-0 bg-transparent p-0 text-center placeholder:font-light placeholder:text-ink-3",
              big ? "text-numeral-lg" : "text-numeral",
            )}
          />
          {unit ? <span className="ml-1 flex-none text-caption text-ink-3">{unit}</span> : null}
        </div>
        {stepButton(1)}
      </div>
      {hint ? <p className="mt-1 text-caption text-ink-3">{hint}</p> : null}
    </div>
  );
}
