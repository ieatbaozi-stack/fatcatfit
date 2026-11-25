// ชนิดข้อมูลของคิวออฟไลน์ (ADR 0004 ข้อ 2–3) — ไม่มี I/O
// เซิร์ฟเวอร์คือต้นฉบับ · ในเครื่องเป็นคิวพัก + ภาพล่าสุดจาก bootstrap (อ่านอย่างเดียว) + ร่างเซสชันที่เล่นอยู่

import type { PushRejectCode } from "@/lib/data/shared/sync";

/** entity ที่ส่งผ่านคิวได้ใน R3a (R3b เพิ่ม `profile`) */
export const OUTBOX_ENTITIES = ["place", "exercise", "workout_session", "session_exercise", "set_record"] as const;
export type OutboxEntity = (typeof OUTBOX_ENTITIES)[number];
export type OutboxAction = "upsert" | "delete";

/** รุ่นรูปแบบรายการในคิว — โค้ดใหม่ต้องอ่านรุ่นเก่าได้เสมอ */
export const OUTBOX_VERSION = 1;

export type OutboxOp = {
  /** ลำดับส่ง (autoIncrement) */
  seq: number;
  v: 1;
  /** UUID v4 ไว้ตามรอย/จับคู่ผลจากเซิร์ฟเวอร์ */
  op_id: string;
  entity: OutboxEntity;
  /** id ของแถว (UUID จากไคลเอนต์) */
  id: string;
  action: OutboxAction;
  /** ทั้งแถวในรูปบนสาย · delete = null */
  data: Record<string, unknown> | null;
  /** ISO UTC */
  client_updated_at: string;
  attempts: number;
  /** epoch ms · 0 = ส่งได้ทันที */
  next_attempt_at: number;
  last_error?: string;
  state: "pending" | "inflight";
  /** upsert นี้สร้างแถวที่เซิร์ฟเวอร์ยังไม่รู้จัก (ADR 0004 ข้อ 3) · ไม่มีช่อง = false */
  created?: boolean;
  /** epoch ms ที่เข้าคิวครั้งแรก (เตือนค้างเกิน 24 ชม.) · รายการเก่าไม่มีช่อง = ไม่รู้ */
  queued_at?: number;
  /** ข้อมูลไว้แสดงเท่านั้น ไม่ส่งขึ้นเซิร์ฟเวอร์ (ชื่อท่า/สถานที่ ชนิดการจด) — ใช้สร้างแถว "ส่งไม่ผ่าน" (UX 13.2) */
  display?: OpDisplay;
};

/** ข้อมูลประกอบการแสดงของรายการ (อยู่ในเครื่องเท่านั้น) */
export type OpDisplay = {
  /** ชื่อท่า (set_record / session_exercise) */
  exercise_name?: string;
  exercise_name_th?: string | null;
  /** ชนิดการจดที่ใช้ตอนจด — เทียบกับท่าปัจจุบันเพื่อแยก "ถูกเปลี่ยนชนิดจากอีกเครื่อง" */
  track_type?: string;
  load_mode?: string;
  /** exercise_id ของท่า (set_record / session_exercise) */
  exercise_id?: string;
  /** ชื่อสถานที่ (workout_session) */
  place_name?: string;
  /** การกระทำที่ผู้ใช้ทำ (place/exercise): create / edit / archive / unarchive / select */
  intent?: string;
};

/** รายการที่ยังไม่มี seq (ก่อนเขียนลง store) */
export type NewOutboxOp = Omit<OutboxOp, "seq">;

/** รายการที่เซิร์ฟเวอร์ปฏิเสธถาวร — รอผู้ใช้ดู/ทิ้ง ไม่หายเอง */
export type RejectedItem = {
  op_id: string;
  entity: OutboxEntity;
  id: string;
  action: OutboxAction;
  data: Record<string, unknown> | null;
  client_updated_at: string;
  code: PushRejectCode | "unknown";
  /** epoch ms */
  rejected_at: number;
  display?: OpDisplay;
};

/** การเขียนจากหน้าจอ 1 ครั้ง */
export type WriteIntent = {
  entity: OutboxEntity;
  id: string;
  action: OutboxAction;
  data: Record<string, unknown> | null;
  client_updated_at: string;
  /** ผู้เรียกบอกว่าเป็นแถวใหม่ (id เพิ่งสร้าง) — คิวตรวจซ้ำกับ snapshot/ประวัติการส่งก่อนตั้ง `created` */
  create?: boolean;
  display?: OpDisplay;
};

export type SyncPhase =
  /** ไม่มีอะไรค้าง หรือรอเวลาส่งรอบถัดไป (หน่วง 1.5 วิหลังเขียน) */
  | "idle"
  /** กำลังส่ง */
  | "syncing"
  /** ส่งล้มชั่วคราว (เน็ตหลุด/5xx/429/timeout) รอลองใหม่เอง — ใช้คู่กับ useOnline() แยกข้อ 4 กับ 6 ของ UX 13.1 */
  | "retry_wait"
  /** 401 — คิวอยู่ครบ รอเข้าสู่ระบบใหม่ */
  | "auth_required"
  /** 403 consent_required / 409 upgrade_required — รอผู้ใช้หรือรุ่นใหม่ */
  | "blocked";

export type SyncStatus = {
  phase: SyncPhase;
  /** จำนวน**แถว**ที่ค้างส่ง (แก้แถวเดียวกันหลายรอบนับ 1 · UX 13.1) */
  pending: number;
  /** จำนวน**แถว**ที่ส่งไม่ผ่าน */
  rejected: number;
  /** epoch ms ของรายการค้างที่เก่าสุด (null = ไม่มี/ไม่รู้) — ค้างเกิน 24 ชม. ให้เตือน */
  oldestPendingAt: number | null;
  /** epoch ms ที่เริ่มส่งรอบนี้ (phase = syncing) — แสดง "กำลังส่ง" เมื่อเกิน 1 วิ */
  syncingSince: number | null;
  /** epoch ms ที่ส่งจนคิวว่างล่าสุด — แสดง "ส่งครบแล้ว" 2 วิ */
  lastDrainedAt: number | null;
  /** เหตุของ blocked */
  blockedReason?: "consent_required" | "upgrade_required";
  /** ที่เก็บในเครื่องเต็ม/ใช้ไม่ได้ (เขียนครั้งล่าสุดล้ม) */
  storageError?: "quota" | "unavailable";
};

export const EMPTY_STATUS: SyncStatus = {
  phase: "idle",
  pending: 0,
  rejected: 0,
  oldestPendingAt: null,
  syncingSince: null,
  lastDrainedAt: null,
};
