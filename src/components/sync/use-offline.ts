"use client";
// ตัวอ่านข้อมูลในเครื่อง (pwa-offline) สำหรับหน้าจอ — ตัวเดียวของแอป · SSR/ก่อน hydrate = ค่าว่าง (HTML เหมือนกันทุกสถานะ)

import { useSyncExternalStore } from "react";
import { getLocalView, getServerLocalView, getServerSyncStatus, getSyncStatus, subscribeLocalView, subscribeSyncStatus, type LocalView } from "@/lib/offline/client";
import type { SyncStatus } from "@/lib/offline/types";

export function useLocalView(): LocalView {
  return useSyncExternalStore(subscribeLocalView, getLocalView, getServerLocalView);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getServerSyncStatus);
}
