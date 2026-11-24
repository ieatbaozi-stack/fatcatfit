import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  pressed: boolean;
};

/** ชิป (CR4 Studio Minimal): มุมโค้ง 10px สูง ≥ 44px · เลือกอยู่ = พื้นหมึกตัวอักษรพื้น · ไม่เลือก = พื้นรองขอบบาง 1px */
export function Chip({ pressed, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx(
        "inline-flex min-h-11 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-box border px-3.5 text-body transition-transform duration-100 enabled:active:scale-[0.97]",
        pressed ? "border-ink bg-ink font-medium text-paper" : "border-line bg-paper-2 font-normal text-ink",
        "disabled:cursor-not-allowed disabled:border-dashed disabled:border-line-strong disabled:bg-transparent disabled:text-ink-3",
        className,
      )}
      {...rest}
    />
  );
}
