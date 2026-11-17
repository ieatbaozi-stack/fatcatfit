import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** กำลังส่ง: ปิดการกดซ้ำ + aria-busy (ข้อความ "กำลังส่ง…" ผู้เรียกใส่เอง) */
  loading?: boolean;
};

/** class ของปุ่มหลัก (ใช้ร่วมกับลิงก์ที่หน้าตาเป็นปุ่ม) */
export const buttonClass = cx(
  "inline-flex min-h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-hand border-draw border-ink bg-paper px-4 text-body font-medium text-ink transition-[transform,background-color] duration-150",
  "active:translate-y-0.5 active:bg-accent active:text-on-accent",
);

/**
 * ปุ่มหลัก: กรอบวาดมือหนา พื้นขาว ตัวหนังสือดำ · กดแล้วเยื้องลง 2px + พื้นส้ม
 * data-pressed="true" ใช้แสดงสถานะกดค้าง (styleguide)
 */
export function Button({ className, loading = false, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex min-h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-hand border-draw border-ink bg-paper px-4 text-body font-medium text-ink transition-[transform,background-color] duration-150",
        "enabled:active:translate-y-0.5 enabled:active:bg-accent enabled:active:text-on-accent",
        "data-[pressed=true]:translate-y-0.5 data-[pressed=true]:bg-accent data-[pressed=true]:text-on-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    />
  );
}

/** ปุ่มรอง: ตัวหนังสือ + ขีดเส้นใต้วาดมือ ไม่มีกรอบ */
export function TextButton({ className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-11 cursor-pointer items-center justify-center px-3 text-body font-normal text-ink underline-hand",
        "disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  );
}
