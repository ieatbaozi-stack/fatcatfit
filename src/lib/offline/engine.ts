// ตัวส่งคิว (ADR 0004 ข้อ 3–5) — ส่งตาม seq ทีละชุด ≤ 50 ไม่ขนาน · ไม่ทิ้งเอง · ไม่ผูกกับ React/DOM
// ผลรายรายการ: applied/stale = เอาออก · rejected = ย้ายไป `rejected` · ไม่มีผล = ลองใหม่
// ทั้งคำขอ: fetch reject/timeout/5xx/429/อื่นๆ = ลองใหม่ (หน่วง) · 401 = หยุด คิวอยู่ครบ · 403 consent_required / 409 upgrade_required = หยุดรอ

import { PUSH_VERSION, type PushResponse, type PushResult } from "@/lib/data/shared/sync";
import { backoffMs, distinctRows, oldestQueuedAt, selectBatch } from "./queue";
import { toStorageError, type OfflineStore, type RetryUpdate, type Settlement } from "./store";
import { EMPTY_STATUS, type OutboxOp, type RejectedItem, type SyncStatus } from "./types";

export const PUSH_URL = "/api/sync/push";
export const PUSH_TIMEOUT_MS = 15_000;

export type FlushOutcome =
  /** คิวว่าง */
  | "drained"
  /** ยังมีค้าง (รอหน่วง/ล้มชั่วคราว) */
  | "pending"
  | "auth_required"
  | "blocked";

export interface EngineDeps {
  store: OfflineStore;
  fetch: typeof fetch;
  now: () => number;
  random: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  /** มีรายการ applied ในรอบนี้ (ผู้เรียกดึง bootstrap ใหม่) */
  onApplied?: () => void;
  /** มีรายการถูกปฏิเสธใหม่ */
  onRejected?: (items: RejectedItem[]) => void;
  timeoutMs?: number;
}

export interface SyncEngine {
  getStatus(): SyncStatus;
  subscribe(fn: (s: SyncStatus) => void): () => void;
  /** ส่งจนกว่าคิวว่างหรือติด (single-flight: เรียกซ้ำระหว่างส่ง = ส่งต่ออีกรอบหลังจบ) */
  flush(): Promise<FlushOutcome>;
  /** เปิดแอป / online / visible / ผู้ใช้กด "ส่งเลย": ล้างหน่วง + ล้างสถานะ 401/blocked แล้วส่ง */
  kick(): Promise<FlushOutcome>;
  /** ส่งหลังหน่วงเท่านี้ (รวมหลายการเขียน) · มีนัดเร็วกว่าอยู่แล้ว = ไม่เลื่อน */
  scheduleFlush(delayMs: number): void;
  /** อ่านคิว/rejected ใหม่แล้วแจ้งผู้ฟัง (หลังเขียนลงคิว/ทิ้ง rejected) */
  refreshStatus(): Promise<SyncStatus>;
  /** ตั้ง/ล้าง error ของที่เก็บ (เขียนลงเครื่องล้ม) */
  setStorageError(kind: "quota" | "unavailable" | null): void;
  stop(): void;
}

type Resp = { ok: boolean; status: number; json(): Promise<unknown> };

async function readCode(res: Resp): Promise<string | null> {
  try {
    const b = (await res.json()) as { code?: unknown } | null;
    return typeof b?.code === "string" ? b.code : null;
  } catch {
    return null;
  }
}

