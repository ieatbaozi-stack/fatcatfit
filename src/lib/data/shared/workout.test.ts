import { describe, expect, it } from "vitest";
import { TRACK_TYPES, type LoadMode, type TrackType } from "./exercise-meta";
import { KG_PER_LB, weightToKg } from "./units";
import {
  SET_RANGES,
  computeSetDerived,
  fieldRules,
  localDateOf,
  sessionExerciseDataSchema,
  setRecordDataSchema,
  validateSetFields,
  workoutSessionDataSchema,
  type SetField,
  type SetRecordData,
} from "./workout";

const U4 = "11111111-1111-4111-8111-111111111111";
const U5 = "11111111-1111-5111-8111-111111111111";
const base = { session_exercise_id: U4, position: 0, set_kind: "normal", completed_at: "2026-11-24T10:00:00.000Z" };

/** ค่าถูกต้องของแต่ละช่อง */
const OK: Record<SetField, Partial<SetRecordData>> = {
  weight: { weight_input: 20, weight_unit: "kg" },
  reps: { reps: 10 },
  duration: { duration_s: 60 },
  distance: { distance_input: 5, distance_unit: "km" },
  speed: { speed_input: 10, speed_unit: "kmh" },
  incline: { incline_pct: 2 },
};
const FIELDS = Object.keys(OK) as SetField[];

const mk = (fields: SetField[]): SetRecordData => {
  const raw = Object.assign({}, base, ...fields.map((f) => OK[f]));
  return setRecordDataSchema.parse(raw);
};

const CASES: [TrackType, LoadMode][] = [
  ["weight_reps", "external"],
  ["weight_reps", "bodyweight_plus"],
  ["weight_reps", "assisted"],
  ["reps_only", "external"],
  ["duration", "external"],
  ["distance_duration", "external"],
  ["weight_duration", "external"],
  ["incline_speed_duration", "external"],
];

describe("ช่องตาม track_type", () => {
  it("ครบ 6 ชนิดในตาราง", () => {
    expect(new Set(CASES.map((c) => c[0]))).toEqual(new Set(TRACK_TYPES));
  });

  describe.each(CASES)("%s / %s", (tt, lm) => {
    const rules = fieldRules(tt, lm);
    const req = FIELDS.filter((f) => rules[f] === "required");
    const opt = FIELDS.filter((f) => rules[f] === "optional");
    const forb = FIELDS.filter((f) => rules[f] === "forbidden");

    it("มีเฉพาะช่อง ● = ผ่าน", () => {
      expect(validateSetFields(mk(req), tt, lm)).toEqual([]);
    });
    it("มีช่อง ○ ด้วย = ผ่าน", () => {
      expect(validateSetFields(mk([...req, ...opt]), tt, lm)).toEqual([]);
    });
    it.each(req)("ขาดช่อง ● %s = invalid", (f) => {
      expect(validateSetFields(mk(req.filter((x) => x !== f)), tt, lm)).toContainEqual({ field: f, reason: "missing" });
    });
    it.each(forb)("ช่อง – %s มีค่า = invalid", (f) => {
      expect(validateSetFields(mk([...req, f]), tt, lm)).toContainEqual({ field: f, reason: "forbidden" });
    });
  });

  it("ตามตารางใน ADR 0003 ข้อ 2", () => {
    expect(fieldRules("weight_reps", "external").weight).toBe("required");
    expect(fieldRules("weight_reps", "assisted").weight).toBe("required");
    expect(fieldRules("weight_reps", "bodyweight_plus").weight).toBe("optional");
    expect(fieldRules("distance_duration").distance).toBe("optional");
    expect(fieldRules("incline_speed_duration")).toMatchObject({ duration: "required", distance: "optional", speed: "required", incline: "required" });
  });
});

