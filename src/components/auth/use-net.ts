"use client";

import { useOnline } from "@/pwa/use-online";
import type { Net } from "./decide-route";

/** สถานะเครือข่ายของจอ auth — ใช้ตัวตรวจเน็ตตัวเดียวของทั้งแอป (`useOnline` ของ pwa-offline) */
export function useNet(): Net {
  return useOnline() ? "online" : "offline";
}
