// กติกาคิวเขียน (ADR 0004 ข้อ 3) — ฟังก์ชันบริสุทธิ์ ไม่มี I/O · store เอาแผนไปทำใน transaction เดียว
// - รวมรายการ: เขียนแถวเดิมซ้ำขณะรายการเดิมยัง pending → แทนที่โดยคง seq เดิม (พ่อแม่ยังมาก่อนลูก) · inflight → ต่อท้าย
// - สร้างแล้วลบก่อนส่ง: upsert created + attempts 0 + pending → เอาออกทั้งคู่ + op ที่ค้างของลูกหลาน ไม่ส่งอะไร
// - ลำดับ: ส่งตาม seq ทีละชุด ≤ 50 · หัวคิวยังรอหน่วงอยู่ = ยังไม่ส่งทั้งคิว (ไม่ให้ลูกแซงพ่อแม่)

import type { NewOutboxOp, OutboxEntity, OutboxOp, WriteIntent } from "./types";
import { OUTBOX_VERSION } from "./types";

export const BATCH_MAX = 50;
export const BACKOFF_MAX_MS = 5 * 60 * 1000;

export type EnqueueResult = "queued" | "merged" | "cancelled";

export type OutboxPlan = {
  /** รายการเดิมที่แก้ (seq เดิม) */
  put: OutboxOp[];
  /** รายการใหม่ (store ตั้ง seq) */
  add: NewOutboxOp[];
  /** seq ที่เอาออก */
  remove: number[];
  result: EnqueueResult;
};

export type EnqueueContext = {
  /** เซิร์ฟเวอร์รู้จักแถวนี้แล้ว (มีใน snapshot หรือเคยมี op ของ id นี้ถูกส่ง) */
  knownToServer: (id: string) => boolean;
  opId: string;
  now: number;
};

const sameRow = (op: OutboxOp, entity: OutboxEntity, id: string) => op.entity === entity && op.id === id;

/** ยังไม่เคยออกจากเครื่องเลย — ปลอดภัยที่จะทิ้ง */
const neverSent = (op: OutboxOp) => op.state === "pending" && op.attempts === 0;

/** op ที่ค้างของลูกหลานแถว (session → session_exercise → set_record) อ่านความสัมพันธ์จาก data */
export function descendantOps(ops: OutboxOp[], entity: OutboxEntity, id: string): OutboxOp[] {
  const out: OutboxOp[] = [];
  if (entity === "workout_session") {
    const exIds = new Set<string>();
    for (const op of ops) {
      if (op.entity === "session_exercise" && op.data?.session_id === id) {
        out.push(op);
        exIds.add(op.id);
      }
    }
    for (const op of ops) {
      if (op.entity === "set_record" && exIds.has(String(op.data?.session_exercise_id))) out.push(op);
    }
  } else if (entity === "session_exercise") {
    for (const op of ops) if (op.entity === "set_record" && op.data?.session_exercise_id === id) out.push(op);
  }
  return out;
}

/** วางแผนเขียน 1 ครั้งลงคิว · ops = ทั้งคิวเรียงตาม seq */
export function planEnqueue(ops: OutboxOp[], w: WriteIntent, ctx: EnqueueContext): OutboxPlan {
  const forRow = ops.filter((op) => sameRow(op, w.entity, w.id));
  const latest = forRow.at(-1);
  const data = w.action === "delete" ? null : w.data;

  if (w.action === "delete") {
    // สร้างแล้วลบก่อนส่ง: ต้องเป็น op เดียวของแถวนี้ และไม่เคยออกจากเครื่อง
    if (latest && forRow.length === 1 && latest.action === "upsert" && latest.created === true && neverSent(latest)) {
      const kids = descendantOps(ops, w.entity, w.id).filter(neverSent);
      return { put: [], add: [], remove: [latest.seq, ...kids.map((k) => k.seq)], result: "cancelled" };
    }
    if (latest && latest.state === "pending") {
      return {
        put: [{ ...latest, action: "delete", data: null, client_updated_at: w.client_updated_at, created: false }],
        add: [],
        remove: [],
        result: "merged",
      };
    }
  } else if (latest && latest.state === "pending" && latest.action === "upsert") {
    return {
      put: [{ ...latest, data, client_updated_at: w.client_updated_at, ...(w.display ? { display: w.display } : {}) }],
      add: [],
      remove: [],
      result: "merged",
    };
  }
  // ต่อท้าย: ไม่มีรายการเดิม / รายการเดิมกำลังส่ง / upsert หลัง delete ที่ค้าง (ลบชนะ — เซิร์ฟเวอร์ตอบ stale)
  const created = w.action === "upsert" && w.create === true && forRow.length === 0 && !ctx.knownToServer(w.id);
  const op: NewOutboxOp = {
    v: OUTBOX_VERSION,
    op_id: ctx.opId,
    entity: w.entity,
    id: w.id,
    action: w.action,
    data,
    client_updated_at: w.client_updated_at,
    attempts: 0,
    next_attempt_at: 0,
    state: "pending",
    ...(created ? { created: true } : {}),
    queued_at: ctx.now,
    ...(w.display ? { display: w.display } : {}),
  };
  return { put: [], add: [op], remove: [], result: "queued" };
}

