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
  const p = fetchBootstrap().then((r) => {
    inflight.bootstrap = null;
    if (r.ok) set({ ...state, bootstrap: { status: "ready", data: r.data, reason: null } });
    else set({ ...state, bootstrap: { status: keep ? "ready" : "error", data: keep, reason: keep ? null : r.reason } });
  });
  inflight.bootstrap = p;
  return p;
}

// ---- แก้ในเครื่องหลังเขียนสำเร็จ (เซิร์ฟเวอร์ตอบ applied แล้วเท่านั้น) ----

function patchBootstrap(fn: (b: BootstrapResponse) => BootstrapResponse): void {
  const cur = state.bootstrap.data;
  if (!cur) return;
  set({ ...state, bootstrap: { ...state.bootstrap, data: fn(cur) } });
}

export function upsertMyExercise(row: WireExercise): void {
  patchBootstrap((b) => ({
    ...b,
    my_exercises: b.my_exercises.some((e) => e.id === row.id) ? b.my_exercises.map((e) => (e.id === row.id ? row : e)) : [...b.my_exercises, row],
  }));
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
