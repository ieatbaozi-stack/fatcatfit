// API ให้หน้าจอใช้ (contract R3 "คิวในเครื่อง" · ADR 0004 ข้อ 2–8) — หน้าจอห้าม fetch เขียนเอง ทุกการเขียนผ่านที่นี่
// ไม่ผูก React: หน้าจอใช้ useSyncExternalStore(subscribeX, getX, getServerX)
//
//   initOffline(userId)            เปิดฐาน `fcf:v1:<user_id>` · ส่งคิว · ดึง snapshot · ติดตั้งจังหวะ sync
//   resumeOfflineFromDevice()      เปิดแอปตอนออฟไลน์ (ถาม /api/me ไม่ได้) → ใช้ user id ที่จำไว้ในเครื่อง
//   writeEntity / deleteEntity     เขียนลงคิว (คืนผลทันทีหลังลงเครื่อง ไม่รอเซิร์ฟเวอร์)
//   applySessionChange             เอาผลจาก session.ts (ร่าง + การเขียน) ลงเครื่อง
//   subscribeSyncStatus / getSyncStatus · subscribeLocalView / getLocalView
//   listRejected / discardRejected · syncNow · flushBeforeSignOut · closeOffline
//
// จังหวะ sync (ADR 0004 ข้อ 5): เปิดแอป · online · visible/pageshow · หลังเขียน 1.5 วิ · ทุก 60 วิ ขณะมีค้าง · ก่อนออกจากระบบ
// ดึง bootstrap: เปิดแอป (หลัง push) · หลัง push ที่มี applied 5 วิ · visible อีกครั้งหลังห่าง > 5 นาที

import type { BootstrapResponse, CatalogResponse } from "@/lib/data/shared/sync";
import { getOfflineUserId, requestPersistentStorage, setOfflineUserId } from "@/pwa/offline-db";
import { createSyncEngine, type FlushOutcome, type SyncEngine } from "./engine";
import { openIdbStore } from "./idb-store";
import { overlayMyExercises, overlayPlaces } from "./overlay";
import type { EnqueueResult } from "./queue";
import { groupRejected, type RejectedGroup } from "./rejected";
import { dropRowsFromDraft, finishSession, discardSession, parseDraft, resumeDecision, draftFromWire, type ActiveSessionDraft, type ResumeDecision, type SessionChange } from "./session";
import { createMemoryStore, OfflineStorageError, toStorageError, type OfflineStore } from "./store";
import { EMPTY_STATUS, type OpDisplay, type OutboxEntity, type OutboxOp, type SyncStatus } from "./types";
import type { WireMyExercise, WirePlace } from "@/lib/data/shared/sync";
import type { WireSession } from "@/lib/data/shared/workout";

export const WRITE_DEBOUNCE_MS = 1500;
export const PERIODIC_FLUSH_MS = 60_000;
export const BOOTSTRAP_AFTER_APPLY_MS = 5000;
export const BOOTSTRAP_STALE_MS = 5 * 60 * 1000;
export const SIGN_OUT_FLUSH_MS = 5000;
const SENT_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export type SnapshotRecord = { data: BootstrapResponse; fetched_at: number };
export type CatalogRecord = { data: CatalogResponse; fetched_at: number };

/** สิ่งที่หน้าจอวาด: snapshot ทับด้วยคิว (+ ร่างเซสชันสำหรับหน้าจด) · ตัวเดิมจนกว่าจะเปลี่ยน (useSyncExternalStore) */
export type LocalView = {
  /** เปิดฐานเสร็จ อ่านของในเครื่องแล้ว */
  ready: boolean;
  /** ฐานจริงเปิดไม่ได้ ใช้หน่วยความจำแทน (ปิดแท็บ = หาย) */
  memoryOnly: boolean;
  snapshot: BootstrapResponse | null;
  /** epoch ms ที่ดึง snapshot ล่าสุด */
  snapshotAt: number | null;
  catalog: CatalogResponse | null;
  /** คิวทั้งหมด (เรียงตาม seq) */
  ops: OutboxOp[];
  /** สถานที่ = snapshot ทับคิว */
  places: WirePlace[];
  /** ท่าของฉัน = snapshot ทับคิว */
  myExercises: WireMyExercise[];
  activeSession: ActiveSessionDraft | null;
};

