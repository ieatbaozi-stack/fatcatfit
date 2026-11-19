import { describe, expect, it } from "vitest";
import { MIN_AGE, ONBOARDING_LIMITS, validateOnboarding } from "./onboarding";

const NOW = new Date("2026-11-19T05:00:00.000Z");
const body = (birthYear: number, now: Date = NOW) => ({
  profile: {
    locale: "th",
    weightUnit: "kg",
    lengthUnit: "cm",
    distanceUnit: "km",
    birthYear,
    height: { value: 168, unit: "cm" },
    goals: ["stronger"],
    experience: null,
  },
  place: { id: "6f1d1a0e-8c4b-4f6a-9d2e-1b2c3d4e5f60", name: "Gym" },
  bodyEntry: {
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    weight: { value: 70, unit: "kg" },
    measuredAt: now.toISOString(),
    localDate: now.toISOString().slice(0, 10),
  },
});

describe("อายุขั้นต่ำ 20 ปี", () => {
  it("MIN_AGE = 20 และ birthYearMax ตามปีปัจจุบัน", () => {
    expect(MIN_AGE).toBe(20);
    expect(ONBOARDING_LIMITS.birthYearMax).toBe(new Date().getFullYear() - 20);
  });

  it("ปีเกิด = ปีปัจจุบัน−20 ผ่าน", () => {
    expect(validateOnboarding(body(2026 - 20), NOW).ok).toBe(true);
  });

  it("ปีเกิด = ปีปัจจุบัน−19 ไม่ผ่าน out_of_range", () => {
    expect(validateOnboarding(body(2026 - 19), NOW)).toEqual({
      ok: false,
      fields: { "profile.birthYear": "out_of_range" },
    });
  });

  it("ปีปัจจุบัน/อนาคตไม่ผ่าน · ขอบล่าง 1920 ผ่าน 1919 ไม่ผ่าน", () => {
    expect(validateOnboarding(body(2026), NOW).ok).toBe(false);
    expect(validateOnboarding(body(2999), NOW).ok).toBe(false);
    expect(validateOnboarding(body(1920), NOW).ok).toBe(true);
    expect(validateOnboarding(body(1919), NOW).ok).toBe(false);
  });

  it("ขอบเลื่อนตามปีของ now (2027 → 2007 ผ่าน, 2008 ไม่ผ่าน)", () => {
    const n = new Date("2027-01-10T05:00:00.000Z");
    expect(validateOnboarding(body(2007, n), n).ok).toBe(true);
    expect(validateOnboarding(body(2008, n), n).ok).toBe(false);
  });
});
