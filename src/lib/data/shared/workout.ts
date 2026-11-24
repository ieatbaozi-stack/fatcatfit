import { z } from "zod";
import { weightToKg, distanceToMeters, speedToMps, type WeightUnit, type DistanceUnit, type SpeedUnit } from "./units";
import type { LoadMode, TrackType } from "./exercise-meta";

// รูปบนสายของ entity R3a: workout_session / session_exercise / set_record (contract R3 "API & ชนิดข้อมูล" · ADR 0003 ข้อ 2)
// ไคลเอนต์ส่ง `_input` + `_unit` เท่านั้น — `_kg` `_m` `_mps` เซิร์ฟเวอร์คำนวณด้วย `computeSetDerived` (ไคลเอนต์ใช้ตัวเดียวกันแสดงผลในเครื่อง)

export const WORKOUT_ENTITIES = ["workout_session", "session_exercise", "set_record"] as const;
export type WorkoutEntity = (typeof WORKOUT_ENTITIES)[number];

/** code ปฏิเสธเพิ่มของ R3 (ADR 0004 ข้อ 4) — รวมเข้า `PushRejectCode` ใน sync.ts */
export type WorkoutRejectCode = "parent_missing" | "exercise_has_history" | "place_has_history";

export const SET_KINDS = ["normal", "warmup"] as const;
export type SetKind = (typeof SET_KINDS)[number];

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export const DISTANCE_UNITS = ["km", "mi"] as const;
export const SPEED_UNITS = ["kmh", "mph"] as const;

/** ช่วงค่าที่ยอมรับ (contract D4) — ที่เดียว ใช้ร่วม zod / ฟอร์ม / CHECK */
export const SET_RANGES = {
  weight: { kg: { min: 0, max: 1000 }, lb: { min: 0, max: 2200 }, decimals: 2 },
  reps: { min: 1, max: 1000 },
  durationS: { min: 1, max: 86_400 },
  distance: { km: { min: 0.01, max: 1000 }, mi: { min: 0.01, max: 620 }, decimals: 2 },
  speed: { kmh: { min: 0.1, max: 40 }, mph: { min: 0.1, max: 25 }, decimals: 1 },
  inclinePct: { min: 0, max: 40, decimals: 1 },
  /** เซสชันยาวไม่เกิน 24 ชม. */
  sessionMaxMs: 24 * 60 * 60 * 1000,
} as const;

/** เพดานจำนวน (contract D9) */
export const WORKOUT_LIMITS = {
  exercisesPerSession: 40,
  setsPerExercise: 100,
  /** เพดานรวมต่อคน นับแถวที่ลบแล้วด้วย */
  sessionsTotal: 20_000,
  sessionExercisesTotal: 150_000,
  setsTotal: 500_000,
} as const;

// ---------------- ตัวช่วยตรวจ ----------------

/** จำนวนทศนิยมไม่เกิน `decimals` (ทนความคลาดของ double) */
export function hasMaxDecimals(v: number, decimals: number): boolean {
  const f = 10 ** decimals;
  return Math.abs(v * f - Math.round(v * f)) < 1e-6;
}

const inRange = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max;

export const isValidTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** วันที่ท้องถิ่น YYYY-MM-DD ของ instant ใน time zone นั้น (null ถ้า time zone/เวลาไม่ถูกต้อง) */
export function localDateOf(instant: Date | string, timeZone: string): string | null {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value;
    return `${g("year")}-${g("month")}-${g("day")}`;
  } catch {
    return null;
  }
}

// ---------------- zod: ช่องร่วม ----------------

const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid4 = z.string().regex(UUID_V4);
/** exercise_id: v4 (ท่าของฉัน) หรือ v5 (คลัง) — ว่าเป็นแถวจริงของใครเซิร์ฟเวอร์ตรวจ (`parent_missing`) */
const exerciseRef = z.string().regex(UUID_ANY);
const iso = z.iso.datetime();
const position = z.number().int().min(0).max(1000);

// ช่องที่เซิร์ฟเวอร์ตั้งเอง — ไคลเอนต์ส่งกลับ (สะท้อนแถวจาก bootstrap) ได้ แต่ถูกเพิกเฉย (เหมือน sync.ts)
const serverManaged = {
  id: z.unknown().optional(),
  created_at: z.unknown().optional(),
  updated_at: z.unknown().optional(),
  client_updated_at: z.unknown().optional(),
  deleted_at: z.unknown().optional(),
};

// ---------------- workout_session ----------------