describe("ช่วงค่า D4 (ขอบผ่าน · เลยขอบ 1 หน่วยเล็กสุด = invalid)", () => {
  const issues = (patch: Partial<SetRecordData>, f: SetField[], tt: TrackType, lm: LoadMode = "external") =>
    validateSetFields(setRecordDataSchema.parse({ ...base, ...Object.assign({}, ...f.map((x) => OK[x])), ...patch }), tt, lm);

  it.each([
    ["kg", 0, 1000, 1000.01, -0.01],
    ["lb", 0, 2200, 2200.01, -0.01],
  ] as const)("น้ำหนัก %s", (unit, lo, hi, over, under) => {
    const t = (v: number) => issues({ weight_input: v, weight_unit: unit }, ["reps"], "weight_reps");
    expect(t(lo)).toEqual([]);
    expect(t(hi)).toEqual([]);
    expect(t(over)).toContainEqual({ field: "weight", reason: "range" });
    expect(t(under)).toContainEqual({ field: "weight", reason: "range" });
    expect(t(20.125)).toContainEqual({ field: "weight", reason: "decimals" });
    expect(t(20.25)).toEqual([]);
  });

  it("ครั้ง 1–1000 จำนวนเต็ม", () => {
    const t = (v: number) => issues({ reps: v }, ["weight"], "weight_reps");
    expect(t(1)).toEqual([]);
    expect(t(1000)).toEqual([]);
    expect(t(0)).toContainEqual({ field: "reps", reason: "range" });
    expect(t(1001)).toContainEqual({ field: "reps", reason: "range" });
    expect(t(5.5)).toContainEqual({ field: "reps", reason: "decimals" });
  });

  it("เวลา 1 วิ–24 ชม.", () => {
    const t = (v: number) => issues({ duration_s: v }, [], "duration");
    expect(t(1)).toEqual([]);
    expect(t(86_400)).toEqual([]);
    expect(t(0)).toContainEqual({ field: "duration", reason: "range" });
    expect(t(86_401)).toContainEqual({ field: "duration", reason: "range" });
    expect(t(1.5)).toContainEqual({ field: "duration", reason: "decimals" });
  });

  it.each([
    ["km", 0.01, 1000, 0.009, 1000.01],
    ["mi", 0.01, 620, 0.009, 620.01],
  ] as const)("ระยะ %s", (unit, lo, hi, under, over) => {
    const t = (v: number) => issues({ distance_input: v, distance_unit: unit }, ["duration"], "distance_duration");
    expect(t(lo)).toEqual([]);
    expect(t(hi)).toEqual([]);
    expect(t(under).map((i) => i.field)).toContain("distance");
    expect(t(over)).toContainEqual({ field: "distance", reason: "range" });
    expect(t(1.005)).toContainEqual({ field: "distance", reason: "decimals" });
  });

  it.each([
    ["kmh", 0.1, 40, 0.09, 40.1],
    ["mph", 0.1, 25, 0.09, 25.1],
  ] as const)("ความเร็ว %s", (unit, lo, hi, under, over) => {
    const t = (v: number) => issues({ speed_input: v, speed_unit: unit }, ["duration", "incline"], "incline_speed_duration");
    expect(t(lo)).toEqual([]);
    expect(t(hi)).toEqual([]);
    expect(t(under).map((i) => i.field)).toContain("speed");
    expect(t(over)).toContainEqual({ field: "speed", reason: "range" });
    expect(t(10.25)).toContainEqual({ field: "speed", reason: "decimals" });
  });

  it("ความชัน 0–40 ทศนิยม 1 (ไม่รับลาดลง)", () => {
    const t = (v: number) => issues({ incline_pct: v }, ["duration", "speed"], "incline_speed_duration");
    expect(t(0)).toEqual([]);
    expect(t(40)).toEqual([]);
    expect(t(-0.1)).toContainEqual({ field: "incline", reason: "range" });
    expect(t(40.1)).toContainEqual({ field: "incline", reason: "range" });
    expect(t(2.55)).toContainEqual({ field: "incline", reason: "decimals" });
  });

  it("null นับเป็นว่าง", () => {
    const d = setRecordDataSchema.parse({ ...base, reps: 5, weight_input: null, weight_unit: null });
    expect(validateSetFields(d, "reps_only", "external")).toEqual([]);
  });
});

describe("รูปข้อมูลของ set_record", () => {
  it("ค่ากับหน่วยต้องมาคู่กัน", () => {
    expect(setRecordDataSchema.safeParse({ ...base, reps: 5, weight_input: 20 }).success).toBe(false);
    expect(setRecordDataSchema.safeParse({ ...base, reps: 5, weight_unit: "kg" }).success).toBe(false);
  });
  it("ช่องที่ไคลเอนต์ห้ามส่ง = invalid", () => {
    for (const extra of [{ weight_kg: 9 }, { distance_m: 1 }, { speed_mps: 1 }, { user_id: U4 }, { rpe: 8 }]) {
      expect(setRecordDataSchema.safeParse({ ...base, reps: 5, ...extra }).success).toBe(false);
    }
  });
  it("ต้องมี completed_at และ set_kind ที่รู้จัก", () => {
    expect(setRecordDataSchema.safeParse({ ...base, completed_at: undefined, reps: 5 }).success).toBe(false);
    expect(setRecordDataSchema.safeParse({ ...base, set_kind: "drop", reps: 5 }).success).toBe(false);
    expect(setRecordDataSchema.safeParse({ ...base, set_kind: "warmup", reps: 5 }).success).toBe(true);
  });
  it("ยอมรับช่องที่เซิร์ฟเวอร์ตั้ง (สะท้อนจาก bootstrap)", () => {
    expect(setRecordDataSchema.safeParse({ ...base, reps: 5, id: U4, created_at: "x", deleted_at: null }).success).toBe(true);
  });
});

