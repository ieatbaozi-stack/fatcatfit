import Link from "next/link";
import type { ReactNode } from "react";
import { Cat, type CatPose } from "@/components/doodle";
import { buttonClass } from "./button";
import { cx } from "./cx";

/**
 * หน้าสถานะเต็มจอ (404 / error): แมวนิ่ง + ประโยคเดียว + ปุ่ม
 */
export function StatusScreen({ pose, title, children }: { pose: CatPose; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-12 text-center">
      <Cat pose={pose} size={168} className="text-ink" />
      <h1 className="max-w-72 text-section text-ink">{title}</h1>
      <div className="flex w-full max-w-72 flex-col gap-3">{children}</div>
    </div>
  );
}

/** ลิงก์หน้าตาเป็นปุ่ม (primary = ปุ่มทึบหลัก · text = ปุ่มรองพื้นรอง Tonal ไม่มีเส้นหยัก) */
export function ButtonLink({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: "primary" | "text";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        variant === "primary"
          ? cx(buttonClass, "no-underline")
          : "inline-flex min-h-11 min-w-11 items-center justify-center rounded-hand border border-line bg-paper-2 px-4 text-body font-medium text-ink no-underline transition-opacity active:opacity-80",
        className,
      )}
    >
      {children}
    </Link>
  );
}
