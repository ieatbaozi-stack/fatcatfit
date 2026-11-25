// ตรรกะบริสุทธิ์ของแถบสถานะการส่ง (UX 13.1) — ข้อบนชนะ · N = จำนวนแถวข้อมูลที่ค้าง (นับโดย pwa-offline)

import type { SyncStatus } from "@/lib/offline/types";

export type BarKind =
  | "authNeeded"
  | "storage"
  | "rejected"
  | "stale"
  | "offlinePending"
  | "offline"
  | "pending"
  | "sending"
  | "done";

export type BarState = { kind: BarKind; count: number };

/** ค้างเกินนี้ + ออฟไลน์ = เตือน (PRD ข้อ 8 · iOS อาจล้างข้อมูลในเครื่อง) */
export const STALE_MS = 24 * 60 * 60 * 1000;
/** กำลังส่งนานเกินนี้ถึงแสดง "กำลังส่ง" */
export const SENDING_AFTER_MS = 1000;
/** "ส่งครบแล้ว" ค้างไว้ */
export const DONE_MS = 2000;

/**
 * แถบที่ต้องแสดงตอนนี้ (null = ไม่มีแถบ) — ตารางข้อ 1–8 ของ UX 13.1
 * offline = ไม่มีเน็ต (navigator หรือ /api/me ถามไม่ถึง) · now = epoch ms
 */
export function barOf(s: SyncStatus, offline: boolean, now: number): BarState | null {
  if (s.phase === "auth_required") return { kind: "authNeeded", count: s.pending };
  if (s.storageError) return { kind: "storage", count: s.pending };
  if (s.rejected > 0) return { kind: "rejected", count: s.rejected };
  if (offline && s.pending > 0 && s.oldestPendingAt !== null && now - s.oldestPendingAt > STALE_MS) return { kind: "stale", count: s.pending };
  if (offline && s.pending > 0) return { kind: "offlinePending", count: s.pending };
  if (offline) return { kind: "offline", count: 0 };
  if (s.phase === "retry_wait" && s.pending > 0) return { kind: "pending", count: s.pending };
  if (s.phase === "blocked" && s.pending > 0) return { kind: "pending", count: s.pending };
  if (s.phase === "syncing" && s.syncingSince !== null && now - s.syncingSince > SENDING_AFTER_MS) return { kind: "sending", count: s.pending };
  if (s.lastDrainedAt !== null && s.pending === 0 && now - s.lastDrainedAt < DONE_MS && now >= s.lastDrainedAt) return { kind: "done", count: 0 };
  return null;
}

/** ต้องเดินนาฬิกาไหม (มีเวลาที่ขึ้นกับ "ตอนนี้") */
export function barNeedsClock(s: SyncStatus, now: number): boolean {
  return s.syncingSince !== null || s.oldestPendingAt !== null || (s.lastDrainedAt !== null && now - s.lastDrainedAt < DONE_MS + 500);
}
