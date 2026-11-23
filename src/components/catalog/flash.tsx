"use client";
// ข้อความลอยที่ข้ามหน้าได้ + ปุ่ม "เลิกทำ" (UX 12.4 สถานะ "สำเร็จ")
// ฟอร์มบันทึกเสร็จ → queueFlash แล้วกลับจอค้น · จอค้นอ่านตอน mount แล้วแสดง

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export type FlashKey = "saved" | "archived" | "unarchived" | "deleted" | "added" | "actionFailed";
/** undo รับ show ของหน้าที่แสดงข้อความอยู่ (ฟอร์มปิดไปแล้ว) ไว้แจ้งผลตอนเลิกทำไม่สำเร็จ */
/** text = ข้อความเฉพาะกรณี (แทนข้อความตาม key) */
export type Flash = { key: FlashKey; text?: string; undo?: (show: (f: Flash) => void) => void };

const SHORT_MS = 3000;
const UNDO_MS = 5000;

let pending: Flash | null = null;

/** ฝากข้อความไว้ให้หน้าถัดไปแสดง (ใช้ก่อน router.back/replace) */
export function queueFlash(f: Flash): void {
  pending = f;
}

export function takeFlash(): Flash | null {
  const f = pending;
  pending = null;
  return f;
}

/**
 * คืน [โหนดที่ต้อง render, ฟังก์ชันแสดง] · consume=true จะหยิบข้อความที่ฝากไว้ตอน mount
 * ช่อง live region (`role="status"`) อยู่ตลอด ข้อความเปลี่ยนแล้วโปรแกรมอ่านจอจะอ่านเอง
 */
export function useFlash(consume = false): [React.ReactNode, (f: Flash) => void] {
  const t = useTranslations("toast");
  const [flash, setFlash] = useState<Flash | null>(null);

  const show = useCallback((f: Flash) => setFlash({ ...f }), []);

  // ตัวนับเวลาผูกกับข้อความที่แสดงอยู่ (ข้อความใหม่ = นับใหม่ · StrictMode รัน effect ซ้ำก็ยังนับครบ)
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), flash.undo ? UNDO_MS : SHORT_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!consume) return;
    const f = takeFlash();
    // ข้อความที่ฝากไว้จากหน้าก่อน — แสดงครั้งเดียวตอนเปิดหน้า (StrictMode: รอบแรกหยิบไปแล้ว รอบสองได้ null แต่ state ยังอยู่)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f) show(f);
  }, [consume, show]);

  const node = (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-44 z-30 flex justify-center px-5">
      {flash ? (
        <div className="pointer-events-auto flex max-w-100 items-center gap-1 rounded-hand border-draw border-ink bg-paper py-1 pr-2 pl-4">
          <p className="py-1 text-body text-ink">{flash.text ?? t(flash.key)}</p>
          {flash.undo ? (
            <button
              type="button"
              className="inline-flex min-h-11 cursor-pointer items-center px-3 text-body text-ink underline-hand"
              onClick={() => {
                const undo = flash.undo;
                setFlash(null);
                undo?.(show);
              }}
            >
              {t("undo")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  return [node, show];
}
