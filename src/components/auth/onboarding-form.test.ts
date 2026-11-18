import { describe, expect, it } from "vitest";
import { onboardingSchema, validateOnboarding } from "@/lib/data/shared/onboarding";
import {
  EMPTY_DRAFT,
  ageFromBirthYear,
  buildPayload,
  localDateString,
  mapServerFields,
  nextPlaceName,
  stepOfIssue,
  switchUnitSet,
  validateBody,
  validatePlace,
  type Draft,
} from "./onboarding-form";

const NOW = new Date(2026, 10, 18, 9, 30); // เวลาท้องถิ่น
const filled: Draft = {
  ...EMPTY_DRAFT,
  weight: 72.4,
  height: 168,
  birthYear: 1994,
  placeKind: "gym",
  placeName: "ยิมใกล้บ้าน",
  goals: ["stronger", "show_up"],
  experience: "some",
};
const IDS = { placeId: "6f1d1a0e-8c4b-4f6a-9d2e-1b2c3d4e5f60", bodyEntryId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" };

describe("validateBody", () => {
  it("ว่าง = required ทุกช่อง", () => {
    expect(validateBody(EMPTY_DRAFT, NOW)).toEqual({ weight: "required", height: "required", birthYear: "required" });
  });
  it("ค่าปกติผ่าน", () => {
    expect(validateBody(filled, NOW)).toEqual({});
  });
  it("นอกช่วง: น้ำหนัก ส่วนสูง ปีเกิด (รวมปีอนาคตและปี พ.ศ.)", () => {
    expect(validateBody({ ...filled, weight: 5 }, NOW).weight).toBe("out_of_range");
    expect(validateBody({ ...filled, weight: 900 }, NOW).weight).toBe("out_of_range");
    expect(validateBody({ ...filled, height: 20 }, NOW).height).toBe("out_of_range");
    expect(validateBody({ ...filled, birthYear: 2537 }, NOW).birthYear).toBe("out_of_range");
    expect(validateBody({ ...filled, birthYear: 1800 }, NOW).birthYear).toBe("out_of_range");
    expect(validateBody({ ...filled, birthYear: 1994.5 }, NOW).birthYear).toBe("invalid");
  });
  it("ตรวจตามหน่วยที่เลือก (lb/in ตรวจหลังแปลง)", () => {
    const imp: Draft = { ...filled, unitSet: "imperial", weight: 160, height: 66 };
    expect(validateBody(imp, NOW)).toEqual({});
    expect(validateBody({ ...imp, weight: 30 }, NOW).weight).toBe("out_of_range"); // 30 lb = 13.6 kg
    expect(validateBody({ ...imp, height: 168 }, NOW).height).toBe("out_of_range"); // 168 in = 4.3 m
  });
});

describe("validatePlace", () => {
  it("ว่าง/เว้นวรรคล้วน = required · ยาวเกิน = out_of_range", () => {
    expect(validatePlace({ ...filled, placeName: "   " })).toEqual({ placeName: "required" });
    expect(validatePlace({ ...filled, placeName: "x".repeat(61) })).toEqual({ placeName: "out_of_range" });
    expect(validatePlace(filled)).toEqual({});
  });
});

describe("switchUnitSet", () => {
  it("metric → imperial → metric แปลงค่าและกลับมาใกล้เดิม", () => {
    const imp = switchUnitSet(filled, "imperial");
    expect(imp.unitSet).toBe("imperial");
    expect(imp.weight).toBeCloseTo(159.6, 1);
    expect(imp.height).toBeCloseTo(66.1, 1);
    const back = switchUnitSet(imp, "metric");
    expect(back.weight).toBeCloseTo(72.4, 1);
    expect(back.height).toBe(168);
  });
  it("ค่าว่างยังว่าง · ชุดเดิมคืนอ็อบเจกต์เดิม", () => {
    expect(switchUnitSet(EMPTY_DRAFT, "imperial").weight).toBeNull();
    expect(switchUnitSet(filled, "metric")).toBe(filled);
  });
});

describe("buildPayload", () => {
  it("ผ่าน schema และ validateOnboarding ของเซิร์ฟเวอร์", () => {
    const payload = buildPayload(filled, IDS, "th", NOW);
    expect(onboardingSchema.safeParse(payload).success).toBe(true);
    expect(validateOnboarding(payload, NOW).ok).toBe(true);
    expect(payload.profile).toMatchObject({
      weightUnit: "kg",
      lengthUnit: "cm",
      distanceUnit: "km",
      height: { value: 168, unit: "cm" },
      goals: ["stronger", "show_up"],
    });
    expect(payload.place).toEqual({ id: IDS.placeId, name: "ยิมใกล้บ้าน" });
    expect(payload.bodyEntry.localDate).toBe("2026-11-18");
  });
  it("หน่วยแบบ lb·in ส่งหน่วยตรงกัน · ไม่เลือกประสบการณ์ = null", () => {
    const payload = buildPayload({ ...filled, unitSet: "imperial", weight: 160, height: 66, experience: null }, IDS, "en", NOW);
    expect(payload.profile).toMatchObject({ weightUnit: "lb", lengthUnit: "in", distanceUnit: "mi", locale: "en", experience: null });
    expect(validateOnboarding(payload, NOW).ok).toBe(true);
  });
  it("ตัดช่องว่างหัวท้ายของชื่อสถานที่", () => {
    expect(buildPayload({ ...filled, placeName: "  บ้าน  " }, IDS, "th", NOW).place.name).toBe("บ้าน");
  });
});

describe("ตัวช่วยอื่น", () => {
  it("localDateString ใช้วันที่ท้องถิ่น (เติมศูนย์)", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("อายุจากปีเกิด", () => {
    expect(ageFromBirthYear(1994, NOW)).toBe(32);
  });
  it("mapServerFields: path ของช่อง → ช่อง · path อื่น → general", () => {
    expect(mapServerFields({ "bodyEntry.weight.value": "out_of_range", "profile.birthYear": "required", "place.name": "invalid" })).toEqual({
      issues: { weight: "out_of_range", birthYear: "required", placeName: "invalid" },
      general: false,
    });
    expect(mapServerFields({ "bodyEntry.measuredAt": "out_of_range" })).toEqual({ issues: {}, general: true });
  });
  it("stepOfIssue พากลับขั้นที่มีช่องผิด", () => {
    expect(stepOfIssue({ weight: "required" })).toBe(1);
    expect(stepOfIssue({ placeName: "required" })).toBe(2);
    expect(stepOfIssue({ placeName: "required", height: "invalid" })).toBe(1);
  });
  it("nextPlaceName: เติมชื่อเริ่มต้นเฉพาะตอนว่างหรือยังเป็นค่าเริ่มต้นเดิม", () => {
    expect(nextPlaceName("", null, "ยิม")).toBe("ยิม");
    expect(nextPlaceName("ยิม", "ยิม", "บ้าน")).toBe("บ้าน");
    expect(nextPlaceName("ยิมใกล้บ้าน", "ยิม", "บ้าน")).toBe("ยิมใกล้บ้าน");
  });
});
