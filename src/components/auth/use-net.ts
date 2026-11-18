"use client";

import { useSyncExternalStore } from "react";
import type { Net } from "./decide-route";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/**
 * สถานะเครือข่ายของจอ auth — ช่วง A อ่าน navigator.onLine ตรงนี้
 * ช่วง B: เปลี่ยนตัวนี้ให้คืนค่าจาก useOnline() ของ pwa-offline (ตัวตรวจเน็ตตัวเดียวทั้งแอป) · จุดเดียวที่ต้องแก้
 */
export function useNet(): Net {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // ตอน SSR/hydrate ถือว่าออนไลน์ (กัน hydration mismatch)
  );
  return online ? "online" : "offline";
}
