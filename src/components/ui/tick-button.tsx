import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

type TickButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed" | "aria-label"> & {
  pressed: boolean;
  /** ป้ายอ่านออกเสียง เช่น "เซ็ต 1" (บังคับ — ปุ่มนี้ไม่มีข้อความ) */
  label: string;
};

/**
 * ปุ่ม ✓ ติ๊กเซ็ต: วงกลมวาดมือ 56px · ติ๊กแล้ว = เครื่องหมายถูก + พื้นส้ม
 * (ไม่สื่อด้วยสีอย่างเดียว: เครื่องหมายถูกขึ้นเฉพาะตอนติ๊ก)
 */
export function TickButton({ pressed, label, className, type = "button", ...rest }: TickButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      aria-label={label}
      className={cx(
        "group grid size-14 flex-none cursor-pointer place-items-center rounded-blob border-draw border-ink bg-transparent text-on-accent",
        "aria-pressed:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-35",
        className,
      )}
      {...rest}
    >
      <Icon name="check" size={26} strokeWidth={3} className="opacity-0 group-aria-pressed:opacity-100" />
    </button>
  );
}
