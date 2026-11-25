"use client";
// เวลาปัจจุบันสำหรับวาดหน้าจอ — เรียกซ้ำตามช่วง + ทันทีที่หน้ากลับมาให้เห็น (จอดับ/สลับแอป · research ข้อ 5b)
// ค่าที่แสดงต้องคำนวณจาก timestamp ที่เก็บไว้เสมอ ไม่นับ tick สะสม (ตัวจับเวลาถูกแม้จอดับ)

import { useEffect, useState } from "react";
import { startTicker } from "@/lib/offline/timer";

export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const stop = startTicker(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      stop();
    };
  }, [active, intervalMs]);
  return now;
}