const EMPTY_VIEW: LocalView = {
  ready: false,
  memoryOnly: false,
  snapshot: null,
  snapshotAt: null,
  catalog: null,
  ops: [],
  places: [],
  myExercises: [],
  activeSession: null,
};

export type WriteResult =
  | { ok: true; result: EnqueueResult }
  /** not_ready = ยังไม่ได้ initOffline · storage_full / storage_unavailable = เขียนลงเครื่องไม่ได้ ("ยังบันทึกไม่ได้ · ลองอีกที") */
  | { ok: false; reason: "not_ready" | "storage_full" | "storage_unavailable" };

export interface OfflineDeps {
  openStore: (userId: string) => Promise<OfflineStore>;
  fetch: typeof fetch;
  now: () => number;
  random: () => number;
  uuid: () => string;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  /** ติดตั้งตัวฟัง online/visibility/interval (เทสต์ปิดได้) */
  listen: boolean;
  persist: () => Promise<boolean>;
}

const defaultDeps = (): OfflineDeps => ({
  openStore: (id) => openIdbStore(id),
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
  random: () => Math.random(),
  uuid: () => crypto.randomUUID(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  listen: typeof window !== "undefined",
  persist: () => requestPersistentStorage(),
});

type Ctx = {
  userId: string;
  /** ยืนยันตัวตนกับ /api/me แล้วหรือยัง (false = เปิดตอนออฟไลน์ อ่าน/เขียนในเครื่องได้แต่ห้ามยิงเครือข่ายจนกว่าจะยืนยัน) */
  verified: boolean;
  deps: OfflineDeps;
  store: OfflineStore;
  engine: SyncEngine;
  view: LocalView;
  /** id ทุกแถวใน snapshot (ตัดสิน `created`) */
  snapshotIds: Set<string>;
  lastIssuedMs: number;
  /** นับรอบที่มี applied — ทิ้งคำตอบ bootstrap ที่ถามก่อน apply ล่าสุด */
  appliedEpoch: number;
  bootstrapTimer: unknown;
  bootstrapInflight: Promise<boolean> | null;
  cleanup: (() => void)[];
  closed: boolean;
};

let ctx: Ctx | null = null;
let opening: Promise<void> | null = null;
let openingUser: string | null = null;
const viewListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();
let status: SyncStatus = EMPTY_STATUS;
let view: LocalView = EMPTY_VIEW;

function setView(next: LocalView) {
  view = next;
  for (const l of viewListeners) l();
}

function setStatus(s: SyncStatus) {
  status = s;
  for (const l of statusListeners) l();
}

function idsOf(b: BootstrapResponse | null): Set<string> {
  const ids = new Set<string>();
  if (!b) return ids;
  for (const p of b.places) ids.add(p.id);
  for (const e of b.my_exercises) ids.add(e.id);
  for (const list of [b.active_sessions ?? [], b.recent_sessions ?? []]) {
    for (const s of list) {
      ids.add(s.id);
      for (const e of s.exercises) {
        ids.add(e.id);
        for (const st of e.sets) ids.add(st.id);
      }
    }
  }
  return ids;
}

function rebuild(c: Ctx, patch: Partial<LocalView>) {
  const v = { ...c.view, ...patch };
  if ("ops" in patch || "snapshot" in patch) {
    v.places = overlayPlaces(v.snapshot?.places ?? [], v.ops);
    v.myExercises = overlayMyExercises(v.snapshot?.my_exercises ?? [], v.ops);
  }
  c.view = v;
  if (ctx === c) setView(v);
}

async function reloadOps(c: Ctx) {
  try {
    rebuild(c, { ops: await c.store.outboxAll() });
  } catch {
    // อ่านไม่ได้ — คงค่าเดิม
  }
}

// ---------------- เปิด/ปิด ----------------

/**
 * เรียกเมื่อรู้ว่าใครล็อกอิน (AuthGate หลัง /api/me ตอบ ready) · เรียกซ้ำด้วยคนเดิม = ส่งคิว (เหมือน "เปิดแอป")
 * คนละคนกับที่เปิดอยู่ = ปิดฐานเดิม (ไม่ลบ) แล้วเปิดของคนใหม่
 */
export async function initOffline(userId: string, overrides: Partial<OfflineDeps> = {}): Promise<void> {
  if (ctx && ctx.userId === userId && !ctx.closed) {
    ctx.verified = true;
    setOfflineUserId(userId);
    void ctx.engine.kick().then(() => refreshSnapshot());
    return;
  }
  if (opening && openingUser === userId) {
    await opening;
    if (ctx && ctx.userId === userId && !ctx.closed && !ctx.verified) {
      ctx.verified = true;
      setOfflineUserId(userId);
      void ctx.engine.kick().then(() => refreshSnapshot());
    }
    return;
  }
  if (ctx) closeOffline();
  openingUser = userId;
  opening = open(userId, { ...defaultDeps(), ...overrides }, true).finally(() => {
    opening = null;
    openingUser = null;
  });
  return opening;
}

/** เปิดแอปตอนออฟไลน์: ใช้ user id ที่จำไว้ (ไม่มี = false) · อ่าน/เขียนในเครื่องได้ แต่ยังไม่ส่งเครือข่ายจนกว่า AuthGate จะยืนยัน /api/me ผ่าน initOffline */
export async function resumeOfflineFromDevice(overrides: Partial<OfflineDeps> = {}): Promise<boolean> {
  const id = getOfflineUserId();
  if (!id) return false;
  if (ctx && ctx.userId === id && !ctx.closed) return true;
  if (opening && openingUser === id) {
    await opening;
    return true;
  }
  if (ctx) closeOffline();
  openingUser = id;
  opening = open(id, { ...defaultDeps(), ...overrides }, false).finally(() => {
    opening = null;
    openingUser = null;
  });
  await opening;
  return true;
}

async function open(userId: string, deps: OfflineDeps, verified: boolean): Promise<void> {
  if (verified) setOfflineUserId(userId);
  let store: OfflineStore;
  let memoryOnly = false;
  try {
    store = await deps.openStore(userId);
  } catch {
    // IndexedDB ใช้ไม่ได้ (โหมดส่วนตัว/ถูกบล็อก) — ยังจดได้ แต่อยู่ถึงปิดแท็บ · แถบสถานะบอกผ่าน storageError
    store = createMemoryStore();
    memoryOnly = true;
  }
  const c: Ctx = {
    userId,
    verified,
    deps,
    store,
    engine: null as unknown as SyncEngine,
    view: { ...EMPTY_VIEW, memoryOnly },
    snapshotIds: new Set(),
    lastIssuedMs: 0,
    appliedEpoch: 0,
    bootstrapTimer: null,
    bootstrapInflight: null,
    cleanup: [],
    closed: false,
  };
  c.engine = createSyncEngine({
    store,
    fetch: deps.fetch,
    now: deps.now,
    random: deps.random,
    setTimeout: deps.setTimeout,
    clearTimeout: deps.clearTimeout,
    onApplied: () => {
      c.appliedEpoch += 1;
      scheduleBootstrap(c, BOOTSTRAP_AFTER_APPLY_MS);
    },
  });
  c.cleanup.push(c.engine.subscribe((s) => ctx === c && setStatus(s)));
  c.cleanup.push(c.engine.subscribe(() => void reloadOps(c)));
  if (memoryOnly) c.engine.setStorageError("unavailable");
  ctx = c;

  try {
    await store.recoverInflight();
    await store.pruneSent(deps.now() - SENT_KEEP_MS);
  } catch {
    // ข้าม
  }
  let snap: SnapshotRecord | undefined;
  let cat: CatalogRecord | undefined;
  let draftRaw: unknown;
  try {
    [snap, cat, draftRaw] = await Promise.all([
      store.getKv<SnapshotRecord>("snapshot"),
      store.getKv<CatalogRecord>("catalog"),
      store.getKv<unknown>("active_session"),
    ]);
  } catch {
    // อ่านไม่ได้ — เริ่มว่าง
  }
  c.snapshotIds = idsOf(snap?.data ?? null);
  rebuild(c, {
    ready: true,
    snapshot: snap?.data ?? null,
    snapshotAt: snap?.fetched_at ?? null,
    catalog: cat?.data ?? null,
    activeSession: parseDraft(draftRaw),
    ops: await store.outboxAll().catch(() => []),
  });
  await c.engine.refreshStatus();
  setStatus(c.engine.getStatus());

  if (deps.listen) installTriggers(c);
  void deps.persist().catch(() => false);
  // เปิดแอป (เฉพาะเมื่อยืนยันตัวตนแล้ว): ส่งก่อน แล้วดึง (ไม่ให้ snapshot เก่าทับสิ่งที่เพิ่งส่ง)
  if (c.verified) void c.engine.kick().then(() => refreshSnapshot());
}

/** ยืนยันว่า session ฝั่งเซิร์ฟเวอร์ยังเป็นผู้ใช้คนเดียวกับฐานที่เปิดอยู่ (กันคิว/snapshot ปนข้ามผู้ใช้หลัง 401 หรือสลับบัญชีคนละแท็บ) */
async function verifySameUser(c: Ctx): Promise<boolean> {
  try {
    const res = await c.deps.fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { state?: unknown; user?: { id?: unknown } } | null;
    const id = typeof body?.user?.id === "string" ? body.user.id : null;
    if (id && id !== c.userId) {
      if (ctx === c) closeOffline();
      return false;
    }
    return body?.state === "ready" && id === c.userId;
  } catch {
    return false;
  }
}

async function safeKick(c: Ctx): Promise<boolean> {
  if (c.closed || !c.verified) return false;
  if (c.engine.getStatus().phase === "auth_required") {
    if (!(await verifySameUser(c)) || c.closed) return false;
  }
  const out = await c.engine.kick();
  return out !== "auth_required" && out !== "blocked";
}

function installTriggers(c: Ctx) {
  let hiddenAt: number | null = null;
  const onOnline = () => void safeKick(c);
  const onWake = () => {
    const away = hiddenAt === null ? 0 : c.deps.now() - hiddenAt;
    hiddenAt = null;
    void safeKick(c).then((ok) => {
      if (!ok || c.closed) return;
      if (away > BOOTSTRAP_STALE_MS || (c.view.snapshotAt !== null && c.deps.now() - c.view.snapshotAt > BOOTSTRAP_STALE_MS)) void refreshSnapshot();
    });
  };
  const onVis = () => {
    if (document.visibilityState === "visible") onWake();
    else hiddenAt = c.deps.now();
  };
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) onWake();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVis);
  const interval = setInterval(() => {
    if (!c.closed && c.verified && c.engine.getStatus().phase !== "auth_required" && c.engine.getStatus().pending > 0) void c.engine.flush();
  }, PERIODIC_FLUSH_MS);
  c.cleanup.push(() => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVis);
    clearInterval(interval);
  });
}

