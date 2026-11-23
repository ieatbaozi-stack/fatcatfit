"use client";

import { useEffect, useState } from "react";

/**
 * ความสูงที่แป้นพิมพ์บนมือถือบังขอบล่าง (px) จาก visualViewport — 0 = ไม่มีแป้นพิมพ์/เบราว์เซอร์ไม่รองรับ
 * ใช้ยกแผ่นล่าง/ปุ่มหลักให้ลอยเหนือแป้นพิมพ์ (UX ข้อ 7)
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // เกิน 80px ถึงถือว่าเป็นแป้นพิมพ์ (แถบ URL ที่หด/ขยายไม่ถึง)
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** `true` หลังจาก `flag` เป็นจริงต่อเนื่องครบ `ms` — ใช้กัน skeleton กะพริบ (โหลด < 400 ms ไม่แสดง) */
export function useAfter(flag: boolean, ms: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!flag) {
      // flag ดับ = เริ่มนับใหม่รอบหน้า
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(false);
      return;
    }
    const id = window.setTimeout(() => setDone(true), ms);
    return () => window.clearTimeout(id);
  }, [flag, ms]);
  return flag && done;
}
