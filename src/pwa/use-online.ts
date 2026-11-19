"use client";
// ตัวตรวจเน็ตตัวเดียวของแอป (ADR 0006 ข้อ 3 และงานของ pwa-offline) — AuthGate แถบ "เน็ตหลุด" และแถวภาษาใช้ร่วมกัน
// อิง navigator.onLine + เหตุการณ์ online/offline ของ window
// ข้อจำกัด: onLine = true ไม่ได้แปลว่าถึงเซิร์ฟเวอร์ได้จริง (เช่น Wi-Fi ที่ไม่มีเน็ต) → ผู้เรียกที่ยิง fetch
// ต้องถือว่า fetch reject = ออฟไลน์ด้วย (ตาราง ADR 0006 ข้อ 3) · R3 อาจเพิ่มผลจาก sync เข้ามาที่ตัวนี้โดยคง signature
import { useSyncExternalStore } from "react";

export function subscribeOnline(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** สถานะปัจจุบัน · ไม่มี navigator (SSR/worker แปลก) = ถือว่าออนไลน์ */
export function readOnline(): boolean {
  return typeof navigator === "undefined" || typeof navigator.onLine !== "boolean" ? true : navigator.onLine;
}

/** SSR และตอน hydrate คืน `true` เสมอ (HTML เหมือนกันทุกสถานะ — ADR 0005 กติกา 1) แล้วอัปเดตตามจริงหลัง hydrate */
const serverSnapshot = () => true;

/** `true` = ออนไลน์ · เปลี่ยนเมื่อเบราว์เซอร์ยิง `online`/`offline` */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, readOnline, serverSnapshot);
}