/** ปิดฐานและหยุดส่ง (ไม่ลบข้อมูล) — ก่อน resetDeviceAfterSignOut เพื่อไม่ให้ฐานที่เปิดอยู่ขวางการลบ */
export function closeOffline(): void {
  const c = ctx;
  if (!c) return;
  c.closed = true;
  if (c.bootstrapTimer !== null) c.deps.clearTimeout(c.bootstrapTimer);
  for (const f of c.cleanup) f();
  c.engine.stop();
  try {
    c.store.close();
  } catch {
    // ปิดไปแล้ว
  }
  ctx = null;
  setView(EMPTY_VIEW);
  setStatus(EMPTY_STATUS);
}

/** user id ของฐานที่เปิดอยู่ (null = ยังไม่เปิด) */
export const getOfflineUser = (): string | null => ctx?.userId ?? null;

// ---------------- สถานะ / มุมมอง ----------------

export const getSyncStatus = (): SyncStatus => status;
export const getServerSyncStatus = (): SyncStatus => EMPTY_STATUS;
export function subscribeSyncStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
}

export const getLocalView = (): LocalView => view;
export const getServerLocalView = (): LocalView => EMPTY_VIEW;
export function subscribeLocalView(fn: () => void): () => void {
  viewListeners.add(fn);
  return () => {
    viewListeners.delete(fn);
  };
}

