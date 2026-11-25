// IndexedDB ของคิวออฟไลน์ (ADR 0004 ข้อ 2) — ฐานแยกต่อผู้ใช้ `fcf:v1:<user_id>`
// store: outbox (seq autoIncrement) · rejected (op_id) · sent (id ที่เคยถูกส่ง) · snapshot / active_session / catalog / meta (ค่าเดียว key "current")
// ใช้ IndexedDB ตรงๆ (กฎขอบเขตใน eslint.config.mjs ห้าม lib/offline import แพ็กเกจ I/O รวม `idb`)
// ทุกการเปลี่ยนคิวเป็น transaction เดียว (อ่าน-วางแผน-เขียน) — ระหว่างนั้น await แค่ request ของ transaction นั้น
// เขียนล้ม: QuotaExceededError → OfflineStorageError("quota") · อื่นๆ → "unavailable"

import { offlineDbName } from "@/pwa/offline-db";
import { normalizeOp, planEnqueue } from "./queue";
import { toStorageError, type KvStoreName, type OfflineStore } from "./store";
import type { OutboxOp, RejectedItem } from "./types";

const DB_VERSION = 1;
const KV_KEY = "current";
const KV_STORES: KvStoreName[] = ["snapshot", "active_session", "catalog", "meta"];

export const dbNameFor = offlineDbName;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("aborted", "AbortError"));
  });
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toStorageError(e);
  }
}

const readOps = (raw: unknown[]): OutboxOp[] =>
  raw
    .map(normalizeOp)
    .filter((o): o is OutboxOp => o !== null)
    .sort((a, b) => a.seq - b.seq);

function openDb(idb: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = idb.open(name, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!d.objectStoreNames.contains("rejected")) d.createObjectStore("rejected", { keyPath: "op_id" });
      if (!d.objectStoreNames.contains("sent")) d.createObjectStore("sent", { keyPath: "id" });
      for (const n of KV_STORES) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n);
    };
    r.onsuccess = () => {
      const db = r.result;
      // ฐานรุ่นใหม่กว่าเปิดในอีกแท็บ / มีคนสั่งลบ (ออกจากระบบจากอีกแท็บ) → ปิดตัวเองไม่ขวาง
      db.onversionchange = () => db.close();
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new DOMException("blocked", "InvalidStateError"));
  });
}

export async function openIdbStore(userId: string, idb: IDBFactory | undefined = globalThis.indexedDB): Promise<OfflineStore> {
  if (!idb) throw toStorageError(new Error("no indexedDB"));
  const db = await wrap(() => openDb(idb, dbNameFor(userId)));

  return {
    async outboxAll() {
      return wrap(async () => readOps(await req(db.transaction("outbox").objectStore("outbox").getAll())));
    },
    async enqueue(w, ctx) {
      return wrap(async () => {
        const tx = db.transaction(["outbox", "sent"], "readwrite");
        const finished = done(tx);
        const outbox = tx.objectStore("outbox");
        const ops = readOps(await req(outbox.getAll()));
        const sentBefore = (await req(tx.objectStore("sent").get(w.id))) !== undefined;
        const plan = planEnqueue(ops, w, {
          opId: ctx.opId,
          now: ctx.now,
          knownToServer: (id) => ctx.knownInSnapshot(id) || (id === w.id && sentBefore),
        });
        for (const s of plan.remove) outbox.delete(s);
        for (const p of plan.put) outbox.put(p);
        for (const a of plan.add) outbox.add(a);
        await finished;
        return plan.result;
      });
    },
    async markInflight(seqs, now) {
      await wrap(async () => {
        const tx = db.transaction(["outbox", "sent"], "readwrite");
        const finished = done(tx);
        const outbox = tx.objectStore("outbox");
        const sent = tx.objectStore("sent");
        for (const s of seqs) {
          const op = normalizeOp(await req(outbox.get(s)));
          if (!op) continue;
          outbox.put({ ...op, state: "inflight", attempts: op.attempts + 1 });
          sent.put({ id: op.id, at: now });
        }
        await finished;
      });
    },
    async settle(st) {
      await wrap(async () => {
        const tx = db.transaction(["outbox", "rejected"], "readwrite");
        const finished = done(tx);
        const outbox = tx.objectStore("outbox");
        for (const r of st.reject) tx.objectStore("rejected").put(r.item);
        for (const s of [...st.remove, ...st.reject.map((r) => r.seq)]) outbox.delete(s);
        for (const r of st.retry) {
          const op = normalizeOp(await req(outbox.get(r.seq)));
          if (!op) continue;
          const next: OutboxOp = { ...op, state: "pending", next_attempt_at: r.next_attempt_at };
          if (r.last_error !== undefined) next.last_error = r.last_error;
          outbox.put(next);
        }
        await finished;
      });
    },
    async recoverInflight() {
      await wrap(async () => {
        const tx = db.transaction("outbox", "readwrite");
        const finished = done(tx);
        const store = tx.objectStore("outbox");
        for (const op of readOps(await req(store.getAll()))) if (op.state === "inflight") store.put({ ...op, state: "pending" });
        await finished;
      });
    },
    async resetBackoff() {
      await wrap(async () => {
        const tx = db.transaction("outbox", "readwrite");
        const finished = done(tx);
        const store = tx.objectStore("outbox");
        for (const op of readOps(await req(store.getAll()))) if (op.next_attempt_at !== 0) store.put({ ...op, next_attempt_at: 0 });
        await finished;
      });
    },
    async rejectedAll() {
      return wrap(async () =>
        ((await req(db.transaction("rejected").objectStore("rejected").getAll())) as RejectedItem[]).sort((a, b) => a.rejected_at - b.rejected_at),
      );
    },
    async rejectedDelete(opId) {
      await wrap(async () => {
        const tx = db.transaction("rejected", "readwrite");
        const finished = done(tx);
        tx.objectStore("rejected").delete(opId);
        await finished;
      });
    },
    async getKv<T>(name: KvStoreName) {
      return wrap(async () => (await req(db.transaction(name).objectStore(name).get(KV_KEY))) as T | undefined);
    },
    async setKv(name, value) {
      await wrap(async () => {
        const tx = db.transaction(name, "readwrite");
        const finished = done(tx);
        tx.objectStore(name).put(value, KV_KEY);
        await finished;
      });
    },
    async deleteKv(name) {
      await wrap(async () => {
        const tx = db.transaction(name, "readwrite");
        const finished = done(tx);
        tx.objectStore(name).delete(KV_KEY);
        await finished;
      });
    },
    async pruneSent(olderThan) {
      await wrap(async () => {
        const tx = db.transaction("sent", "readwrite");
        const finished = done(tx);
        const store = tx.objectStore("sent");
        for (const row of (await req(store.getAll())) as { id: string; at: number }[]) if (row.at < olderThan) store.delete(row.id);
        await finished;
      });
    },
    close() {
      db.close();
    },
  };
}
