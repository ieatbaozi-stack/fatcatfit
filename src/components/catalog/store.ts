"use client";
// คลังท่า + ข้อมูลของฉัน (bootstrap) ในหน่วยความจำของแท็บ (R2) — โหลดครั้งเดียวใช้ซ้ำทุกหน้า (UX 12.4)
// ไม่เขียน storage ใดๆ (ออฟไลน์จริงเป็นงาน R3) · ออกจากระบบ = โหลดหน้าเต็ม state หายเอง

import { useEffect, useSyncExternalStore } from "react";
import type { BootstrapResponse, CatalogResponse, WireExercise, WirePlace } from "@/lib/data/shared/sync";
import { fetchBootstrap, fetchCatalog, type FailReason } from "./api";

export type Slice<T> = { status: "idle" | "loading" | "ready" | "error"; data: T | null; reason: FailReason | null };

export type StoreState = { catalog: Slice<CatalogResponse>; bootstrap: Slice<BootstrapResponse> };

const idle = <T,>(): Slice<T> => ({ status: "idle", data: null, reason: null });

let state: StoreState = { catalog: idle(), bootstrap: idle() };
const listeners = new Set<() => void>();
/** นับการเขียนในเครื่อง (patch) — ใช้ทิ้งคำตอบ bootstrap ที่ถามก่อนการเขียนล่าสุด */
let writeSeq = 0;
const MAX_RETRY = 3;
const inflight: { catalog: Promise<void> | null; bootstrap: Promise<void> | null } = { catalog: null, bootstrap: null };

function set(next: StoreState) {
  state = next;
  for (const l of listeners) l();
}

export function getStoreState(): StoreState {
  return state;
}

/** ล้างทุกอย่าง (ใช้ในเทสต์) */
export function resetStore(): void {
  inflight.catalog = null;
  inflight.bootstrap = null;
  writeSeq += 1;
  set({ catalog: idle(), bootstrap: idle() });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** โหลดคลังกลาง: มีแล้ว = ไม่โหลดซ้ำ (เว้น force) · ระหว่างโหลดเรียกซ้ำ = รอตัวเดิม */
export function loadCatalog(opts: { force?: boolean } = {}): Promise<void> {
  if (inflight.catalog) return inflight.catalog;
  if (state.catalog.status === "ready" && !opts.force) return Promise.resolve();
  const keep = state.catalog.data;
  set({ ...state, catalog: { status: keep ? "ready" : "loading", data: keep, reason: null } });
  const p = fetchCatalog().then((r) => {
    inflight.catalog = null;
    if (r.ok) set({ ...state, catalog: { status: "ready", data: r.data, reason: null } });
    else set({ ...state, catalog: { status: keep ? "ready" : "error", data: keep, reason: keep ? null : r.reason } });
  });
  inflight.catalog = p;
  return p;
}

/** โหลดข้อมูลของฉัน: เรียกซ้ำ = ถามใหม่เงียบๆ (มีค่าเดิมแสดงอยู่ ไม่กลับไปสถานะโหลด) */
export function loadBootstrap(): Promise<void> {
  if (inflight.bootstrap) return inflight.bootstrap;
  const keep = state.bootstrap.data;
  set({ ...state, bootstrap: { status: keep ? "ready" : "loading", data: keep, reason: null } });
  // คำตอบที่ส่งไปก่อนการเขียนในเครื่องล่าสุดอาจเป็นข้อมูลก่อนเขียน (เช่น ถามค้างจากขั้นก่อนหน้าแล้วตอบมาหลังเก็บเข้ากรุ)
  // → ทิ้งแล้วถามใหม่ ไม่เอาไปทับ (ไม่งั้นท่าที่เพิ่งเก็บ/ลบกลับมาโผล่) · จำกัดรอบกันวนไม่จบ
  const p = (async () => {
    let seq = writeSeq;
    let r = await fetchBootstrap();
    for (let i = 0; i < MAX_RETRY && r.ok && seq !== writeSeq; i++) {
      seq = writeSeq;
      r = await fetchBootstrap();
    }
    inflight.bootstrap = null;
    if (r.ok) set({ ...state, bootstrap: { status: "ready", data: r.data, reason: null } });
    else set({ ...state, bootstrap: { status: keep ? "ready" : "error", data: keep, reason: keep ? null : r.reason } });
  })();
  inflight.bootstrap = p;
  return p;
}

// ---- แก้ในเครื่องหลังเขียนสำเร็จ (เซิร์ฟเวอร์ตอบ applied แล้วเท่านั้น) ----

function patchBootstrap(fn: (b: BootstrapResponse) => BootstrapResponse): void {
  const cur = state.bootstrap.data;
  if (!cur) return;
  writeSeq += 1;
  set({ ...state, bootstrap: { ...state.bootstrap, data: fn(cur) } });
}

export function upsertMyExercise(row: WireExercise): void {
  patchBootstrap((b) => {
    // has_history (R3) มาจากเซิร์ฟเวอร์: แถวที่ประกอบในเครื่องคงค่าเดิมของแถวนั้น · แถวใหม่ = false
    const prev = b.my_exercises.find((e) => e.id === row.id);
    const next = { has_history: prev?.has_history ?? false, ...row };
    return { ...b, my_exercises: prev ? b.my_exercises.map((e) => (e.id === row.id ? next : e)) : [...b.my_exercises, next] };
  });
}

export function removeMyExercise(id: string): void {
  patchBootstrap((b) => ({ ...b, my_exercises: b.my_exercises.filter((e) => e.id !== id) }));
}

export function upsertPlace(row: WirePlace): void {
  patchBootstrap((b) => ({
    ...b,
    places: b.places.some((p) => p.id === row.id) ? b.places.map((p) => (p.id === row.id ? row : p)) : [...b.places, row],
  }));
}

/** ลบสถานที่ออกจากข้อมูลในแท็บ (หลังเซิร์ฟเวอร์ตอบ applied) — ชิปหน้าหลักคำนวณใหม่เป็นที่ใช้ล่าสุดถัดไปเอง */
export function removePlace(id: string): void {
  patchBootstrap((b) => ({ ...b, places: b.places.filter((p) => p.id !== id) }));
}

/** ค่าที่หน้าจอต้องการ · need: ต้องโหลดอะไรบ้าง · online: ออนไลน์อยู่ไหม (ออฟไลน์ไม่ยิง · กลับมาออนไลน์ = โหลดเอง) */
export function useCatalogStore(need: { catalog: boolean; bootstrap: boolean }, online: boolean): StoreState & { retry: () => void } {
  const snap = useSyncExternalStore(subscribe, getStoreState, getStoreState);

  useEffect(() => {
    if (!online) return;
    // ดึงข้อมูลจากภายนอกตอนเปิดหน้า/กลับมาออนไลน์ — state เปลี่ยนหลังคำตอบ ไม่ใช่ตอน render
    if (need.catalog) void loadCatalog({ force: state.catalog.status === "error" });
    if (need.bootstrap) void loadBootstrap();
  }, [online, need.catalog, need.bootstrap]);

  const retry = () => {
    if (need.catalog) void loadCatalog({ force: true });
    if (need.bootstrap) void loadBootstrap();
  };
  return { ...snap, retry };
}