// ---------------- เขียน ----------------

/** client_updated_at ไม่ถอยหลังในเครื่องเดียวกัน (เขียนสองครั้งในมิลลิวินาทีเดียว = ต่างกัน 1 ms) */
function issueTime(c: Ctx): string {
  const t = Math.max(c.deps.now(), c.lastIssuedMs + 1);
  c.lastIssuedMs = t;
  return new Date(t).toISOString();
}

function storageFail(c: Ctx, e: unknown): WriteResult {
  const err = e instanceof OfflineStorageError ? e : toStorageError(e);
  c.engine.setStorageError(err.kind);
  return { ok: false, reason: err.kind === "quota" ? "storage_full" : "storage_unavailable" };
}

async function enqueueOne(
  c: Ctx,
  w: { entity: OutboxEntity; id: string; action: "upsert" | "delete"; data: Record<string, unknown> | null; create?: boolean; display?: OpDisplay },
): Promise<WriteResult> {
  try {
    const result = await c.store.enqueue(
      { ...w, client_updated_at: issueTime(c) },
      { opId: c.deps.uuid(), now: c.deps.now(), knownInSnapshot: (id) => c.snapshotIds.has(id) },
    );
    return { ok: true, result };
  } catch (e) {
    return storageFail(c, e);
  }
}

