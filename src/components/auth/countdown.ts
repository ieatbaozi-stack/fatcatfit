"use client";

import { useSyncExternalStore } from "react";

/** mm:ss (นาทีไม่เติมศูนย์ · วินาทีเติม) เช่น 4:59 · 0:42 */
export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function subscribeEverySecond(notify: () => void) {
  const id = window.setInterval(notify, 1000);
  return () => window.clearInterval(id);
}

const noSubscribe = () => () => {};
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** วินาทีที่เหลือจนถึง deadline (epoch ms) · null = ไม่มีการนับ · render ใหม่ทุกวินาทีขณะยังนับ */
export function useCountdown(deadline: number | null): number {
  const now = useSyncExternalStore(deadline === null ? noSubscribe : subscribeEverySecond, nowSeconds, () => 0);
  if (deadline === null) return 0;
  return Math.max(0, Math.floor(deadline / 1000) - now);
}
