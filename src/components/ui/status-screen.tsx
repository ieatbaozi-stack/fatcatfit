import Link from "next/link";
import type { ReactNode } from "react";
import { Cat, type CatPose } from "@/components/doodle";
import { buttonClass } from "./button";
import { cx } from "./cx";

/**
 * หน้าสถานะเต็มจอ (404 / error): แมวนิ่ง + ประโยคเดียว + ปุ่ม
 * ไม่ใช้ wiggle (แมวของ CR1 อยู่ในอีกรอบ) · ประโยคเป็น h1 เพราะหน้านี้ไม่มีหัวอื่น
 */
export function StatusScreen({ pose, title, children }: { pose: CatPose; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-12 text-center">
      <Cat pose={pose} size={176} className="text-ink" />
      <h1 className="max-w-72 text-section text-ink">{title}</h1>
      <div className="flex w-full max-w-72 flex-col gap-3">{children}</div>
    </div>
  );
}

/** ลิงก์หน้าตาเป็นปุ่ม (ปุ่มหลัก = กรอบหนา · รอง = ขีดเส้นใต้) */
export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: "primary" | "text"; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(variant === "primary" ? buttonClass : "inline-flex min-h-11 items-center justify-center px-3 text-body underline-hand", className)}>
      {children}
    </Link>
  );
}