async function afterWrite(c: Ctx) {
  if (c.view.memoryOnly) c.engine.setStorageError("unavailable");
  else c.engine.setStorageError(null);
  await reloadOps(c);
  await c.engine.refreshStatus();
  if (c.verified && c.engine.getStatus().phase !== "auth_required") c.engine.scheduleFlush(WRITE_DEBOUNCE_MS);
}

/**
 * upsert ทั้งแถว (ช่องที่ไคลเอนต์ตั้งได้ ตาม zod ใน src/lib/data/shared) ลงคิว
 * create = id เพิ่งสร้างในเครื่องนี้ (แถวใหม่) · display = ข้อมูลไว้แสดงถ้าส่งไม่ผ่าน (ไม่ขึ้นเซิร์ฟเวอร์)
 */
export async function writeEntity(
  entity: OutboxEntity,
  id: string,
  data: Record<string, unknown>,
  opts: { create?: boolean; display?: OpDisplay } = {},
): Promise<WriteResult> {
  const c = ctx;
  if (!c) return { ok: false, reason: "not_ready" };
  const r = await enqueueOne(c, { entity, id, action: "upsert", data, ...opts });
  if (r.ok) await afterWrite(c);
  return r;
}

/** ลบแถว · แถวที่ยังไม่เคยส่ง = เอาออกจากคิว (รวมลูกหลาน) ไม่ส่งอะไร (`result: "cancelled"`) */
export async function deleteEntity(entity: OutboxEntity, id: string, opts: { display?: OpDisplay } = {}): Promise<WriteResult> {
  const c = ctx;
  if (!c) return { ok: false, reason: "not_ready" };
  const r = await enqueueOne(c, { entity, id, action: "delete", data: null, ...opts });
  if (r.ok) await afterWrite(c);
  return r;
}

/**
 * ลงผลของฟังก์ชันใน session.ts: เขียนคิวตามลำดับก่อน แล้วค่อยบันทึกร่าง
 * (ร่างบันทึกไม่ได้หลังคิวลงแล้ว = เปิดใหม่ร่างเก่ากว่าคิว — ติ๊กซ้ำจะรวมกับรายการเดิมด้วย id เดิม ไม่เกิดแถวซ้ำ)
 * ล้มกลางทาง → คืน error · หน้าจอคงร่างเดิมไว้แล้วบอก "ยังบันทึกไม่ได้"
 */
export async function applySessionChange(change: SessionChange): Promise<WriteResult> {
  const c = ctx;
  if (!c) return { ok: false, reason: "not_ready" };
  let last: WriteResult = { ok: true, result: "queued" };
  for (const w of change.writes) {
    last = await enqueueOne(c, { ...w, data: w.data });
    if (!last.ok) {
      await afterWrite(c);
      c.engine.setStorageError(last.reason === "storage_full" ? "quota" : "unavailable");
      return last;
    }
  }
  try {
    if (change.draft) await c.store.setKv("active_session", change.draft);
    else await c.store.deleteKv("active_session");
  } catch (e) {
    const r = storageFail(c, e);
    if (change.writes.length > 0) await afterWrite(c);
    return r;
  }
  rebuild(c, { activeSession: change.draft });
  if (change.writes.length > 0) await afterWrite(c);
  return last;
}

/**
 * เปิดแอป/เข้าหน้าจด: ตัดสินร่างที่ค้างตาม D5 · > 24 ชม. จบให้เอง (หรือทิ้งถ้าไม่มีเซ็ต) แล้วคืน auto_end ให้แสดง toast
 * ไม่มีร่าง = null (หน้าจอดู snapshot.active_sessions เพื่อเสนอเล่นต่อจากอีกเครื่อง)
 */
