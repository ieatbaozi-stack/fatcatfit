"use client";
// คลังท่า + ข้อมูลของฉัน (bootstrap) ที่หน้าจอ R2 ใช้ — R3a: อ่านจากข้อมูลในเครื่อง (src/lib/offline) ไม่ถามเซิร์ฟเวอร์เองแล้ว
// มุมมอง = snapshot ทับด้วยคิวที่ยังไม่ส่ง (สถานที่/ท่าของฉัน) · การเขียนไปที่ client.ts ผ่าน place-actions / exercise-form

import { useEffect, useMemo, useState } from "react";
import { refreshCatalog, refreshSnapshot } from "@/lib/offline/client";
import type { BootstrapResponse, CatalogResponse } from "@/lib/data/shared/sync";
import { useLocalView } from "@/components/sync/use-offline";

export type FailReason = "auth" | "error" | "network";
export type Slice<T> = { status: "idle" | "loading" | "ready" | "error"; data: T | null; reason: FailReason | null };
export type StoreState = { catalog: Slice<CatalogResponse>; bootstrap: Slice<BootstrapResponse> };

/**
 * ค่าที่หน้าจอต้องการ · need: ต้องมีอะไรบ้าง · online: ออนไลน์อยู่ไหม
 * มีของในเครื่องแล้ว = พร้อมเลย (ออฟไลน์ก็ใช้ได้) · ยังไม่มีและออนไลน์ = ดึงให้ · ออฟไลน์และไม่มี = error "network"
 */
export function useCatalogStore(need: { catalog: boolean; bootstrap: boolean }, online: boolean): StoreState & { retry: () => void } {
  const view = useLocalView();
  const [failed, setFailed] = useState({ catalog: false, bootstrap: false });
  const [tries, setTries] = useState(0);
  const hasSnapshot = view.snapshot !== null;
  const hasCatalog = view.catalog !== null;

  useEffect(() => {
    if (!view.ready || !online) return;
    // ดึงข้อมูลจากภายนอกตอนเปิดหน้า/กลับมาออนไลน์ — setState เกิดหลังคำตอบ ไม่ใช่ตอน render
    if (need.bootstrap && !hasSnapshot) void refreshSnapshot().then((ok) => ok || setFailed((f) => ({ ...f, bootstrap: true })));
    if (need.catalog && !hasCatalog) void refreshCatalog().then((ok) => ok || setFailed((f) => ({ ...f, catalog: true })));
  }, [view.ready, online, need.bootstrap, need.catalog, hasSnapshot, hasCatalog, tries]);

  const bootstrap = useMemo<Slice<BootstrapResponse>>(() => {
    if (view.snapshot) return { status: "ready", data: { ...view.snapshot, places: view.places, my_exercises: view.myExercises }, reason: null };
    if (!view.ready) return { status: "loading", data: null, reason: null };
    if (!online) return { status: "error", data: null, reason: "network" };
    return failed.bootstrap ? { status: "error", data: null, reason: "error" } : { status: "loading", data: null, reason: null };
  }, [view.snapshot, view.places, view.myExercises, view.ready, online, failed.bootstrap]);

  const catalog = useMemo<Slice<CatalogResponse>>(() => {
    if (view.catalog) return { status: "ready", data: view.catalog, reason: null };
    if (!view.ready) return { status: "loading", data: null, reason: null };
    if (!online) return { status: "error", data: null, reason: "network" };
    return failed.catalog ? { status: "error", data: null, reason: "error" } : { status: "loading", data: null, reason: null };
  }, [view.catalog, view.ready, online, failed.catalog]);

  const retry = () => {
    setFailed({ catalog: false, bootstrap: false });
    setTries((n) => n + 1);
  };
  return { catalog, bootstrap, retry };
}
