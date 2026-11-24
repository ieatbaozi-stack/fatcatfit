import type { ReactNode } from "react";
import { Cat, type CatPose } from "@/components/doodle";

/** หน้าว่าง (CR4 Studio Minimal): ภาพแมว + ประโยคสั้น + ปุ่มเดียว */
export function EmptyState({ pose, children, action }: { pose: CatPose; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-12 text-center">
      <Cat pose={pose} size={168} motion className="text-ink" />
      <p className="max-w-72 text-body text-ink-2">{children}</p>
      {action}
    </div>
  );
}

/** หัวข้อหน้า (h1) — ทุกหน้ามีหนึ่งอัน */
export function PageHeader({ title, eyebrow }: { title: string; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-0.5">
      {eyebrow}
      <h1 className="text-page">{title}</h1>
    </header>
  );
}
