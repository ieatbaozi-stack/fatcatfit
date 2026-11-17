import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  pressed: boolean;
};

/** ชิป: วงรีวาดมือ · เลือกอยู่ = พื้นดำตัวหนังสือขาว (ไม่ใช่ส้ม) · ปุ่มสลับ aria-pressed */
export function Chip({ pressed, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx(
        "inline-flex min-h-11 flex-none cursor-pointer items-center gap-1 whitespace-nowrap rounded-hand border-draw-thin border-ink px-3.5 text-body font-normal",
        pressed ? "bg-ink text-paper" : "bg-transparent text-ink",
        "disabled:cursor-not-allowed disabled:border-dashed disabled:text-ink-3",
        className,
      )}
      {...rest}
    />
  );
}
