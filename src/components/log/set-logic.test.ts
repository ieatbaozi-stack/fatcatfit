import { describe, expect, it } from "vitest";
import { TRACK_TYPES } from "@/lib/data/shared/exercise-meta";
import { SET_RANGES, type WireSet } from "@/lib/data/shared/workout";
import { EMPTY_SET_VALUES, type DraftSet, type SetValues } from "@/lib/offline/session";
import {
  canTick,
  columnsOf,
  durationFromDigits,
  estimatedDistance,
  fieldErrors,
  fieldKey,
  fmtNum,
  formatSetValues,
  hasRequired,
  limitsOf,
  paceOf,
  setField,
  setLabels,
  stepOf,
  suggestNext,
  unitsFromProfile,
  valuesFromWire,
  visibleErrors,
  type DisplayUnits,
} from "./set-logic";

const KG: DisplayUnits = { weight: "kg", distance: "km", speed: "kmh" };
const LB: DisplayUnits = { weight: "lb", distance: "mi", speed: "mph" };
const fmt = (n: number) => fmtNum(n, "en");
const v = (over: Partial<SetValues>): SetValues => ({ ...EMPTY_SET_VALUES, ...over });

const wire = (over: Partial<WireSet>): WireSet => ({
  id: "s",
  session_exercise_id: "e",
  position: 0,
  set_kind: "normal",
  completed_at: "2026-01-01T00:00:00.000Z",
  weight_kg: null,
  weight_input: null,
  weight_unit: null,
  reps: null,
  duration_s: null,
  distance_m: null,
  distance_input: null,
  distance_unit: null,
  speed_mps: null,
  speed_input: null,
  speed_unit: null,
  incline_pct: null,
  created_at: "",
  updated_at: "",
  client_updated_at: "",
  ...over,
});

const draftSet = (over: Partial<DraftSet>): DraftSet => ({ ...EMPTY_SET_VALUES, id: "d", position: 0, set_kind: "normal", completed_at: null, queued: false, ...over });

describe("หน่วยและก้าว (D6)", () => {
  it("ชุดเดียวตามโปรไฟล์ · ความเร็วตามระยะ · ไม่มีโปรไฟล์ = เมตริก", () => {
    expect(unitsFromProfile(null)).toEqual(KG);
    expect(unitsFromProfile({ weight_unit: "lb", distance_unit: "mi" })).toEqual(LB);
    expect(unitsFromProfile({ weight_unit: "kg", distance_unit: "mi" })).toEqual({ weight: "kg", distance: "mi", speed: "mph" });
  });
  it("ก้าว −/+: 2.5 kg · 5 lb · ครั้ง 1 · เวลา 15 วิ", () => {
    expect(stepOf("weight", KG)).toBe(2.5);
    expect(stepOf("weight", LB)).toBe(5);
    expect(stepOf("weight", KG, v({ weight_input: 10, weight_unit: "lb" }))).toBe(5);
    expect(stepOf("reps", KG)).toBe(1);
    expect(stepOf("duration", KG)).toBe(15);
  });
});

describe("ช่องตามชนิดการจด (UX 3)", () => {
  it("ทุกชนิดมีคอลัมน์ · ลู่วิ่ง 3 ช่อง", () => {
    for (const t of TRACK_TYPES) expect(columnsOf(t).length).toBeGreaterThan(0);
    expect(columnsOf("incline_speed_duration")).toEqual(["incline", "speed", "duration"]);
  });
  it("ช่องบังคับ: น้ำหนักตัว + ถ่วงเพิ่มว่างได้ · วิ่งไม่มีระยะได้ · ลู่ต้องครบ 3", () => {
    expect(hasRequired(v({ reps: 5 }), "weight_reps", "bodyweight_plus")).toBe(true);
    expect(hasRequired(v({ reps: 5 }), "weight_reps", "external")).toBe(false);
    expect(hasRequired(v({ reps: 5, weight_input: 0, weight_unit: "kg" }), "weight_reps", "external")).toBe(true);
    expect(hasRequired(v({ duration_s: 600 }), "distance_duration", "external")).toBe(true);
    expect(hasRequired(v({ duration_s: 600, speed_input: 5, speed_unit: "kmh" }), "incline_speed_duration", "external")).toBe(false);
  });
  it("หัวคอลัมน์น้ำหนักตามการใช้น้ำหนักตัว", () => {
    expect(fieldKey("weight", "external")).toBe("weight");
    expect(fieldKey("weight", "bodyweight_plus")).toBe("weightPlus");
    expect(fieldKey("weight", "assisted")).toBe("weightAssist");
    expect(fieldKey("reps", "assisted")).toBe("reps");
  });
  it("เลขเซ็ตนับเฉพาะเซ็ตปกติ · วอร์มอัพ = W", () => {
    const l = setLabels([draftSet({ id: "a", position: 0, set_kind: "warmup" }), draftSet({ id: "b", position: 1 }), draftSet({ id: "c", position: 2 })]);
    expect([l.get("a"), l.get("b"), l.get("c")]).toEqual(["W", "1", "2"]);
  });
  it("setField ตั้งหน่วยตามที่แสดง · ล้างค่า = ล้างหน่วยด้วย", () => {
    const a = setField(EMPTY_SET_VALUES, "weight", 20, LB);
    expect(a).toMatchObject({ weight_input: 20, weight_unit: "lb" });
    expect(setField(a, "weight", null, LB)).toMatchObject({ weight_input: null, weight_unit: null });
    expect(setField(EMPTY_SET_VALUES, "speed", 8, LB)).toMatchObject({ speed_input: 8, speed_unit: "mph" });
  });
});

