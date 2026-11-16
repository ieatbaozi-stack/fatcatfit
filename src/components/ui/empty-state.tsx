import type { ReactNode } from "react";
import { Cat, type CatPose } from "@/components/doodle";

/** หน้าว่าง: ภาพแมว + ประโยคเดียว (ปุ่มเดียวใส่ใน children ของ action ได้ในรอบฟีเจอร์) */
export function EmptyState({ pose, children, action }: { pose: CatPose; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-12 text-center">
      <Cat pose={pose} size={176} wiggle className="text-ink" />
      <p className="max-w-72 text-body text-ink-2">{children}</p>
      {action}
    </div>
  );
}

/** หัวข้อหน้า (h1) — ทุกหน้ามีหนึ่งอัน */
export function PageHeader({ title, eyebrow }: { title: string; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      {eyebrow}
      <h1 className="text-page">{title}</h1>
    </header>
  );
}
