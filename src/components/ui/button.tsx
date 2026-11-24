import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cx } from "./cx";
import { LoadingDots } from "./loading-dots";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** กำลังส่ง: ปิดการกดซ้ำ + aria-busy + แสดงจุดเด้ง 3 จุดท้ายข้อความ */
  loading?: boolean;
  /** primary = ปุ่มหลักทึบ · tonal = พื้นรอง · danger = ลบ/เพิกถอน */
  variant?: "primary" | "tonal" | "danger";
};

/** class ของปุ่มหลัก (ใช้ร่วมกับลิงก์ที่หน้าตาเป็นปุ่ม) */
export const buttonClass = cx(
  "inline-flex min-h-13 w-full cursor-pointer items-center justify-center gap-2.5 rounded-hand bg-ink px-5 text-body font-medium text-paper transition-[transform,opacity,background-color] duration-150",
  "active:scale-[0.985] active:bg-accent active:text-on-accent",
);

/**
 * ปุ่มหลัก (CR4 Studio Minimal): พื้นทึบคมชัด มุมโค้ง 12px สูง 52px · กดแล้วส้มชั่วขณะ + ยุบเบาๆ
 * ปุ่มลบที่ส่ง border-warn / text-warn เข้ามาจะเปลี่ยนพื้นเป็น --paper อัตโนมัติเพื่อให้คอนทราสต์ผ่านทั้งสว่างและมืด
 * data-pressed="true" ใช้แสดงสถานะกดค้าง (styleguide)
 */
export function Button({
  className,
  loading = false,
  variant = "primary",
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const isDanger = variant === "danger" || (typeof className === "string" && /\b(?:border|text)-warn\b/.test(className));
  const tone = isDanger
    ? "border border-warn bg-paper text-warn enabled:active:bg-paper-2"
    : variant === "tonal"
      ? "border border-line bg-paper-2 text-ink enabled:active:bg-surface-2"
      : "bg-ink text-paper enabled:active:bg-accent enabled:active:text-on-accent data-[pressed=true]:bg-accent data-[pressed=true]:text-on-accent";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex min-h-13 w-full cursor-pointer items-center justify-center gap-2.5 rounded-hand px-5 text-body font-medium transition-[transform,opacity,background-color] duration-150",
        tone,
        "enabled:active:scale-[0.985] data-[pressed=true]:scale-[0.985]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
      {loading ? <LoadingDots size="sm" /> : null}
    </button>
  );
}

/** ปุ่มรอง (CR4 Studio Minimal): พื้นรอง Tonal มุมโค้ง 12px สูง ≥ 44px — ดูออกทันทีว่ากดได้ ไม่มีเส้นยึกยือ */
export function TextButton({ className, type = "button", ...rest }: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-hand border border-line bg-paper-2 px-4 text-body font-medium text-ink transition-[transform,opacity,background-color] duration-150",
        "enabled:active:scale-[0.985] enabled:active:bg-surface-2",
        "disabled:cursor-not-allowed disabled:text-ink-3 disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}
