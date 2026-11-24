"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Cat, type CatPose } from "@/components/doodle";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { useKeyboardInset } from "@/components/ui/use-keyboard-inset";

/** หัวหน้าย่อยของ "ฉัน": ‹ กลับ /me + h1 (UX 12.1) */
export function SubPageHeader({ title, backHref = "/me" }: { title: string; backHref?: string }) {
  const t = useTranslations("me");
  return (
    <header className="flex items-center gap-1">
      <Link href={backHref} aria-label={t("back")} className="-ml-3 grid size-11 flex-none place-items-center rounded-hand text-ink no-underline">
        <Icon name="back" size={26} />
      </Link>
      <h1 className="min-w-0 text-page">{title}</h1>
    </header>
  );
}

/** หน้าสถานะเต็มส่วนเนื้อหา: แมว (#14 รอ · #23 งง · #24 เน็ตหลุด) + หัวข้อ + คำอธิบาย + ปุ่ม */
export function CatState({ pose, title, body, children }: { pose: CatPose; title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-10 text-center">
      <Cat pose={pose} size={150} className="text-ink" />
      <p role="status" className="max-w-72 text-section text-ink">
        {title}
      </p>
      {body ? <p className="max-w-72 text-body text-ink-2">{body}</p> : null}
      <div className="mt-3 flex w-full max-w-72 flex-col gap-3">{children}</div>
    </div>
  );
}

/** แถบปุ่มหลักลอยเหนือแถบล่าง (ครึ่งล่างของจอ) — มีแป้นพิมพ์ = ลอยเหนือแป้นพิมพ์ (visualViewport) */
export function BottomBar({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  const kb = useKeyboardInset();
  return (
    <div
      style={kb > 0 ? { bottom: kb } : undefined}
      className={cx("fixed inset-x-0 z-10 mx-auto flex w-full max-w-120 flex-col gap-2 bg-paper px-5 pt-2 pb-3", kb > 0 ? "bottom-0" : tabs ? "bottom-24" : "bottom-0")}
    >
      {children}
    </div>
  );
}

/** ลิงก์หน้าตาเป็นปุ่มหลัก หรือปุ่มปิด (เมื่อ disabled) */
export function PrimaryLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled="true" role="link" className={cx(buttonClass, "cursor-not-allowed border-dashed opacity-40")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cx(buttonClass, "no-underline")}>
      {children}
    </Link>
  );
}

export function Skeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center border-b border-ink-3/20 py-2">
          <div className="h-5 w-3/5 rounded-box bg-paper-2" />
        </div>
      ))}
    </div>
  );
}
