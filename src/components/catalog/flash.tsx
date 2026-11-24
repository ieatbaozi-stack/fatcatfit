"use client";
// ข้อความลอยที่ข้ามหน้าได้ + ปุ่ม "เลิกทำ" (UX 12.4 สถานะ "สำเร็จ")
// ฟอร์มบันทึกเสร็จ → queueFlash แล้วกลับจอค้น · จอค้นอ่านตอน mount แล้วแสดง

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getLocalView, writeEntity } from "@/lib/offline/client";

export type FlashKey = "saved" | "archived" | "unarchived" | "deleted" | "added" | "actionFailed";
/** undo ที่ข้ามหน้าได้ต้องเก็บเป็นข้อมูล (ออฟไลน์แตะแท็บ = โหลดทั้งหน้า · ADR 0005 กติกา 6) — ชนิดที่รู้จักอยู่ใน runUndo */
export type UndoAction = { type: "unarchiveExercise"; id: string };
/** undo รับ show ของหน้าที่แสดงข้อความอยู่ (ฟอร์มปิดไปแล้ว) ไว้แจ้งผลตอนเลิกทำไม่สำเร็จ */
/** text = ข้อความเฉพาะกรณี (แทนข้อความตาม key) · undo เป็นฟังก์ชัน (ในหน้าเดียวกัน) หรือ UndoAction (ข้ามหน้า) */
export type Flash = { key: FlashKey; text?: string; undo?: ((show: (f: Flash) => void) => void) | UndoAction };
/** ข้อความที่ฝากข้ามหน้า (เก็บใน sessionStorage ได้ จึงมีเฉพาะข้อมูลล้วน) */
export type QueuedFlash = { key: FlashKey; text?: string; undo?: UndoAction };

const SHORT_MS = 3000;
const UNDO_MS = 5000;
const QUEUE_KEY = "fcf:flash";

// สำรองในหน่วยความจำเมื่อ sessionStorage ใช้ไม่ได้ (โหมดส่วนตัว/ถูกบล็อก)
let memoryPending: QueuedFlash | null = null;

/** ฝากข้อความไว้ให้หน้าถัดไปแสดง (ใช้ก่อน router.back/replace) — เก็บใน sessionStorage รอดการโหลดหน้าใหม่ */
export function queueFlash(f: QueuedFlash): void {
  memoryPending = f;
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(f));
  } catch {
    // ใช้ตัวสำรองในหน่วยความจำ
  }
}

const isQueuedFlash = (v: unknown): v is QueuedFlash => {
  if (!v || typeof v !== "object") return false;
  const f = v as QueuedFlash;
  if (typeof f.key !== "string") return false;
  return f.undo === undefined || (typeof f.undo === "object" && f.undo.type === "unarchiveExercise" && typeof f.undo.id === "string");
};

export function takeFlash(): QueuedFlash | null {
  let f: QueuedFlash | null = memoryPending;
  memoryPending = null;
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    sessionStorage.removeItem(QUEUE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isQueuedFlash(parsed)) f = parsed;
    }
  } catch {
    // ข้อความเสีย/ใช้ storage ไม่ได้ — ใช้ที่ค้างในหน่วยความจำ (ถ้ามี)
  }
  return f;
}

/** เลิกทำที่ข้ามหน้าได้: ทำงานผ่านคิวเหมือนการเขียนปกติ · ล้ม = แจ้ง "ทำไม่สำเร็จ" */
async function runUndo(a: UndoAction, show: (f: Flash) => void): Promise<void> {
  if (a.type === "unarchiveExercise") {
    const row = getLocalView().myExercises.find((e) => e.id === a.id);
    const r = row
      ? await writeEntity("exercise", a.id, {
          name: row.name,
          track_type: row.track_type,
          load_mode: row.load_mode,
          is_unilateral: row.is_unilateral,
          category: row.category,
          equipment: row.equipment,
          archived_at: null,
        })
      : null;
    if (!r || !r.ok) show({ key: "actionFailed" });
  }
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
                if (typeof undo === "function") undo(show);
                else if (undo) void runUndo(undo, show);
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
