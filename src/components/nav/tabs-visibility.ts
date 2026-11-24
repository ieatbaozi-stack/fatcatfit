"use client";
// ฟอร์มท่า (สร้าง/แก้) ไม่มีแถบล่าง (UX 12.1) — แต่ซ่อนเฉพาะตอนฟอร์มแสดงจริง ไม่ใช่ตาม URL
// เปิด URL ฟอร์มตอนออฟไลน์ SW ถอยไป app shell (เนื้อหาหน้าหลัก) ฟอร์มไม่ render → แถบล่างต้องยังอยู่ ไม่งั้นไม่มีทางออก

import { useEffect, useSyncExternalStore } from "react";

let hiders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** เรียกในฟอร์ม: ซ่อนแถบล่างตราบที่ component นี้ยัง mount */
export function useHideTabs(): void {
  useEffect(() => {
    hiders += 1;
    emit();
    return () => {
      hiders -= 1;
      emit();
    };
  }, []);
}

export function useTabsHidden(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => hiders > 0,
    () => false,
  );
}
