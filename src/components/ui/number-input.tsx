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
  /** ข้อผิดพลาดใต้ช่อง (ขอบ --warn + ข้อความ --warn · แทน hint) */
  error?: string | null;
  /** ค่าที่ปุ่ม −/+ เริ่มจากเมื่อช่องว่าง (ไม่ใส่ = เริ่มจาก min หรือ 0) */
  startAt?: number;
  /** เรียกเมื่อออกจากช่อง */
  onBlur?: () => void;
  /** ตัวเลขใหญ่ (44px) สำหรับช่องหลักของหน้าจด */
  big?: boolean;
  disabled?: boolean;
};

/**
 * ช่องตัวเลขพร้อมปุ่ม −/+ (CR4 Studio Minimal): พิมพ์ได้หรือกดปุ่ม · ไม่ใช้ dropdown
 * ตัวเลข ≥ 16px (กัน iOS ซูม) · ปุ่มวงกลมสะอาด 48px
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
  error,
  startAt,
  onBlur,
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
    onBlur?.();
  }

  const stepButton = (direction: 1 | -1) => (
    <button
      type="button"
      disabled={disabled || (direction === 1 ? atMax : atMin)}
      aria-label={`${direction === 1 ? t("increase") : t("decrease")} ${label}`}
      onClick={() => {
        setDraft(null);
        onChange(value === null && startAt !== undefined ? startAt : stepValue(value, direction, step, min, max));
      }}
      className="grid size-12 flex-none cursor-pointer place-items-center rounded-full border border-line bg-paper-2 text-ink transition-[transform,background-color] duration-150 enabled:active:scale-95 enabled:active:bg-accent enabled:active:text-on-accent disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Icon name={direction === 1 ? "plus" : "minus"} size={20} strokeWidth={2.2} />
    </button>
  );

  return (
    <div>
      <label htmlFor={id} className="block text-caption font-medium text-ink-2">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2.5">
        {stepButton(-1)}
        <div
          className={cx(
            "flex min-w-0 flex-1 items-baseline justify-center rounded-hand border bg-paper-2 px-3 py-1 transition-colors duration-150 focus-within:bg-paper",
            error ? "border-warn" : "border-line focus-within:border-line-strong",
          )}
        >
          <input
            id={id}
            aria-invalid={error ? true : undefined}
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
              "num min-h-11 w-full min-w-0 appearance-none rounded-none border-0 bg-transparent p-0 text-center placeholder:font-normal placeholder:text-ink-3",
              big ? "text-numeral-lg" : "text-numeral",
            )}
          />
          {unit ? <span className="ml-1 flex-none text-caption text-ink-3">{unit}</span> : null}
        </div>
        {stepButton(1)}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-caption text-warn">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-caption text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