export const workoutSessionDataSchema = z
  .strictObject({
    ...serverManaged,
    place_id: uuid4,
    started_at: iso,
    ended_at: iso.nullable().optional(),
    local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_zone: z.string().min(1).max(64),
  })
  .superRefine((d, ctx) => {
    if (!isValidTimeZone(d.time_zone)) {
      ctx.addIssue({ code: "custom", path: ["time_zone"], message: "invalid_time_zone" });
    } else if (localDateOf(d.started_at, d.time_zone) !== d.local_date) {
      // กันตกวันผิด: local_date ต้องเป็นวันที่ของ started_at ใน time_zone นั้น
      ctx.addIssue({ code: "custom", path: ["local_date"], message: "local_date_mismatch" });
    }
    if (d.ended_at) {
      const span = new Date(d.ended_at).getTime() - new Date(d.started_at).getTime();
      if (span < 0 || span > SET_RANGES.sessionMaxMs) ctx.addIssue({ code: "custom", path: ["ended_at"], message: "bad_session_span" });
    }
  });
export type WorkoutSessionData = z.infer<typeof workoutSessionDataSchema>;

// ---------------- session_exercise ----------------
// สำเนา exercise_name / exercise_name_th / track_type / load_mode: เซิร์ฟเวอร์คัดลอกเอง — ส่งมา = invalid (strict)

export const sessionExerciseDataSchema = z.strictObject({
  ...serverManaged,
  session_id: uuid4,
  exercise_id: exerciseRef,
  position,
});
export type SessionExerciseData = z.infer<typeof sessionExerciseDataSchema>;

// ---------------- set_record ----------------

const optNum = z.number().finite().nullable().optional();

/** รูปเซ็ตระดับช่อง (ยังไม่ตรวจตาม track_type — ใช้ `validateSetFields` กับสำเนาในท่าของเซสชัน) */
export const setRecordDataSchema = z
  .strictObject({
    ...serverManaged,
    session_exercise_id: uuid4,
    position,
    set_kind: z.enum(SET_KINDS),
    /** ส่งเฉพาะเซ็ตที่ติ๊กแล้ว */
    completed_at: iso,
    weight_input: optNum,
    weight_unit: z.enum(WEIGHT_UNITS).nullable().optional(),
    reps: optNum,
    duration_s: optNum,
    distance_input: optNum,
    distance_unit: z.enum(DISTANCE_UNITS).nullable().optional(),
    speed_input: optNum,
    speed_unit: z.enum(SPEED_UNITS).nullable().optional(),
    incline_pct: optNum,
  })
  .superRefine((d, ctx) => {
    // ค่ากับหน่วยต้องมาคู่กัน
    const pairs = [
      [d.weight_input, d.weight_unit, "weight_unit"],
      [d.distance_input, d.distance_unit, "distance_unit"],
      [d.speed_input, d.speed_unit, "speed_unit"],
    ] as const;
    for (const [v, u, path] of pairs) {
      if ((v == null) !== (u == null)) ctx.addIssue({ code: "custom", path: [path], message: "value_unit_pair" });
    }
  });
export type SetRecordData = z.infer<typeof setRecordDataSchema>;

// ---------------- ช่องตาม track_type (ADR 0003 ข้อ 2) ----------------

export type FieldNeed = "required" | "optional" | "forbidden";
export type SetField = "weight" | "reps" | "duration" | "distance" | "speed" | "incline";

/** ตารางช่องตามชนิดการจด: required = ● · optional = ○ · forbidden = – (น้ำหนักของ weight_reps ขึ้นกับ load_mode) */
export function fieldRules(trackType: TrackType, loadMode: LoadMode = "external"): Record<SetField, FieldNeed> {
  const none: Record<SetField, FieldNeed> = {
    weight: "forbidden",
    reps: "forbidden",
    duration: "forbidden",
    distance: "forbidden",
    speed: "forbidden",
    incline: "forbidden",
  };
  switch (trackType) {
    case "weight_reps":
      return { ...none, weight: loadMode === "bodyweight_plus" ? "optional" : "required", reps: "required" };
    case "reps_only":
      return { ...none, reps: "required" };
    case "duration":
      return { ...none, duration: "required" };
    case "distance_duration":
      return { ...none, duration: "required", distance: "optional" };
    case "weight_duration":
      return { ...none, weight: "required", duration: "required" };
    case "incline_speed_duration":
      return { ...none, duration: "required", distance: "optional", speed: "required", incline: "required" };
  }
}

export type SetFieldIssue = { field: SetField; reason: "missing" | "forbidden" | "range" | "decimals" };