describe("ช่วงค่า D4 (ขอบ · ข้อความ · จังหวะ)", () => {
  const wr = (over: Partial<SetValues>) => fieldErrors(v({ weight_unit: "kg", ...over }), "weight_reps", "external", KG, fmt);
  it("น้ำหนัก: ขอบบนผ่าน เกิน = ทันที · ทศนิยมเกิน 2 = ทันที · ติดลบ = ตอนออกจากช่อง · lb ขอบ 2,200", () => {
    expect(wr({ weight_input: 1000, reps: 5 })).toEqual([]);
    expect(wr({ weight_input: 1000.01, reps: 5 })[0]).toMatchObject({ key: "weightMax", phase: "live", params: { max: "1,000", unit: "kg" } });
    expect(wr({ weight_input: 62.555, reps: 5 })[0]).toMatchObject({ key: "weightDecimals", phase: "live" });
    expect(wr({ weight_input: -1, reps: 5 })[0]).toMatchObject({ key: "weightMin", phase: "blur" });
    expect(wr({ weight_input: 0, reps: 5 })).toEqual([]);
    const lb = fieldErrors(v({ weight_input: 2201, weight_unit: "lb", reps: 5 }), "weight_reps", "external", LB, fmt);
    expect(lb[0]).toMatchObject({ key: "weightMax", params: { max: "2,200", unit: "lb" } });
  });
  it("ครั้ง 1–1,000 จำนวนเต็ม · เวลา 1 วิ–24 ชม.", () => {
    expect(fieldErrors(v({ reps: 0 }), "reps_only", "external", KG, fmt)[0]).toMatchObject({ key: "repsMin", phase: "blur" });
    expect(fieldErrors(v({ reps: 1001 }), "reps_only", "external", KG, fmt)[0]).toMatchObject({ key: "repsMax", phase: "live" });
    expect(fieldErrors(v({ reps: 1.5 }), "reps_only", "external", KG, fmt)[0]).toMatchObject({ key: "repsInteger" });
    expect(fieldErrors(v({ reps: 1000 }), "reps_only", "external", KG, fmt)).toEqual([]);
    expect(fieldErrors(v({ duration_s: 86_401 }), "duration", "external", KG, fmt)[0]).toMatchObject({ key: "durationMax", phase: "live" });
    expect(fieldErrors(v({ duration_s: 0 }), "duration", "external", KG, fmt)[0]).toMatchObject({ key: "durationMin", phase: "blur" });
    expect(fieldErrors(v({ duration_s: 86_400 }), "duration", "external", KG, fmt)).toEqual([]);
  });
  it("ระยะ 0.01–1,000 km / 620 mi · ความเร็ว 0.1–40 km/h / 25 mph · ความชัน 0–40", () => {
    const run = (over: Partial<SetValues>, u: DisplayUnits = KG) => fieldErrors(v({ duration_s: 60, ...over }), "distance_duration", "external", u, fmt);
    expect(run({ distance_input: 1000, distance_unit: "km" })).toEqual([]);
    expect(run({ distance_input: 1001, distance_unit: "km" })[0]).toMatchObject({ key: "distanceMax", params: { max: "1,000", unit: "km" } });
    expect(run({ distance_input: 621, distance_unit: "mi" }, LB)[0]).toMatchObject({ key: "distanceMax", params: { max: "620", unit: "mi" } });
    expect(run({ distance_input: 0, distance_unit: "km" })[0]).toMatchObject({ key: "distanceMin", phase: "blur", params: { min: "0.01" } });
    expect(run({ distance_input: 1.234, distance_unit: "km" })[0]).toMatchObject({ key: "distanceDecimals" });
    const tm = (over: Partial<SetValues>, u: DisplayUnits = KG) => fieldErrors(v({ duration_s: 60, incline_pct: 1, speed_input: 5, speed_unit: u.speed, ...over }), "incline_speed_duration", "external", u, fmt);
    expect(tm({ speed_input: 40 })).toEqual([]);
    expect(tm({ speed_input: 40.1 })[0]).toMatchObject({ key: "speedMax", params: { max: "40", unit: "km/h" } });
    expect(tm({ speed_input: 25.1 }, LB)[0]).toMatchObject({ key: "speedMax", params: { max: "25", unit: "mph" } });
    expect(tm({ speed_input: 5.55 })[0]).toMatchObject({ key: "speedDecimals" });
    expect(tm({ incline_pct: 40 })).toEqual([]);
    expect(tm({ incline_pct: 41 })[0]).toMatchObject({ key: "incline", phase: "live", params: { min: "0", max: "40" } });
    expect(tm({ incline_pct: -1 })[0]).toMatchObject({ key: "incline", phase: "blur" });
    expect(tm({ incline_pct: 1.25 })[0]).toMatchObject({ key: "inclineDecimals" });
  });
  it("ค่าขอบมาจาก SET_RANGES ตัวเดียวกับเซิร์ฟเวอร์ (limitsOf)", () => {
    expect(limitsOf("weight", "kg")).toEqual(SET_RANGES.weight.kg);
    expect(limitsOf("weight", "lb")).toEqual(SET_RANGES.weight.lb);
    expect(limitsOf("speed", "mph")).toEqual(SET_RANGES.speed.mph);
    expect(limitsOf("distance", "mi")).toEqual(SET_RANGES.distance.mi);
  });
  it("หลายช่องผิด = หลายข้อความ เรียงตามคอลัมน์ · ช่องว่างไม่ผิด · ช่อง – ไม่ตรวจ", () => {
    const e = fieldErrors(v({ distance_input: 1200, distance_unit: "km", duration_s: 90_000 }), "distance_duration", "external", KG, fmt);
    expect(e.map((x) => x.field)).toEqual(["distance", "duration"]);
    expect(fieldErrors(v({ reps: 5 }), "weight_reps", "bodyweight_plus", KG, fmt)).toEqual([]);
    expect(fieldErrors(v({ weight_input: 5000, weight_unit: "kg" }), "reps_only", "external", KG, fmt)).toEqual([]);
  });
  it("ข้อความขอบล่างขึ้นหลังออกจากช่องเท่านั้น (visibleErrors)", () => {
    const e = fieldErrors(v({ reps: 0 }), "reps_only", "external", KG, fmt);
    expect(visibleErrors(e, new Set())).toEqual([]);
    expect(visibleErrors(e, new Set(["reps"]))).toHaveLength(1);
    const big = fieldErrors(v({ reps: 5000 }), "reps_only", "external", KG, fmt);
    expect(visibleErrors(big, new Set())).toHaveLength(1);
  });
  it("✓ กดได้เมื่อครบและอยู่ในช่วง — แม้ข้อความขอบล่างยังไม่ขึ้น ✓ ก็ปิด", () => {
    expect(canTick(v({ reps: 5 }), "reps_only", "external", KG, fmt)).toBe(true);
    expect(canTick(v({ reps: 0 }), "reps_only", "external", KG, fmt)).toBe(false);
    expect(canTick(v({}), "reps_only", "external", KG, fmt)).toBe(false);
  });
});