/**
 * ชุดถัดไปที่จะส่ง: pending ต่อกันจากหัวคิวตาม seq ≤ max รายการ
 * หัวคิวยังไม่ถึงเวลาลองใหม่ → ว่าง (ไม่ให้รายการใหม่แซงรายการเก่า)
 */
export function selectBatch(ops: OutboxOp[], now: number, max = BATCH_MAX): OutboxOp[] {
  const sorted = [...ops].sort((a, b) => a.seq - b.seq);
  if (sorted.some((op) => op.state === "inflight")) return [];
  const head = sorted[0];
  if (!head || head.next_attempt_at > now) return [];
  return sorted.slice(0, max);
}

/** หน่วงก่อนลองใหม่: min(2^attempts วิ, 5 นาที) ± 20% · rand ∈ [0, 1) */
export function backoffMs(attempts: number, rand: number): number {
  const base = Math.min(2 ** attempts * 1000, BACKOFF_MAX_MS);
  return Math.round(base * (0.8 + 0.4 * rand));
}

/** รายการค้างที่เก่าสุด (ใช้เตือนค้างเกิน 24 ชม.) */
export function oldestQueuedAt(ops: OutboxOp[]): number | null {
  let min: number | null = null;
  for (const op of ops) if (typeof op.queued_at === "number" && (min === null || op.queued_at < min)) min = op.queued_at;
  return min;
}

/** อ่านรายการจาก store อย่างทน: รุ่นเก่า/ช่องขาด → ค่าเริ่มต้น · รูปเสีย → null (ไม่ทิ้ง — ผู้เรียกตัดสิน) */
export function normalizeOp(raw: unknown): OutboxOp | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<OutboxOp>;
  if (typeof r.seq !== "number" || typeof r.op_id !== "string" || typeof r.id !== "string" || typeof r.entity !== "string") return null;
  if (r.action !== "upsert" && r.action !== "delete") return null;
  return {
    seq: r.seq,
    v: 1,
    op_id: r.op_id,
    entity: r.entity as OutboxEntity,
    id: r.id,
    action: r.action,
    data: r.action === "delete" ? null : ((r.data as Record<string, unknown> | null | undefined) ?? null),
    client_updated_at: typeof r.client_updated_at === "string" ? r.client_updated_at : new Date(0).toISOString(),
    attempts: typeof r.attempts === "number" ? r.attempts : 0,
    next_attempt_at: typeof r.next_attempt_at === "number" ? r.next_attempt_at : 0,
    ...(typeof r.last_error === "string" ? { last_error: r.last_error } : {}),
    state: r.state === "inflight" ? "inflight" : "pending",
    ...(r.created === true ? { created: true } : {}),
    ...(typeof r.queued_at === "number" ? { queued_at: r.queued_at } : {}),
    ...(r.display && typeof r.display === "object" ? { display: r.display } : {}),
  };
}

/** จำนวนแถวไม่ซ้ำ (entity + id) — N ของแถบสถานะ (UX 13.1) */
export function distinctRows(items: { entity: string; id: string }[]): number {
  return new Set(items.map((i) => `${i.entity}:${i.id}`)).size;
}