function wireOp(op: OutboxOp) {
  return {
    op_id: op.op_id,
    entity: op.entity,
    id: op.id,
    action: op.action,
    ...(op.action === "upsert" && op.data ? { data: op.data } : {}),
    client_updated_at: op.client_updated_at,
  };
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const { store } = deps;
  const listeners = new Set<(s: SyncStatus) => void>();
  let status: SyncStatus = { ...EMPTY_STATUS };
  let running: Promise<FlushOutcome> | null = null;
  let rerun = false;
  let timer: unknown = null;
  let timerAt = Infinity;
  let stopped = false;
  /** รอบ flush นี้ได้ส่งอะไรออกไปบ้าง (ไว้ตั้ง lastDrainedAt) */
  let sentThisRun = false;

  const emit = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch };
    for (const l of listeners) l(status);
  };

  async function refreshStatus(): Promise<SyncStatus> {
    try {
      const [ops, rej] = await Promise.all([store.outboxAll(), store.rejectedAll()]);
      emit({ pending: distinctRows(ops), rejected: distinctRows(rej), oldestPendingAt: oldestQueuedAt(ops) });
    } catch (e) {
      emit({ storageError: toStorageError(e).kind });
    }
    return status;
  }

  function scheduleFlush(delayMs: number) {
    if (stopped) return;
    const at = deps.now() + Math.max(0, delayMs);
    if (timer !== null && timerAt <= at) return;
    if (timer !== null) deps.clearTimeout(timer);
    timerAt = at;
    timer = deps.setTimeout(() => {
      timer = null;
      timerAt = Infinity;
      void flush();
    }, Math.max(0, delayMs));
  }

  const retryAll = (batch: OutboxOp[], now: number, error: string, immediate = false): RetryUpdate[] =>
    batch.map((op) => ({
      seq: op.seq,
      // attempts ถูกบวกแล้วตอน markInflight
      next_attempt_at: immediate ? 0 : now + backoffMs(op.attempts + 1, deps.random()),
      last_error: error,
    }));

  /** ส่ง 1 ชุด · คืน null = ส่งต่อได้ · อื่น = หยุดรอบนี้ */
  async function sendBatch(batch: OutboxOp[]): Promise<FlushOutcome | null> {
    const now = deps.now();
    await store.markInflight(
      batch.map((o) => o.seq),
      now,
    );
    const settle = async (s: Partial<Settlement>) => store.settle({ remove: s.remove ?? [], reject: s.reject ?? [], retry: s.retry ?? [] });

    let res: Resp;
    const ctrl = typeof AbortController === "undefined" ? null : new AbortController();
    const to = deps.setTimeout(() => ctrl?.abort(), deps.timeoutMs ?? PUSH_TIMEOUT_MS);
    try {
      res = await deps.fetch(PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: PUSH_VERSION, ops: batch.map(wireOp) }),
        credentials: "same-origin",
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
    } catch {
      // ออฟไลน์ fetch reject ทันที (ADR 0005 สิ่งที่ R3 ต้องรู้ ข) = เน็ตหลุด ไม่ใช่ปฏิเสธ
      await settle({ retry: retryAll(batch, now, "network") });
      emit({ phase: "retry_wait" });
      return "pending";
    } finally {
      deps.clearTimeout(to);
    }

    if (res.status === 401) {
      await settle({ retry: retryAll(batch, now, "401", true) });
      emit({ phase: "auth_required" });
      return "auth_required";
    }
    if (res.status === 403 || res.status === 409) {
      const code = await readCode(res);
      await settle({ retry: retryAll(batch, now, `${res.status}:${code ?? ""}`, true) });
      if (res.status === 409) {
        emit({ phase: "blocked", blockedReason: "upgrade_required" });
        return "blocked";
      }
      if (code === "consent_required") {
        emit({ phase: "blocked", blockedReason: "consent_required" });
        return "blocked";
      }
      emit({ phase: "auth_required" });
      return "auth_required";
    }
    if (!res.ok) {
      await settle({ retry: retryAll(batch, now, `http_${res.status}`) });
      emit({ phase: "retry_wait" });
      return "pending";
    }

    let body: Partial<PushResponse> | null = null;
    try {
      body = (await res.json()) as Partial<PushResponse> | null;
    } catch {
      body = null;
    }
    const byOp = new Map<string, PushResult>();
    for (const r of Array.isArray(body?.results) ? body.results : []) if (r && typeof r.op_id === "string") byOp.set(r.op_id, r);

    const remove: number[] = [];
    const reject: Settlement["reject"] = [];
    const missing: OutboxOp[] = [];
    let applied = false;
    for (const op of batch) {
      const r = byOp.get(op.op_id);
      if (!r) missing.push(op);
      else if (r.status === "applied" || r.status === "stale") {
        remove.push(op.seq);
        if (r.status === "applied") applied = true;
      } else if (r.status === "rejected") {
        const item: RejectedItem = {
          op_id: op.op_id,
          entity: op.entity,
          id: op.id,
          action: op.action,
          data: op.data,
          client_updated_at: op.client_updated_at,
          code: r.code ?? "unknown",
          rejected_at: now,
          ...(op.display ? { display: op.display } : {}),
        };
        reject.push({ seq: op.seq, item });
      } else missing.push(op);
    }
    await settle({ remove, reject, retry: retryAll(missing, now, "no_result") });
    if (applied) deps.onApplied?.();
    if (reject.length > 0) deps.onRejected?.(reject.map((r) => r.item));
    if (missing.length > 0) {
      emit({ phase: "retry_wait" });
      return "pending";
    }
    return null;
  }

  async function loop(): Promise<FlushOutcome> {
    for (;;) {
      if (stopped) return "pending";
      if (status.phase === "auth_required") return "auth_required";
      if (status.phase === "blocked") return "blocked";
      const ops = await store.outboxAll();
      if (ops.length === 0) {
        emit({ phase: "idle", syncingSince: null });
        return "drained";
      }
      const batch = selectBatch(ops, deps.now());
      if (batch.length === 0) {
        // หัวคิวยังรอหน่วง → นัดไว้ตอนถึงเวลา
        const head = ops[0];
        if (head && head.state === "pending") scheduleFlush(head.next_attempt_at - deps.now());
        return "pending";
      }
      if (status.phase !== "syncing") emit({ phase: "syncing", syncingSince: deps.now() });
      sentThisRun = true;
      const stop = await sendBatch(batch);
      await refreshStatus();
      if (stop) {
        if (stop === "pending") {
          const next = (await store.outboxAll())[0];
          if (next) scheduleFlush(next.next_attempt_at - deps.now());
        }
        return stop;
      }
    }
  }

  function flush(): Promise<FlushOutcome> {
    if (running) {
      rerun = true;
      return running;
    }
    sentThisRun = false;
    running = (async () => {
      let out: FlushOutcome = "pending";
      try {
        do {
          rerun = false;
          out = await loop();
        } while (rerun && out === "drained");
      } catch (e) {
        emit({ storageError: toStorageError(e).kind, phase: "retry_wait", syncingSince: null });
        out = "pending";
      }
      await refreshStatus();
      if (out === "drained") emit({ phase: "idle", syncingSince: null, ...(sentThisRun ? { lastDrainedAt: deps.now() } : {}) });
      else if (status.phase === "syncing") emit({ phase: "retry_wait", syncingSince: null });
      else emit({ syncingSince: null });
      return out;
    })().finally(() => {
      running = null;
    });
    return running;
  }

  async function kick(): Promise<FlushOutcome> {
    if (status.phase === "auth_required" || status.phase === "blocked") emit({ phase: "idle", blockedReason: undefined });
    try {
      await store.resetBackoff();
    } catch {
      // ที่เก็บล้ม — flush จะรายงานเอง
    }
    return flush();
  }

  return {
    getStatus: () => status,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    flush,
    kick,
    scheduleFlush,
    refreshStatus,
    setStorageError(kind) {
      emit({ storageError: kind ?? undefined });
    },
    stop() {
      stopped = true;
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      listeners.clear();
    },
  };
}
