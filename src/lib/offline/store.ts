// ที่เก็บในเครื่องของคิวออฟไลน์ (ADR 0004 ข้อ 2) — interface เดียว 2 ตัวทำ:
// - idb-store.ts: IndexedDB จริง ฐาน `fcf:v1:<user_id>` (ทุกการเปลี่ยนคิวทำใน transaction เดียว — หลายแท็บไม่ชนกัน)
// - createMemoryStore(): ในหน่วยความจำ ใช้ในเทสต์ และเป็นทางถอยเมื่อเปิด IndexedDB ไม่ได้ (ข้อมูลอยู่ถึงปิดแท็บเท่านั้น)

import { planEnqueue, type EnqueueResult } from "./queue";
import type { NewOutboxOp, OutboxOp, RejectedItem, WriteIntent } from "./types";

/** store แบบค่าเดียว (key = "current") */
export type KvStoreName = "snapshot" | "active_session" | "catalog" | "meta";

export type RetryUpdate = { seq: number; next_attempt_at: number; last_error?: string };

export type Settlement = {
  /** applied/stale → เอาออกจากคิว */
  remove: number[];
  /** ปฏิเสธถาวร → ย้ายไป `rejected` (และเอาออกจากคิว) */
  reject: { seq: number; item: RejectedItem }[];
  /** ส่งไม่สำเร็จชั่วคราว → กลับเป็น pending */
  retry: RetryUpdate[];
};

export interface OfflineStore {
  /** ทั้งคิวเรียงตาม seq */
  outboxAll(): Promise<OutboxOp[]>;
  /** อ่าน-วางแผน-เขียนใน transaction เดียว · knownInSnapshot = แถวนี้มีใน snapshot แล้ว */
  enqueue(w: WriteIntent, ctx: { opId: string; now: number; knownInSnapshot: (id: string) => boolean }): Promise<EnqueueResult>;
  /** ทำเป็น inflight + attempts+1 + จำว่า id เหล่านี้เคยถูกส่ง (เซิร์ฟเวอร์อาจรู้จักแล้ว) */
  markInflight(seqs: number[], now: number): Promise<void>;
  settle(s: Settlement): Promise<void>;
  /** เปิดแอป: รายการที่ค้าง inflight (แท็บถูกปิดกลางคัน) กลับเป็น pending */
  recoverInflight(): Promise<void>;
  /** online / เปิดแอป: ลองใหม่ได้ทันที */
  resetBackoff(): Promise<void>;
  rejectedAll(): Promise<RejectedItem[]>;
  rejectedDelete(opId: string): Promise<void>;
  getKv<T>(name: KvStoreName): Promise<T | undefined>;
  setKv<T>(name: KvStoreName, value: T): Promise<void>;
  deleteKv(name: KvStoreName): Promise<void>;
  /** ลืมประวัติการส่งที่เก่ากว่านี้ (epoch ms) */
  pruneSent(olderThan: number): Promise<void>;
  close(): void;
}

/** ข้อผิดพลาดของที่เก็บ — `quota` = พื้นที่เต็ม (QuotaExceededError) */
export class OfflineStorageError extends Error {
  constructor(
    readonly kind: "quota" | "unavailable",
    cause?: unknown,
  ) {
    super(kind === "quota" ? "offline storage full" : "offline storage unavailable", { cause });
    this.name = "OfflineStorageError";
  }
}

export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: unknown }).name;
  // ชื่อมาตรฐาน + ชื่อเก่าของ Firefox
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

export function toStorageError(e: unknown): OfflineStorageError {
  if (e instanceof OfflineStorageError) return e;
  return new OfflineStorageError(isQuotaError(e) ? "quota" : "unavailable", e);
}

const clone = <T>(v: T): T => structuredClone(v);

/** store ในหน่วยความจำ — พฤติกรรมเดียวกับ idb-store (เทสต์ของคิวใช้ตัวนี้) */
export function createMemoryStore(opts: { failWrites?: () => unknown } = {}): OfflineStore & { sentIds(): string[] } {
  let seq = 0;
  let outbox: OutboxOp[] = [];
  const rejected = new Map<string, RejectedItem>();
  const kv = new Map<KvStoreName, unknown>();
  const sent = new Map<string, number>();
  const guard = () => {
    const err = opts.failWrites?.();
    if (err) throw toStorageError(err);
  };
  const add = (op: NewOutboxOp) => {
    seq += 1;
    outbox.push({ ...clone(op), seq });
  };
  return {
    async outboxAll() {
      return clone(outbox).sort((a, b) => a.seq - b.seq);
    },
    async enqueue(w, ctx) {
      guard();
      const plan = planEnqueue(clone(outbox), w, {
        opId: ctx.opId,
        now: ctx.now,
        knownToServer: (id) => ctx.knownInSnapshot(id) || sent.has(id),
      });
      const drop = new Set(plan.remove);
      outbox = outbox.filter((op) => !drop.has(op.seq));
      for (const p of plan.put) outbox = outbox.map((op) => (op.seq === p.seq ? clone(p) : op));
      for (const a of plan.add) add(a);
      return plan.result;
    },
    async markInflight(seqs, now) {
      guard();
      const s = new Set(seqs);
      outbox = outbox.map((op) => {
        if (!s.has(op.seq)) return op;
        sent.set(op.id, now);
        return { ...op, state: "inflight", attempts: op.attempts + 1 };
      });
    },
    async settle(st) {
      guard();
      const drop = new Set([...st.remove, ...st.reject.map((r) => r.seq)]);
      for (const r of st.reject) rejected.set(r.item.op_id, clone(r.item));
      const retry = new Map(st.retry.map((r) => [r.seq, r]));
      outbox = outbox
        .filter((op) => !drop.has(op.seq))
        .map((op) => {
          const r = retry.get(op.seq);
          if (!r) return op;
          const next: OutboxOp = { ...op, state: "pending", next_attempt_at: r.next_attempt_at };
          if (r.last_error !== undefined) next.last_error = r.last_error;
          return next;
        });
    },
    async recoverInflight() {
      outbox = outbox.map((op) => (op.state === "inflight" ? { ...op, state: "pending" } : op));
    },
    async resetBackoff() {
      outbox = outbox.map((op) => ({ ...op, next_attempt_at: 0 }));
    },
    async rejectedAll() {
      return [...rejected.values()].map(clone).sort((a, b) => a.rejected_at - b.rejected_at);
    },
    async rejectedDelete(opId) {
      rejected.delete(opId);
    },
    async getKv<T>(name: KvStoreName) {
      return kv.has(name) ? clone(kv.get(name) as T) : undefined;
    },
    async setKv(name, value) {
      guard();
      kv.set(name, clone(value));
    },
    async deleteKv(name) {
      kv.delete(name);
    },
    async pruneSent(olderThan) {
      for (const [id, at] of sent) if (at < olderThan) sent.delete(id);
    },
    close() {},
    sentIds: () => [...sent.keys()],
  };
}