export async function checkActiveSession(): Promise<ResumeDecision | null> {
  const c = ctx;
  const d = c?.view.activeSession;
  if (!c || !d) return null;
  const dec = resumeDecision(d, c.deps.now());
  if (dec.kind === "auto_end") await applySessionChange(dec.endAt === null ? discardSession(d) : finishSession(d, dec.endAt));
  return dec;
}

/** เล่นต่อเซสชันที่ยังไม่จบจากอีกเครื่อง (snapshot.active_sessions) */
export async function resumeServerSession(ws: WireSession): Promise<WriteResult> {
  const c = ctx;
  if (!c) return { ok: false, reason: "not_ready" };
  return applySessionChange({ draft: draftFromWire(ws, c.deps.now()), writes: [] });
}

// ---------------- ส่ง / ดึง ----------------

/** "ส่งเลย" · คืนผลรอบนี้ (ไม่ส่งหากยังไม่ยืนยันตัวตน) */
export async function syncNow(): Promise<FlushOutcome | "not_ready"> {
  const c = ctx;
  if (!c) return "not_ready";
  if (!c.verified) return "pending";
  if (c.engine.getStatus().phase === "auth_required") {
    if (!(await verifySameUser(c)) || c.closed) return "auth_required";
  }
  return c.engine.kick();
}

function scheduleBootstrap(c: Ctx, ms: number) {
  if (c.closed || !c.verified) return;
  if (c.bootstrapTimer !== null) c.deps.clearTimeout(c.bootstrapTimer);
  c.bootstrapTimer = c.deps.setTimeout(() => {
    c.bootstrapTimer = null;
    void refreshSnapshot();
  }, ms);
}

const isBootstrap = (v: unknown): v is BootstrapResponse =>
  typeof v === "object" && v !== null && Array.isArray((v as BootstrapResponse).places) && Array.isArray((v as BootstrapResponse).my_exercises);