describe("computeSetDerived", () => {
  it("lb → kg ตรงกับ units.ts", () => {
    const d = computeSetDerived({ weight_input: 45, weight_unit: "lb", distance_input: null, distance_unit: null, speed_input: null, speed_unit: null });
    expect(d.weight_kg).toBe(weightToKg(45, "lb"));
    expect(d.weight_kg).toBeCloseTo(45 * KG_PER_LB, 12);
    expect(d.distance_m).toBeNull();
  });
  it("ระยะ/ความเร็ว", () => {
    const d = computeSetDerived({ weight_input: null, weight_unit: null, distance_input: 5, distance_unit: "km", speed_input: 36, speed_unit: "kmh" });
    expect(d.distance_m).toBe(5000);
    expect(d.speed_mps).toBeCloseTo(10, 12);
    const m = computeSetDerived({ weight_input: null, weight_unit: null, distance_input: 1, distance_unit: "mi", speed_input: 1, speed_unit: "mph" });
    expect(m.distance_m).toBe(1609.344);
    expect(m.speed_mps).toBe(0.44704);
  });
  it("ช่วง lb สูงสุดของ D4 ไม่เกิน kg สูงสุด", () => {
    expect(weightToKg(SET_RANGES.weight.lb.max, "lb")).toBeLessThan(SET_RANGES.weight.kg.max);
  });
});

describe("workout_session", () => {
  const s = {
    place_id: U4,
    started_at: "2026-11-24T16:50:00.000Z", // 23:50 ในกรุงเทพ
    local_date: "2026-11-24",
    time_zone: "Asia/Bangkok",
  };
  it("ผ่าน (เริ่ม 23:50 ในไทย = วันที่เริ่ม)", () => {
    expect(workoutSessionDataSchema.safeParse(s).success).toBe(true);
    expect(workoutSessionDataSchema.safeParse({ ...s, ended_at: "2026-11-24T17:40:00.000Z" }).success).toBe(true);
    expect(localDateOf(s.started_at, "Asia/Bangkok")).toBe("2026-11-24");
    expect(localDateOf(s.started_at, "UTC")).toBe("2026-11-24");
    expect(localDateOf("2026-11-24T17:10:00.000Z", "Asia/Bangkok")).toBe("2026-11-25");
  });
  it("local_date ไม่ตรง started_at+time_zone = invalid", () => {
    expect(workoutSessionDataSchema.safeParse({ ...s, local_date: "2026-11-25" }).success).toBe(false);
    expect(workoutSessionDataSchema.safeParse({ ...s, time_zone: "UTC", local_date: "2026-11-24" }).success).toBe(true);
    expect(workoutSessionDataSchema.safeParse({ ...s, started_at: "2026-11-24T17:10:00.000Z" }).success).toBe(false);
  });
  it("time_zone ไม่ใช่ IANA = invalid", () => {
    expect(workoutSessionDataSchema.safeParse({ ...s, time_zone: "Mars/Olympus" }).success).toBe(false);
  });
  it("ended_at ก่อน started_at หรือเกิน 24 ชม. = invalid · พอดี 24 ชม. ผ่าน", () => {
    expect(workoutSessionDataSchema.safeParse({ ...s, ended_at: "2026-11-24T16:49:59.999Z" }).success).toBe(false);
    expect(workoutSessionDataSchema.safeParse({ ...s, ended_at: "2026-11-25T16:50:00.000Z" }).success).toBe(true);
    expect(workoutSessionDataSchema.safeParse({ ...s, ended_at: "2026-11-25T16:50:00.001Z" }).success).toBe(false);
  });
  it("ไม่รับ template_id / ช่องแปลก", () => {
    expect(workoutSessionDataSchema.safeParse({ ...s, template_id: U4 }).success).toBe(false);
    expect(workoutSessionDataSchema.safeParse({ ...s, user_id: U4 }).success).toBe(false);
  });
  it("place_id ต้องเป็น v4", () => {
    expect(workoutSessionDataSchema.safeParse({ ...s, place_id: U5 }).success).toBe(false);
  });
});

describe("session_exercise", () => {
  const e = { session_id: U4, exercise_id: U4, position: 0 };
  it("exercise_id รับ v4 และ v5", () => {
    expect(sessionExerciseDataSchema.safeParse(e).success).toBe(true);
    expect(sessionExerciseDataSchema.safeParse({ ...e, exercise_id: U5 }).success).toBe(true);
    expect(sessionExerciseDataSchema.safeParse({ ...e, exercise_id: "nope" }).success).toBe(false);
  });
  it("สำเนาชื่อ/ชนิดส่งมาไม่ได้ (เซิร์ฟเวอร์คัดลอกเอง)", () => {
    for (const x of [{ exercise_name: "x" }, { track_type: "reps_only" }, { load_mode: "external" }, { exercise_name_th: "x" }]) {
      expect(sessionExerciseDataSchema.safeParse({ ...e, ...x }).success).toBe(false);
    }
  });
});
