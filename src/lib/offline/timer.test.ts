// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adjustRest,
  DEFAULT_REST_S,
  formatClock,
  requestWakeLock,
  restAppliesTo,
  restDone,
  restRemainingS,
  startRest,
  startStopwatch,
  startTicker,
  stopStopwatch,
  stopwatchElapsedS,
  subscribeWake,
  tryVibrate,
} from "./timer";

// เกณฑ์ 12 ส่วน unit: คำนวณจาก timestamp · ซ่อนหน้าแล้วเดินนาฬิกา · เปิดใหม่ยังถูก · ไม่เริ่มหลังคาร์ดิโอ · ▶ หลักเดียวกัน

afterEach(() => {
  vi.useRealTimers();
});

describe("ตัวจับเวลาพัก", () => {
  it("✓ → 90 วิ · ซ่อนหน้า 60 วิ (ไม่มี tick เลย) → กลับมาเหลือ 0:30", () => {
    const t0 = 1_000_000;
    const rest = startRest(t0);
    expect(rest.duration_s).toBe(DEFAULT_REST_S);
    // ไม่มีการนับสะสม: ค่าขึ้นกับนาฬิกาตอนวาดเท่านั้น
    expect(formatClock(restRemainingS(rest, t0 + 60_000))).toBe("0:30");
  });

  it("ปิดแอปแล้วเปิดใหม่: ค่าจาก JSON ที่เก็บไว้ยังถูก", () => {
    const stored = JSON.parse(JSON.stringify(startRest(5_000, 90)));
    expect(restRemainingS(stored, 5_000 + 75_500)).toBe(15);
  });

  it("เกินเวลา → 0 และ done (ไปต่อ) ไม่ติดลบ", () => {
    const r = startRest(0, 90);
    expect(restDone(r, 89_999)).toBe(false);
    expect(restDone(r, 90_000)).toBe(true);
    expect(restRemainingS(r, 500_000)).toBe(0);
  });

  it("−15/+15 ปรับเฉพาะรอบนั้น · ลดต่ำกว่าเวลาที่ผ่านแล้ว = ครบทันที", () => {
    const r = startRest(0, 90);
    expect(adjustRest(r, 15, 10_000).duration_s).toBe(105);
    expect(adjustRest(r, -15, 10_000).duration_s).toBe(75);
    const short = adjustRest(startRest(0, 30), -15, 20_000);
    expect(short.duration_s).toBe(20);
    expect(restDone(short, 20_000)).toBe(true);
  });

  it("ไม่เริ่มหลังท่าคาร์ดิโอ (ระยะ+เวลา และลู่วิ่ง) · เริ่มหลังท่าอื่น", () => {
    expect(restAppliesTo("distance_duration")).toBe(false);
    expect(restAppliesTo("incline_speed_duration")).toBe(false);
    for (const t of ["weight_reps", "reps_only", "duration", "weight_duration"]) expect(restAppliesTo(t)).toBe(true);
  });
});

describe("▶ จับเวลาท่า duration (หลักเดียวกัน)", () => {
  it("เดินถูกแม้ไม่มี tick · หยุดแล้วค่าคงที่", () => {
    const sw = startStopwatch(10_000);
    expect(stopwatchElapsedS(sw, 10_000 + 45_900)).toBe(45);
    const stopped = stopStopwatch(sw, 10_000 + 61_000);
    expect(stopwatchElapsedS(stopped, 10_000 + 999_000)).toBe(61);
    expect(stopStopwatch(stopped, 0)).toBe(stopped);
  });

  it("แสดง h:mm:ss เมื่อเกิน 59:59", () => {
    expect(formatClock(59 * 60 + 59)).toBe("59:59");
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("กลับมาที่หน้า: วาดใหม่ทันที", () => {
  it("visibilitychange → visible, pageshow, focus เรียก onWake · hidden ไม่เรียก", () => {
    const fn = vi.fn();
    const off = subscribeWake(fn);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("focus"));
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    window.dispatchEvent(new Event("focus"));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("startTicker เรียกตามช่วง และหยุดได้", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const stop = startTicker(fn, 250);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});

describe("สั่น / Wake Lock: feature-detect เท่านั้น", () => {
  it("ไม่มี navigator.vibrate (iOS) → false ไม่โยน", () => {
    expect(tryVibrate(200, {} as Navigator)).toBe(false);
    expect(tryVibrate(200, undefined)).toBe(false);
    expect(tryVibrate(200, { vibrate: () => { throw new Error("x"); } } as unknown as Navigator)).toBe(false);
  });

  it("มี vibrate (Android) → เรียก", () => {
    const vibrate = vi.fn(() => true);
    expect(tryVibrate([1, 2], { vibrate } as unknown as Navigator)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([1, 2]);
  });

  it("ไม่มี wakeLock / ถูกปฏิเสธ → null", async () => {
    expect(await requestWakeLock({} as Navigator)).toBeNull();
    const nav = { wakeLock: { request: () => Promise.reject(new Error("NotAllowed")) } } as unknown as Navigator;
    expect(await requestWakeLock(nav)).toBeNull();
  });
});