describe("เวลาพิมพ์ต่อจากขวา", () => {
  it("130 = 1:30 · 5 = 0:05 · 10000 = 1:00:00 · ศูนย์ล้วน/ว่าง = null · เกิน 6 หลักตัดหน้า", () => {
    expect(durationFromDigits("130")).toBe(90);
    expect(durationFromDigits("5")).toBe(5);
    expect(durationFromDigits("10000")).toBe(3600);
    expect(durationFromDigits("0")).toBeNull();
    expect(durationFromDigits("")).toBeNull();
    expect(durationFromDigits("1:30")).toBe(90);
    expect(durationFromDigits("9000130")).toBe(90);
  });
});

describe("ค่าเติม (UX 3 · D2)", () => {
  const last = [wire({ position: 0, set_kind: "warmup", weight_kg: 20, weight_input: 20, weight_unit: "kg", reps: 10 }), wire({ position: 1, weight_kg: 60, weight_input: 60, weight_unit: "kg", reps: 8 }), wire({ position: 2, weight_kg: 62.5, weight_input: 62.5, weight_unit: "kg", reps: 6 })];
  it("ไม่มีเซ็ตในเซสชัน → เซ็ตปกติแรกของครั้งก่อน (ข้ามวอร์มอัพ)", () => {
    expect(suggestNext({ sets: [], lastTime: last, units: KG })).toMatchObject({ weight_input: 60, reps: 8, weight_unit: "kg" });
  });
  it("มีเซ็ตปกติในเซสชัน → ค่าของเซ็ตปกติล่าสุด (ไม่ใช่วอร์มอัพ)", () => {
    const sets = [draftSet({ id: "a", position: 0, weight_input: 62.5, weight_unit: "kg", reps: 8 }), draftSet({ id: "w", position: 1, set_kind: "warmup", weight_input: 20, weight_unit: "kg", reps: 5 })];
    expect(suggestNext({ sets, lastTime: last, units: KG })).toMatchObject({ weight_input: 62.5, reps: 8 });
  });
  it("มีแต่วอร์มอัพในเซสชัน และไม่เคยทำ → ใช้ค่าวอร์มอัพ · ไม่มีอะไรเลย = ว่าง", () => {
    const sets = [draftSet({ id: "w", set_kind: "warmup", weight_input: 20, weight_unit: "kg", reps: 5 })];
    expect(suggestNext({ sets, lastTime: undefined, units: KG })).toMatchObject({ weight_input: 20 });
    expect(suggestNext({ sets: [], lastTime: undefined, units: KG })).toEqual(EMPTY_SET_VALUES);
  });
  it("ครั้งก่อนจดเป็น lb แต่แสดง kg = แปลงจากค่ามาตรฐาน ปัด 1 ตำแหน่ง · ระยะปัด 2 · เร็วปัด 1", () => {
    const lbSet = wire({ weight_kg: 45.359237, weight_input: 100, weight_unit: "lb", reps: 5, distance_m: 5000, distance_input: 3.1, distance_unit: "mi", speed_mps: 2.7778, speed_input: 6.2, speed_unit: "mph", duration_s: 1800 });
    expect(valuesFromWire(lbSet, KG)).toMatchObject({ weight_input: 45.4, weight_unit: "kg", distance_input: 5, distance_unit: "km", speed_input: 10, speed_unit: "kmh", duration_s: 1800 });
    expect(valuesFromWire(lbSet, LB)).toMatchObject({ weight_input: 100, weight_unit: "lb", distance_input: 3.1, distance_unit: "mi", speed_input: 6.2, speed_unit: "mph" });
  });
});

