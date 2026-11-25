// ตัวจับเวลาพัก + ▶ จับเวลาท่า duration (ADR 0004 ข้อ 7 · contract D1 · เกณฑ์ 12)
// หลัก: เก็บเวลาเริ่มเป็น epoch ms แล้วคำนวณจากนาฬิกาทุกครั้งที่วาด — ไม่นับ tick สะสม
// จอดับ/สลับแอป JS ถูกพัก (research 2026-11-24-r3-ios-pwa ข้อ 5) → กลับมาคำนวณใหม่จาก timestamp จึงถูกเสมอ
// เก็บค่าใน active_session (ร่างเซสชัน) จึงอยู่รอดการปิดแอป · สั่น/Wake Lock เป็นของแถม feature-detect เท่านั้น

import type { TrackType } from "@/lib/data/shared/exercise-meta";

export const DEFAULT_REST_S = 90;
export const REST_STEP_S = 15;

/** ตัวจับเวลาพัก: เริ่มเมื่อไหร่ ยาวเท่าไร (ปรับ −15/+15 แก้ duration_s ของรอบนั้น) */
export type RestTimer = { started_at: number; duration_s: number };

/** ▶ ของท่า duration: เริ่มเมื่อไหร่ · หยุดแล้ว = stopped_at */
export type Stopwatch = { started_at: number; stopped_at: number | null };

/** D1: พักเริ่มเองหลัง ✓ ยกเว้นท่าคาร์ดิโอ (ระยะ+เวลา และลู่วิ่ง) */
export function restAppliesTo(trackType: TrackType | string): boolean {
  return trackType !== "distance_duration" && trackType !== "incline_speed_duration";
}

export function startRest(now: number, durationS = DEFAULT_REST_S): RestTimer {
  return { started_at: now, duration_s: durationS };
}

/** มิลลิวินาทีที่เหลือ (ไม่ติดลบ) */
export function restRemainingMs(t: RestTimer, now: number): number {
  return Math.max(0, t.started_at + t.duration_s * 1000 - now);
}

/** วินาทีที่เหลือสำหรับแสดง (ปัดขึ้น: เหลือ 29.2 วิ แสดง 0:30) */
export function restRemainingS(t: RestTimer, now: number): number {
  return Math.ceil(restRemainingMs(t, now) / 1000);
}

export const restDone = (t: RestTimer, now: number) => restRemainingMs(t, now) === 0;

/** −15/+15 วิ ของรอบนี้ · ไม่ให้สั้นกว่าเวลาที่ผ่านไปแล้ว (ลดจนติดลบ = ครบทันที) */
export function adjustRest(t: RestTimer, deltaS: number, now: number): RestTimer {
  const elapsedS = Math.max(0, (now - t.started_at) / 1000);
  return { ...t, duration_s: Math.max(Math.ceil(elapsedS), t.duration_s + deltaS) };
}

export function startStopwatch(now: number): Stopwatch {
  return { started_at: now, stopped_at: null };
}

export function stopStopwatch(s: Stopwatch, now: number): Stopwatch {
  return s.stopped_at === null ? { ...s, stopped_at: now } : s;
}

/** วินาทีที่ผ่านไป (ปัดลง) — ใช้เป็น duration_s ของเซ็ตเมื่อหยุด */
export function stopwatchElapsedS(s: Stopwatch, now: number): number {
  const end = s.stopped_at ?? now;
  return Math.max(0, Math.floor((end - s.started_at) / 1000));
}

/** เวลา m:ss หรือ h:mm:ss เมื่อเกิน 59:59 (contract D4) */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * เรียก onWake เมื่อหน้ากลับมาให้เห็น/ได้ focus — ให้ผู้ใช้วาดเวลาใหม่ทันที
 * ฟังทั้ง visibilitychange, pageshow, focus เพราะ iOS ไม่การันตี visibilitychange ตอนล็อกจอ (research ข้อ 5b)
 */
export function subscribeWake(onWake: () => void, target: { doc?: Document; win?: Window } = {}): () => void {
  const doc = target.doc ?? (typeof document === "undefined" ? undefined : document);
  const win = target.win ?? (typeof window === "undefined" ? undefined : window);
  const onVis = () => {
    if (!doc || doc.visibilityState === "visible") onWake();
  };
  doc?.addEventListener("visibilitychange", onVis);
  win?.addEventListener("pageshow", onWake);
  win?.addEventListener("focus", onWake);
  return () => {
    doc?.removeEventListener("visibilitychange", onVis);
    win?.removeEventListener("pageshow", onWake);
    win?.removeEventListener("focus", onWake);
  };
}

/**
 * นาฬิกาสำหรับหน้าจอ: เรียก onTick ทุก intervalMs ขณะเปิดอยู่ + ทันทีเมื่อกลับมา
 * ค่าที่แสดงต้องคำนวณจาก Date.now() ใน onTick เสมอ (tick นี้แค่บอกให้วาดใหม่)
 */
export function startTicker(onTick: () => void, intervalMs = 250): () => void {
  const id = setInterval(onTick, intervalMs);
  const off = subscribeWake(onTick);
  return () => {
    clearInterval(id);
    off();
  };
}

/** สั่นถ้ามี (Android) · iOS ไม่มี navigator.vibrate (research ข้อ 3) → คืน false · ไม่โยน */
export function tryVibrate(pattern: number | number[] = [200, 100, 200], nav: Navigator | undefined = globalThis.navigator): boolean {
  try {
    if (!nav || typeof nav.vibrate !== "function") return false;
    return nav.vibrate(pattern);
  } catch {
    return false;
  }
}

type WakeLockLike = { release(): Promise<void> };

/** ขอให้จอไม่ดับระหว่างอยู่หน้าจด (ของแถม · iOS 18.4+ ในแอปที่ติดตั้ง · research ข้อ 5c) · ไม่มี/ถูกปฏิเสธ = null */
export async function requestWakeLock(nav: Navigator | undefined = globalThis.navigator): Promise<WakeLockLike | null> {
  try {
    const wl = (nav as unknown as { wakeLock?: { request(type: "screen"): Promise<WakeLockLike> } } | undefined)?.wakeLock;
    if (!wl || typeof wl.request !== "function") return null;
    return await wl.request("screen");
  } catch {
    return null;
  }
}
