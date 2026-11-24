import { cx } from "./cx";

/**
 * จุดเด้ง 3 จุดตอนโหลด (CR4 · boss อนุมัติ 2026-11-25)
 * ใช้ Pure CSS keyframes (ไม่ใช้ SVG id เพื่อกัน id ชนเมื่อมีหลายจุด และหยุดอัตโนมัติตาม prefers-reduced-motion)
 * ใส่ label เมื่อวางเดี่ยว (role="status") · ไม่ใส่ label เมื่อวางคู่ข้อความ เช่นใน <Button loading> (aria-hidden)
 */
export function LoadingDots({
  size = "sm",
  label,
  className,
}: {
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const dot = size === "md" ? "size-1.5" : "size-1.25";
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx("inline-flex items-center gap-1 align-middle", className)}
    >
      <span className={cx("fcf-dot rounded-full bg-current", dot)} />
      <span className={cx("fcf-dot fcf-dot-2 rounded-full bg-current", dot)} />
      <span className={cx("fcf-dot fcf-dot-3 rounded-full bg-current", dot)} />
    </span>
  );
}
