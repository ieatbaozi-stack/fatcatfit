// logic ล้วนของแบบสอบถามเริ่มต้น (UX E1 ข้อ 3) — ค่าอยู่ในหน่วยความจำ ส่งครั้งเดียวตอน "เริ่มใช้"
// ช่วงค่าและ schema มาจาก src/lib/data/shared/onboarding.ts (ที่เดียวกับเซิร์ฟเวอร์) — ไม่ประกาศตัวเลขซ้ำ

import { EXPERIENCES, GOALS, MIN_AGE, ONBOARDING_LIMITS, type Experience, type Goal } from "@/lib/data/shared/onboarding";
import { heightToMeters, KG_PER_LB, M_PER_IN, weightToKg } from "@/lib/data/shared/units";

export type UnitSet = "metric" | "imperial";
export type PlaceKind = "gym" | "home" | "park" | "office";
export const PLACE_KINDS: readonly PlaceKind[] = ["gym", "home", "park", "office"];
export { EXPERIENCES, GOALS };

export type Draft = {
  unitSet: UnitSet;
  weight: number | null;
  height: number | null;
  birthYear: number | null;
  placeKind: PlaceKind | null;
  placeName: string;
  goals: Goal[];
  experience: Experience | null;
};

export const EMPTY_DRAFT: Draft = {
  unitSet: "metric",
  weight: null,
  height: null,
  birthYear: null,
  placeKind: null,
  placeName: "",
  goals: [],
  experience: null,
};

export type FieldKey = "weight" | "height" | "birthYear" | "placeName";
export type FieldIssue = "required" | "invalid" | "out_of_range";
/** ปีเกิดที่อายุไม่ถึง MIN_AGE (ปีมากเกิน = อายุไม่ถึง) · รับ now เพื่อเทสต์ได้ ค่าเท่ากับ ONBOARDING_LIMITS.birthYearMax */
export function isTooYoung(birthYear: number, now: Date): boolean {
  return now.getFullYear() - birthYear < MIN_AGE;
}
export type FieldIssues = Partial<Record<FieldKey, FieldIssue>>;

export const UNITS = {
  metric: { weight: "kg", length: "cm", distance: "km" },
  imperial: { weight: "lb", length: "in", distance: "mi" },
} as const;

function round(n: number, decimals: number): number {
  return Number(n.toFixed(decimals));
}

/** สลับชุดหน่วย: แปลงค่าที่กรอกแล้วให้ตรง (น้ำหนัก 1 ทศนิยม · ส่วนสูง cm จำนวนเต็ม / in 1 ทศนิยม) */
export function switchUnitSet(draft: Draft, next: UnitSet): Draft {
  if (draft.unitSet === next) return draft;
  const kg = draft.weight === null ? null : weightToKg(draft.weight, UNITS[draft.unitSet].weight);
  const w = kg === null ? null : round(next === "metric" ? kg : kg / KG_PER_LB, 1);
  const h =
    draft.height === null
      ? null
      : next === "metric"
        ? round((draft.height * M_PER_IN) * 100, 0)
        : round(draft.height / (M_PER_IN * 100), 1);
  return { ...draft, unitSet: next, weight: w, height: h };
}

/** ปีปัจจุบันตามเวลาท้องถิ่น (ใช้ตรวจปีเกิด — เซิร์ฟเวอร์ใช้ปี UTC ต่างกันไม่เกิน 1 วัน) */
export function ageFromBirthYear(birthYear: number, now: Date): number {
  return now.getFullYear() - birthYear;
}

