"use client";

import { Fragment, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

export type Choice<V extends string> = { value: V; label: string; hint?: string };

type Props<V extends string> = {
  label: string;
  value: V | null;
  options: readonly Choice<V>[];
  onChange: (v: V) => void;
  /** chips = ชิปตัดบรรทัด · list = แถวละตัวเลือก (วงกลมส้ม + ติ๊ก) พร้อมตัวอย่างจางชิดขวา */
  variant: "chips" | "list";
  /** เนื้อหาย่อหน้าใต้ตัวเลือกที่ระบุ (เช่น ถามน้ำหนักตัวใต้ "น้ำหนัก × ครั้ง") — แสดงเฉพาะแบบ list */
  after?: Partial<Record<V, ReactNode>>;
};

/**
 * กลุ่มตัวเลือกเดียว `role="radiogroup"` (UX 12.6 · CR4 Studio Minimal):
 * เลือกทีละอัน · ลูกศรเปลี่ยนตัวเลือก (roving tabindex) · Tab ออกจากกลุ่ม
 */
export function ChoiceGroup<V extends string>({ label, value, options, onChange, variant, after }: Props<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabIndexOf = (i: number) => (value === null ? (i === 0 ? 0 : -1) : options[i].value === value ? 0 : -1);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    const cur = refs.current.findIndex((el) => el === document.activeElement);
    const next = (Math.max(cur, 0) + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={variant === "chips" ? "flex flex-wrap gap-2" : "flex flex-col"}>
      {options.map((o, i) => {
        const on = o.value === value;
        return variant === "chips" ? (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={tabIndexOf(i)}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-box border px-3.5 text-body transition-transform duration-100 active:scale-[0.97]",
              on ? "border-ink bg-ink font-medium text-paper" : "border-line bg-paper-2 font-normal text-ink",
            )}
          >
            {o.label}
          </button>
        ) : (
          <Fragment key={o.value}>
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={tabIndexOf(i)}
              onClick={() => onChange(o.value)}
              className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-line py-2.5 text-left transition-opacity active:opacity-75"
            >
              <Radio on={on} />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                <span className={cx("text-body text-ink", on ? "font-medium" : "font-normal")}>{o.label}</span>
                {o.hint ? <span className="text-caption text-ink-3">{o.hint}</span> : null}
              </span>
            </button>
            {after?.[o.value] ?? null}
          </Fragment>
        );
      })}
    </div>
  );
}

/** วงกลมสะอาด 28px · เลือกแล้ว = พื้นส้ม + เครื่องหมายถูก */
function Radio({ on }: { on: boolean }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid size-7 flex-none place-items-center rounded-full border transition-colors duration-150",
        on ? "border-transparent bg-accent text-on-accent" : "border-line-strong bg-paper-2 text-transparent",
      )}
    >
      <Icon name="check" size={16} strokeWidth={2.8} className={on ? "opacity-100" : "opacity-0"} />
    </span>
  );
}