describe("แสดงผล", () => {
  it("สรุปค่าเซ็ตทุกชนิด (สัญลักษณ์ ไม่มีคำภาษา)", () => {
    expect(formatSetValues("weight_reps", "external", v({ weight_input: 65, weight_unit: "kg", reps: 5 }), "en")).toBe("65 kg × 5");
    expect(formatSetValues("weight_reps", "bodyweight_plus", v({ weight_input: 10, weight_unit: "kg", reps: 5 }), "en")).toBe("+10 kg × 5");
    expect(formatSetValues("weight_reps", "bodyweight_plus", v({ reps: 5 }), "en")).toBe("× 5");
    expect(formatSetValues("weight_reps", "assisted", v({ weight_input: 20, weight_unit: "kg", reps: 8 }), "en")).toBe("−20 kg × 8");
    expect(formatSetValues("reps_only", "external", v({ reps: 12 }), "en")).toBe("× 12");
    expect(formatSetValues("duration", "external", v({ duration_s: 90 }), "en")).toBe("1:30");
    expect(formatSetValues("distance_duration", "external", v({ distance_input: 5, distance_unit: "km", duration_s: 1860 }), "en")).toBe("5 km · 31:00");
    expect(formatSetValues("distance_duration", "external", v({ duration_s: 1860 }), "en")).toBe("31:00");
    expect(formatSetValues("weight_duration", "external", v({ weight_input: 20, weight_unit: "kg", duration_s: 45 }), "en")).toBe("20 kg · 0:45");
    expect(formatSetValues("incline_speed_duration", "external", v({ duration_s: 600, speed_input: 5, speed_unit: "kmh", incline_pct: 3 }), "en")).toBe("10:00 · 5 km/h · 3%");
  });
  it("เกิน 59:59 แสดง ชม.:นาที:วินาที · ตัวเลขพันตาม locale", () => {
    expect(formatSetValues("duration", "external", v({ duration_s: 3725 }), "en")).toBe("1:02:05");
    expect(fmtNum(1200, "en")).toBe("1,200");
    expect(fmtNum(1200, "th")).toBe("1,200");
  });
  it("เพซและระยะโดยประมาณ", () => {
    expect(paceOf(v({ distance_input: 5, distance_unit: "km", duration_s: 1500 }))).toBe("5:00/km");
    expect(paceOf(v({ duration_s: 1500 }))).toBeNull();
    expect(estimatedDistance(v({ speed_input: 6, speed_unit: "kmh", duration_s: 1800 }), KG)).toBe(3);
    expect(estimatedDistance(v({ speed_input: 6, speed_unit: "mph", duration_s: 3600 }), LB)).toBe(6);
    expect(estimatedDistance(v({ speed_input: 6 }), KG)).toBeNull();
  });
});