/** ตรวจขั้น 1 (ร่างกาย): คืนปัญหาต่อช่อง · ว่าง = required (ปุ่ม "ต่อไป" ปิด ไม่แสดง error จนกว่าจะพิมพ์) */
export function validateBody(draft: Draft, now: Date): FieldIssues {
  const issues: FieldIssues = {};
  const u = UNITS[draft.unitSet];
  if (draft.weight === null) issues.weight = "required";
  else {
    const kg = weightToKg(draft.weight, u.weight);
    if (kg < ONBOARDING_LIMITS.weightKg.min || kg > ONBOARDING_LIMITS.weightKg.max) issues.weight = "out_of_range";
  }
  if (draft.height === null) issues.height = "required";
  else {
    const m = heightToMeters(draft.height, u.length);
    if (m < ONBOARDING_LIMITS.heightM.min || m > ONBOARDING_LIMITS.heightM.max) issues.height = "out_of_range";
  }
  if (draft.birthYear === null) issues.birthYear = "required";
  else if (!Number.isInteger(draft.birthYear)) issues.birthYear = "invalid";
  else if (draft.birthYear < ONBOARDING_LIMITS.birthYearMin || isTooYoung(draft.birthYear, now)) {
    issues.birthYear = "out_of_range";
  }
  return issues;
}

export function validatePlace(draft: Draft): FieldIssues {
  const name = draft.placeName.trim();
  if (name === "") return { placeName: "required" };
  if (name.length > ONBOARDING_LIMITS.placeNameMax) return { placeName: "out_of_range" };
  return {};
}

/** เวลาท้องถิ่น → YYYY-MM-DD */
export function localDateString(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type SubmitIds = { placeId: string; bodyEntryId: string };

/** body ของ POST /api/onboarding (รูปตาม onboardingSchema) · id สร้างครั้งเดียวต่อหน้า (ส่งซ้ำด้วย id เดิม = ไม่เกิดแถวซ้ำ) */
export function buildPayload(draft: Draft, ids: SubmitIds, locale: "th" | "en", now: Date) {
  const u = UNITS[draft.unitSet];
  return {
    profile: {
      locale,
      weightUnit: u.weight,
      lengthUnit: u.length,
      distanceUnit: u.distance,
      birthYear: draft.birthYear,
      height: { value: draft.height, unit: u.length },
      goals: draft.goals,
      experience: draft.experience,
    },
    place: { id: ids.placeId, name: draft.placeName.trim() },
    bodyEntry: {
      id: ids.bodyEntryId,
      weight: { value: draft.weight, unit: u.weight },
      measuredAt: now.toISOString(),
      localDate: localDateString(now),
    },
    clientUpdatedAt: now.toISOString(),
  };
}

const FIELD_OF_PATH: Record<string, FieldKey> = {
  "bodyEntry.weight.value": "weight",
  "bodyEntry.weight": "weight",
  "profile.height.value": "height",
  "profile.height": "height",
  "profile.birthYear": "birthYear",
  "place.name": "placeName",
};

/** แผนที่ `fields` จากเซิร์ฟเวอร์ (path → รหัส) เป็นปัญหาต่อช่อง · path ที่ไม่ใช่ช่องของฟอร์ม (เช่นเวลาเครื่อง) → general */
export function mapServerFields(fields: Record<string, string>): { issues: FieldIssues; general: boolean } {
  const issues: FieldIssues = {};
  let general = false;
  for (const [path, code] of Object.entries(fields)) {
    const key = FIELD_OF_PATH[path];
    const issue: FieldIssue = code === "required" || code === "out_of_range" ? code : "invalid";
    if (key) issues[key] = issue;
    else general = true;
  }
  return { issues, general };
}

/** ขั้นที่มีช่องผิดอยู่ (1 = ร่างกาย · 2 = สถานที่) — ใช้พากลับไปแก้ */
export function stepOfIssue(issues: FieldIssues): 1 | 2 {
  return issues.weight || issues.height || issues.birthYear ? 1 : 2;
}

/** คำเริ่มต้นของชื่อสถานที่เมื่อเลือกชิป (ผู้ใช้แก้ต่อได้) */
export function nextPlaceName(current: string, previousDefault: string | null, newDefault: string): string {
  return current.trim() === "" || current === previousDefault ? newDefault : current;
}