/** ดึง /api/bootstrap แทน snapshot ทั้งก้อน · คำตอบที่ถามก่อน apply ล่าสุดถูกทิ้งแล้วถามใหม่ (≤ 3 รอบ) · คืน true = ได้ของใหม่ */
export async function refreshSnapshot(): Promise<boolean> {
  const c = ctx;
  if (!c || c.closed || !c.verified || c.engine.getStatus().phase === "auth_required") return false;
  if (c.bootstrapInflight) return c.bootstrapInflight;
  c.bootstrapInflight = (async () => {
    for (let i = 0; i < 3; i++) {
      const epoch = c.appliedEpoch;
      let body: unknown;
      try {
        const res = await c.deps.fetch("/api/bootstrap", { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) return false;
        body = await res.json();
      } catch {
        return false;
      }
      if (!isBootstrap(body)) return false;
      if (epoch !== c.appliedEpoch) continue;
      if (c.closed || !c.verified) return false;
      const rec: SnapshotRecord = { data: body, fetched_at: c.deps.now() };
      try {
        await c.store.setKv("snapshot", rec);
      } catch (e) {
        c.engine.setStorageError(toStorageError(e).kind);
      }
      c.snapshotIds = idsOf(body);
      rebuild(c, { snapshot: body, snapshotAt: rec.fetched_at, ops: await c.store.outboxAll().catch(() => c.view.ops) });
      if (body.catalog_version !== c.view.catalog?.catalog_version) void refreshCatalog();
      return true;
    }
    return false;
  })().finally(() => {
    c.bootstrapInflight = null;
  });
  return c.bootstrapInflight;
}

/** ดึงคลังท่ากลางเก็บในเครื่อง (ใช้ตอนออฟไลน์) · เรียกเองเมื่อ catalog_version เปลี่ยน */
export async function refreshCatalog(): Promise<boolean> {
  const c = ctx;
  if (!c || c.closed || !c.verified) return false;
  try {
    const res = await c.deps.fetch("/api/catalog", { credentials: "same-origin" });
    if (!res.ok) return false;
    const body = (await res.json()) as CatalogResponse;
    if (typeof body?.catalog_version !== "string" || !Array.isArray(body.exercises)) return false;
    try {
      await c.store.setKv("catalog", { data: body, fetched_at: c.deps.now() } satisfies CatalogRecord);
    } catch (e) {
      c.engine.setStorageError(toStorageError(e).kind);
    }
    rebuild(c, { catalog: body });
    return true;
  } catch {
    return false;
  }
}

// ---------------- ส่งไม่ผ่าน ----------------

/** แถวของแผ่น "ส่งไม่ผ่าน" ใหม่สุดก่อน · ลูกที่ตกตามพ่อแม่รวมในกลุ่ม · reason แยก track_type_changed ได้ */
export async function listRejected(): Promise<RejectedGroup[]> {
  const c = ctx;
  if (!c) return [];
  const items = await c.store.rejectedAll().catch(() => []);
  const ex = new Map<string, { track_type: string; load_mode: string }>();
  for (const e of c.view.catalog?.exercises ?? []) ex.set(e.id, e);
  for (const e of c.view.myExercises) ex.set(e.id, e);
  return groupRejected(items, (id) => ex.get(id));
}

/**
 * ทิ้งรายการที่ส่งไม่ผ่าน (opIds ของทั้งกลุ่ม) · ไม่ถาม — หน้าจอทำ "เลิกทำ 5 วิ" โดยเลื่อนการเรียกฟังก์ชันนี้ไปหลังหมดเวลา
 * แล้วให้ในเครื่องตรงกับเซิร์ฟเวอร์: เอาแถวออกจากร่างเซสชัน + ดึง snapshot ใหม่ (UX 13.7 ง)
 */
export async function discardRejected(opIds: string[]): Promise<void> {
  const c = ctx;
  if (!c) return;
  const items = (await c.store.rejectedAll().catch(() => [])).filter((i) => opIds.includes(i.op_id));
  for (const id of opIds) await c.store.rejectedDelete(id).catch(() => {});
  const d = c.view.activeSession;
  if (d && items.length > 0) {
    const nd = dropRowsFromDraft(d, items);
    await applySessionChange({ draft: nd, writes: [] });
  }
  await c.engine.refreshStatus();
  await refreshSnapshot();
}

// ---------------- ออกจากระบบ ----------------

export type SignOutFlush = {
  /** คิวว่างและไม่มีส่งไม่ผ่าน → ออกได้เลย (แผ่น CR2) */
  clean: boolean;
  /** แถวที่ยังค้าง (รวมส่งไม่ผ่าน — UX 13.3 "N นับรวม M") */
  pending: number;
  rejected: number;
  /** ส่งไม่ได้ภายในเวลา / ติด 401 */
  outcome: FlushOutcome | "timeout" | "not_ready";
};

/**
 * "ลองส่งก่อนออก" — คืนผลภายใน timeoutMs (~5 วิ ตาม UX 13.3) แม้การส่งยังไม่จบ (ส่งต่อเบื้องหลังได้)
 * ไม่จบเซสชันที่เล่นอยู่ให้ (Lead ตัดสิน · D5 ดูแล) · ลบฐานทำที่ resetDeviceAfterSignOut หลัง signOut สำเร็จ
 */
export async function flushBeforeSignOut(timeoutMs = SIGN_OUT_FLUSH_MS): Promise<SignOutFlush> {
  const c = ctx;
  if (!c) return { clean: true, pending: 0, rejected: 0, outcome: "not_ready" };
  if (!c.verified) {
    const s = await c.engine.refreshStatus();
    return { clean: s.pending === 0 && s.rejected === 0, pending: s.pending + s.rejected, rejected: s.rejected, outcome: "pending" };
  }
  if (c.engine.getStatus().phase === "auth_required") {
    if (!(await verifySameUser(c)) || c.closed) {
      const s = await c.engine.refreshStatus();
      return { clean: s.pending === 0 && s.rejected === 0, pending: s.pending + s.rejected, rejected: s.rejected, outcome: "auth_required" };
    }
  }
  let timer: unknown = null;
  const outcome = await Promise.race<FlushOutcome | "timeout">([
    c.engine.kick(),
    new Promise<"timeout">((resolve) => {
      timer = c.deps.setTimeout(() => resolve("timeout"), timeoutMs);
    }),
  ]);
  if (timer !== null) c.deps.clearTimeout(timer);
  const s = await c.engine.refreshStatus();
  return { clean: s.pending === 0 && s.rejected === 0, pending: s.pending + s.rejected, rejected: s.rejected, outcome };
}
