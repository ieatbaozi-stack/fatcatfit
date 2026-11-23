import { z } from "zod";
import { stripControlChars } from "./exercise-meta";
import { heightToMeters, weightToKg } from "./units";

// แบบสอบถามเริ่มต้น (R1 · UX E1 ข้อ 3) — schema + ช่วงค่าที่ใช้ร่วมไคลเอนต์ (แสดงข้อความใต้ช่อง) และเซิร์ฟเวอร์ (ตัดสินจริง)
// ช่วงค่าเป็นค่าที่ platform เลือกเอง (contract ไม่ระบุตัวเลข) — แก้ที่เดียวที่นี่

/** อายุขั้นต่ำ (ปี) — boss ตัดสิน 2026-11-19 (แก้จาก 15 เป็น 20) · ตรวจแบบ ปีปัจจุบัน − ปีเกิด ≥ MIN_AGE */
export const MIN_AGE = 20;

export const ONBOARDING_LIMITS = {
  /** ช่วงน้ำหนักที่ยอมรับ หน่วย kg (ตรวจกับค่ามาตรฐานหลังแปลง lb) */
  weightKg: { min: 20, max: 500 },
  /** ช่วงส่วนสูง หน่วยเมตร (ตรวจกับค่ามาตรฐานหลังแปลง in) */
  heightM: { min: 0.5, max: 2.8 },
  birthYearMin: 1920,
  /** ปีเกิดมากสุดที่รับ = ปีปัจจุบัน − MIN_AGE (คำนวณตอนอ่าน ตามเวลาเครื่อง) */
  get birthYearMax(): number {
    return new Date().getFullYear() - MIN_AGE;
  },
  placeNameMax: 60,
  maxGoals: 4,
};

export const GOALS = ["stronger", "fitter", "lose_weight", "show_up"] as const;
export const EXPERIENCES = ["new", "some", "regular"] as const;
export type Goal = (typeof GOALS)[number];
export type Experience = (typeof EXPERIENCES)[number];

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const uuid = z.string().regex(UUID_V4);
const finite = z.number().finite();

export const onboardingSchema = z.object({
  profile: z.object({
    locale: z.enum(["th", "en"]),
    weightUnit: z.enum(["kg", "lb"]),
    lengthUnit: z.enum(["cm", "in"]),
    distanceUnit: z.enum(["km", "mi"]),
    birthYear: z.number().int(),
    height: z.object({ value: finite, unit: z.enum(["cm", "in"]) }),
    goals: z.array(z.enum(GOALS)).max(ONBOARDING_LIMITS.maxGoals),
    experience: z.enum(EXPERIENCES).nullable().optional(),
  }),
  place: z.object({
    id: uuid,
    name: z.string().transform(stripControlChars).pipe(z.string().trim().min(1).max(ONBOARDING_LIMITS.placeNameMax)),
  }),
  bodyEntry: z.object({
    id: uuid,
    weight: z.object({ value: finite, unit: z.enum(["kg", "lb"]) }),
    /** เวลาที่ชั่ง (ISO-8601 UTC ลงท้าย Z) */
    measuredAt: z.string().datetime(),
    /** วันที่ท้องถิ่นของผู้ใช้ ณ เวลานั้น YYYY-MM-DD */
    localDate: z.string().regex(LOCAL_DATE),
  }),
  /** เวลาบนเครื่องไคลเอนต์ตอนกดส่ง (ISO UTC) — ไม่ใส่ = เวลาเซิร์ฟเวอร์ */
  clientUpdatedAt: z.string().datetime().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export type FieldCode = "required" | "invalid" | "out_of_range";
export type OnboardingResult =
  | { ok: true; data: OnboardingInput; weightKg: number; heightM: number }
  | { ok: false; fields: Record<string, FieldCode> };

function valueAt(root: unknown, path: PropertyKey[]): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[k];
  }
  return cur;
}

function isRealLocalDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** ตรวจรูปแบบ + ช่วงค่า · ผิดคืนรหัสต่อช่อง (path แบบ "profile.birthYear") ให้ UI วางใต้ช่อง */
export function validateOnboarding(input: unknown, now: Date): OnboardingResult {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, FieldCode> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".") || "_";
      const v = valueAt(input, issue.path);
      fields[path] = v === undefined || v === null || v === "" ? "required" : "invalid";
    }
    return { ok: false, fields };
  }
  const d = parsed.data;
  const fields: Record<string, FieldCode> = {};

  const weightKg = weightToKg(d.bodyEntry.weight.value, d.bodyEntry.weight.unit);
  if (weightKg < ONBOARDING_LIMITS.weightKg.min || weightKg > ONBOARDING_LIMITS.weightKg.max) {
    fields["bodyEntry.weight.value"] = "out_of_range";
  }
  const heightM = heightToMeters(d.profile.height.value, d.profile.height.unit);
  if (heightM < ONBOARDING_LIMITS.heightM.min || heightM > ONBOARDING_LIMITS.heightM.max) {
    fields["profile.height.value"] = "out_of_range";
  }
  const year = now.getUTCFullYear();
  if (d.profile.birthYear < ONBOARDING_LIMITS.birthYearMin || d.profile.birthYear > year - MIN_AGE) {
    fields["profile.birthYear"] = "out_of_range";
  }
  if (new Set(d.profile.goals).size !== d.profile.goals.length) fields["profile.goals"] = "invalid";

  const measured = new Date(d.bodyEntry.measuredAt).getTime();
  if (Math.abs(measured - now.getTime()) > 2 * 86_400_000) fields["bodyEntry.measuredAt"] = "out_of_range";
  if (!isRealLocalDate(d.bodyEntry.localDate)) {
    fields["bodyEntry.localDate"] = "invalid";
  } else if (
    // เขตเวลาต่างจาก UTC ได้ไม่เกิน ±14 ชม. → วันท้องถิ่นห่างวัน UTC ของเวลาที่ชั่งได้ไม่เกิน 1 วัน
    Math.abs(new Date(`${d.bodyEntry.localDate}T00:00:00.000Z`).getTime() - Date.UTC(
      new Date(measured).getUTCFullYear(),
      new Date(measured).getUTCMonth(),
      new Date(measured).getUTCDate(),
    )) > 86_400_000
  ) {
    fields["bodyEntry.localDate"] = "out_of_range";
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, data: d, weightKg, heightM };
}