/** ตรวจเซ็ตกับ track_type/load_mode ของสำเนาใน session_exercise · คืนรายการปัญหา (ว่าง = ผ่าน) */
export function validateSetFields(d: SetRecordData, trackType: TrackType, loadMode: LoadMode): SetFieldIssue[] {
  const issues: SetFieldIssue[] = [];
  const rules = fieldRules(trackType, loadMode);
  const R = SET_RANGES;
  const present: Record<SetField, boolean> = {
    weight: d.weight_input != null,
    reps: d.reps != null,
    duration: d.duration_s != null,
    distance: d.distance_input != null,
    speed: d.speed_input != null,
    incline: d.incline_pct != null,
  };
  for (const f of Object.keys(rules) as SetField[]) {
    if (rules[f] === "required" && !present[f]) issues.push({ field: f, reason: "missing" });
    if (rules[f] === "forbidden" && present[f]) issues.push({ field: f, reason: "forbidden" });
  }
  const check = (f: SetField, v: number | null | undefined, range: { min: number; max: number }, decimals: number) => {
    if (v == null || rules[f] === "forbidden") return;
    if (!inRange(v, range)) issues.push({ field: f, reason: "range" });
    else if (!hasMaxDecimals(v, decimals)) issues.push({ field: f, reason: "decimals" });
  };
  if (d.weight_unit) check("weight", d.weight_input, R.weight[d.weight_unit], R.weight.decimals);
  check("reps", d.reps, R.reps, 0);
  check("duration", d.duration_s, R.durationS, 0);
  if (d.distance_unit) check("distance", d.distance_input, R.distance[d.distance_unit], R.distance.decimals);
  if (d.speed_unit) check("speed", d.speed_input, R.speed[d.speed_unit], R.speed.decimals);
  check("incline", d.incline_pct, R.inclinePct, R.inclinePct.decimals);
  return issues;
}

export type SetDerived = { weight_kg: number | null; distance_m: number | null; speed_mps: number | null };

/** ค่ามาตรฐานของเซ็ต (เต็มความละเอียด) จาก `_input` + `_unit` — ใช้ทั้งเซิร์ฟเวอร์และไคลเอนต์ */
export function computeSetDerived(
  d: Pick<SetRecordData, "weight_input" | "weight_unit" | "distance_input" | "distance_unit" | "speed_input" | "speed_unit">,
): SetDerived {
  return {
    weight_kg: d.weight_input != null && d.weight_unit ? weightToKg(d.weight_input, d.weight_unit as WeightUnit) : null,
    distance_m: d.distance_input != null && d.distance_unit ? distanceToMeters(d.distance_input, d.distance_unit as DistanceUnit) : null,
    speed_mps: d.speed_input != null && d.speed_unit ? speedToMps(d.speed_input, d.speed_unit as SpeedUnit) : null,
  };
}

// ---------------- รูปแถวบนสาย (bootstrap) ----------------

export type WireSet = {
  id: string;
  session_exercise_id: string;
  position: number;
  set_kind: SetKind;
  completed_at: string;
  weight_kg: number | null;
  weight_input: number | null;
  weight_unit: string | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  distance_input: number | null;
  distance_unit: string | null;
  speed_mps: number | null;
  speed_input: number | null;
  speed_unit: string | null;
  incline_pct: number | null;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
};

export type WireSessionExercise = {
  id: string;
  session_id: string;
  exercise_id: string;
  position: number;
  exercise_name: string;
  exercise_name_th: string | null;
  track_type: string;
  load_mode: string;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  sets: WireSet[];
};

export type WireSession = {
  id: string;
  place_id: string;
  /** ชื่อสถานที่ ณ ตอนสร้าง bootstrap (แสดงในรายการ) */
  place_name: string;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  time_zone: string;
  template_id: string | null;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  exercises: WireSessionExercise[];
};

/**
 * ตัววัดสถิติต่อท่า (contract D3 · ADR 0003 ข้อ 4) จากเซ็ต normal ที่ไม่ลบของเซสชันที่จบแล้ว — ตัววัดที่ไม่เกี่ยวกับชนิดของท่า = null หรือ []
 * รายการ `*_at_*` เป็น Pareto frontier (จุดที่ไม่ถูกข่ม) ไม่ใช่เลขเดียว
 */
export type ExerciseBests = {
  /** weight_reps external · weight_duration */
  max_weight_kg: number | null;
  /** reps_only */
  max_reps: number | null;
  /** weight_reps: ครั้งมากสุดที่น้ำหนัก ≥ เดิม (external/bodyweight_plus: weight_kg = น้ำหนักถ่วง null นับ 0 · assisted: weight_kg = น้ำหนักช่วย ทิศทาง ≤) */
  reps_at_weight: { weight_kg: number; reps: number }[];
  /** bodyweight_plus */
  max_extra_weight_kg: number | null;
  /** assisted */
  min_assist_kg: number | null;
  /** duration · weight_duration · distance_duration */
  max_duration_s: number | null;
  /** weight_duration: เวลามากสุดที่น้ำหนัก ≥ เดิม */
  duration_at_weight: { weight_kg: number; duration_s: number }[];
  max_distance_m: number | null;
  /** วินาทีต่อ km ต่ำสุด · เฉพาะเซ็ตระยะ ≥ 1,000 m */
  best_pace_s_per_km: number | null;
  /** incline_speed_duration: เวลามากสุดที่ความชัน ≥ เดิม */
  duration_at_incline: { incline_pct: number; duration_s: number }[];
};

export type ExerciseSummary = {
  exercise_id: string;
  last_used_at: string;
  sessions_90d: number;
  /** เซ็ตของครั้งล่าสุดที่ทำท่านี้ (ใช้เติมค่า) */
  last_sets: WireSet[];
  bests: ExerciseBests;
};
