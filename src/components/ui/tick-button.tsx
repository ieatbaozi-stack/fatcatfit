import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

type TickButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed" | "aria-label"> & {
  pressed: boolean;
  /** ป้ายอ่านออกเสียง เช่น "เซ็ต 1" (บังคับ — ปุ่มนี้ไม่มีข้อความ) */
  label: string;
};

/**
 * ปุ่ม ✓ ติ๊กเซ็ต (CR4 Studio Minimal): วงกลมสะอาด 56px · ติ๊กแล้ว = เครื่องหมายถูก + พื้นส้ม
 * (ไม่สื่อด้วยสีอย่างเดียว: เครื่องหมายถูกขึ้นเฉพาะตอนติ๊ก)
 */
export function TickButton({ pressed, label, className, type = "button", ...rest }: TickButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      aria-label={label}
      className={cx(
        "group grid size-14 flex-none cursor-pointer place-items-center rounded-full border-2 border-line-strong bg-paper-2 text-on-accent transition-[transform,background-color,border-color] duration-150",
        "aria-pressed:border-transparent aria-pressed:bg-accent",
        "enabled:active:scale-95",
        "disabled:cursor-not-allowed disabled:opacity-35",
        className,
      )}
      {...rest}
    >
      <Icon name="check" size={24} strokeWidth={3} className="opacity-0 transition-opacity duration-150 group-aria-pressed:opacity-100" />
    </button>
  );
}
