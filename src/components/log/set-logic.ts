// ตรรกะบริสุทธิ์ของแถวเซ็ตในหน้าจด (R3a · UX 3 · 13.5) — ไม่มี React/DOM
// ช่องตามชนิดการจด · หน่วย · ค่าเติม (D6/UX 3) · ตรวจช่วงค่า (D4) ตามค่าขอบกลางของ src/lib/data/shared/workout.ts

import type { LoadMode, TrackType } from "@/lib/data/shared/exercise-meta";
import { fieldRules, hasMaxDecimals, SET_RANGES, type FieldNeed, type SetField, type WireSet } from "@/lib/data/shared/workout";
import { KG_PER_LB, M_PER_MI, MPS_PER_KMH, MPS_PER_MPH } from "@/lib/data/shared/units";
import { EMPTY_SET_VALUES, type DraftSet, type SetValues } from "@/lib/offline/session";
import { formatClock } from "@/lib/offline/timer";

export type DisplayUnits = { weight: "kg" | "lb"; distance: "km" | "mi"; speed: "kmh" | "mph" };

export const DEFAULT_UNITS: DisplayUnits = { weight: "kg", distance: "km", speed: "kmh" };

/** หน่วยที่แสดงตามโปรไฟล์ (D6: ชุดเดียวทั้งแอป · ความเร็วตามระยะ) */
export function unitsFromProfile(p: { weight_unit?: string; distance_unit?: string } | null | undefined): DisplayUnits {
  const distance = p?.distance_unit === "mi" ? "mi" : "km";
  return { weight: p?.weight_unit === "lb" ? "lb" : "kg", distance, speed: distance === "mi" ? "mph" : "kmh" };
}

/** ช่องที่แสดงเป็นคอลัมน์ ตามลำดับ (UX 3) */
export const COLUMNS: Record<TrackType, readonly SetField[]> = {
  weight_reps: ["weight", "reps"],
  reps_only: ["reps"],
  duration: ["duration"],
  distance_duration: ["distance", "duration"],
  weight_duration: ["weight", "duration"],
  incline_speed_duration: ["incline", "speed", "duration"],
};

export const columnsOf = (track: TrackType): readonly SetField[] => COLUMNS[track];
export const needOf = (track: TrackType, load: LoadMode, f: SetField): FieldNeed => fieldRules(track, load)[f];

/** ก้าว −/+ (D6: 2.5 kg / 5 lb · ครั้งละ 1 · เวลา 15 วิ · ระยะ/เร็ว 0.1 · ชัน 0.5) */
export function stepOf(f: SetField, units: DisplayUnits, v?: SetValues): number {
  switch (f) {
    case "weight":
      return (v?.weight_unit ?? units.weight) === "lb" ? 5 : 2.5;
    case "reps":
      return 1;
    case "duration":
      return 15;
    case "distance":
    case "speed":
      return 0.1;
    case "incline":
      return 0.5;
  }
}

export function getField(v: SetValues, f: SetField): number | null {
  switch (f) {
    case "weight":
      return v.weight_input;
    case "reps":
      return v.reps;
    case "duration":
      return v.duration_s;
    case "distance":
      return v.distance_input;
    case "speed":
      return v.speed_input;
    case "incline":
      return v.incline_pct;
  }
}

/** หน่วยที่ใช้กับช่องนี้ของแถวนี้ (แถวที่จดด้วยหน่วยอื่นไว้ก่อนคงหน่วยเดิม) */
export function unitOf(v: SetValues, f: SetField, units: DisplayUnits): string {
  switch (f) {
    case "weight":
      return v.weight_unit ?? units.weight;
    case "distance":
      return v.distance_unit ?? units.distance;
    case "speed":
      return v.speed_unit ?? units.speed;
    case "incline":
      return "%";
    default:
      return "";
  }
}

export function setField(v: SetValues, f: SetField, n: number | null, units: DisplayUnits): SetValues {
  switch (f) {
    case "weight":
      return { ...v, weight_input: n, weight_unit: n === null ? null : ((v.weight_unit ?? units.weight) as "kg" | "lb") };
    case "reps":
      return { ...v, reps: n };
    case "duration":
      return { ...v, duration_s: n };
    case "distance":
      return { ...v, distance_input: n, distance_unit: n === null ? null : ((v.distance_unit ?? units.distance) as "km" | "mi") };
    case "speed":
      return { ...v, speed_input: n, speed_unit: n === null ? null : ((v.speed_unit ?? units.speed) as "kmh" | "mph") };
    case "incline":
      return { ...v, incline_pct: n };
  }
}

/** ช่องบังคับครบไหม (● ของตาราง UX 3) */
export function hasRequired(v: SetValues, track: TrackType, load: LoadMode): boolean {
  const rules = fieldRules(track, load);
  return (Object.keys(rules) as SetField[]).every((f) => rules[f] !== "required" || getField(v, f) !== null);
}

// ---------------- ตรวจช่วงค่า (D4 · UX 13.5) ----------------

export type RangeKey =
  | "weightMax"
  | "weightMin"
  | "weightDecimals"
  | "repsMin"
  | "repsMax"
  | "repsInteger"
  | "durationMin"
  | "durationMax"
  | "distanceMin"
  | "distanceMax"
  | "distanceDecimals"
  | "speedMin"
  | "speedMax"
  | "speedDecimals"
  | "incline"
  | "inclineDecimals";

export type FieldError = {
  field: SetField;
  key: RangeKey;
  /** live = ขึ้นทันทีที่พิมพ์ · blur = ต่ำกว่าขอบล่าง ขึ้นตอนออกจากช่อง (กันวาบตอนพิมพ์ "0.05") */
  phase: "live" | "blur";
  /** ค่าไว้ใส่ข้อความ (จัดรูปตาม locale แล้ว) */
  params: { min?: string; max?: string; unit?: string };
};

export type Fmt = (n: number) => string;

/** ข้อผิดพลาดช่วงค่าของทุกช่องที่ใช้กับชนิดนี้ (ช่องว่าง = ไม่ผิด) · เรียงตามคอลัมน์ */
export function fieldErrors(v: SetValues, track: TrackType, load: LoadMode, units: DisplayUnits, fmt: Fmt): FieldError[] {
  const out: FieldError[] = [];
  const rules = fieldRules(track, load);
  const R = SET_RANGES;
  for (const f of COLUMNS[track]) {
    if (rules[f] === "forbidden") continue;
    const n = getField(v, f);
    if (n === null) continue;
    switch (f) {
      case "weight": {
        const u = unitOf(v, f, units) as "kg" | "lb";
        const r = R.weight[u];
        if (n > r.max) out.push({ field: f, key: "weightMax", phase: "live", params: { max: fmt(r.max), unit: u } });
        else if (n < r.min) out.push({ field: f, key: "weightMin", phase: "blur", params: {} });
        else if (!hasMaxDecimals(n, R.weight.decimals)) out.push({ field: f, key: "weightDecimals", phase: "live", params: {} });
        break;
      }
      case "reps":
        if (n > R.reps.max) out.push({ field: f, key: "repsMax", phase: "live", params: { max: fmt(R.reps.max) } });
        else if (!Number.isInteger(n)) out.push({ field: f, key: "repsInteger", phase: "live", params: {} });
        else if (n < R.reps.min) out.push({ field: f, key: "repsMin", phase: "blur", params: {} });
        break;
      case "duration":
        if (n > R.durationS.max) out.push({ field: f, key: "durationMax", phase: "live", params: {} });
        else if (n < R.durationS.min || !Number.isInteger(n)) out.push({ field: f, key: "durationMin", phase: "blur", params: {} });
        break;
      case "distance": {
        const u = unitOf(v, f, units) as "km" | "mi";
        const r = R.distance[u];
        if (n > r.max) out.push({ field: f, key: "distanceMax", phase: "live", params: { max: fmt(r.max), unit: u } });
        else if (!hasMaxDecimals(n, R.distance.decimals)) out.push({ field: f, key: "distanceDecimals", phase: "live", params: {} });
        else if (n < r.min) out.push({ field: f, key: "distanceMin", phase: "blur", params: { min: fmt(r.min), unit: u } });
        break;
      }
      case "speed": {
        const u = unitOf(v, f, units) as "kmh" | "mph";
        const r = R.speed[u];
        const label = u === "kmh" ? "km/h" : "mph";
        if (n > r.max) out.push({ field: f, key: "speedMax", phase: "live", params: { max: fmt(r.max), unit: label } });
        else if (!hasMaxDecimals(n, R.speed.decimals)) out.push({ field: f, key: "speedDecimals", phase: "live", params: {} });
        else if (n < r.min) out.push({ field: f, key: "speedMin", phase: "blur", params: { min: fmt(r.min), unit: label } });
        break;
      }
      case "incline":
        if (!hasMaxDecimals(n, R.inclinePct.decimals)) out.push({ field: f, key: "inclineDecimals", phase: "live", params: {} });
        else if (n > R.inclinePct.max) out.push({ field: f, key: "incline", phase: "live", params: { min: fmt(R.inclinePct.min), max: fmt(R.inclinePct.max) } });
        else if (n < R.inclinePct.min) out.push({ field: f, key: "incline", phase: "blur", params: { min: fmt(R.inclinePct.min), max: fmt(R.inclinePct.max) } });
        break;
    }
  }
  return out;
}

/** ✓ กดได้: ช่องบังคับครบ และไม่มีช่องไหนนอกช่วง (ทุกชนิดของข้อผิดพลาดนับ แม้ยังไม่แสดงข้อความ) */
export const canTick = (v: SetValues, track: TrackType, load: LoadMode, units: DisplayUnits, fmt: Fmt): boolean =>
  hasRequired(v, track, load) && fieldErrors(v, track, load, units, fmt).length === 0;

/** ข้อความที่แสดงตอนนี้ (live ทันที · blur เฉพาะช่องที่ออกจากช่องแล้ว) */
export const visibleErrors = (errors: FieldError[], touched: ReadonlySet<SetField>): FieldError[] =>
  errors.filter((e) => e.phase === "live" || touched.has(e.field));

// ---------------- เวลา (พิมพ์ต่อจากขวา · UX 3) ----------------

/** 130 → 90 วิ (1:30) · เกิน 6 หลักตัดหลักหน้าทิ้ง · ว่าง/ศูนย์ล้วน = null */
export function durationFromDigits(digits: string): number | null {
  const d = digits.replace(/\D/g, "").replace(/^0+/, "").slice(-6);
  if (d === "") return null;
  const p = d.padStart(6, "0");
  return Number(p.slice(0, 2)) * 3600 + Number(p.slice(2, 4)) * 60 + Number(p.slice(4, 6));
}

// ---------------- แปลงหน่วยจากค่ามาตรฐาน ----------------

const round = (n: number, d: number) => Number(n.toFixed(d));

/** เซ็ตจากเซิร์ฟเวอร์ → ค่าในหน่วยที่แสดง (หน่วยเดียวกับที่จด = ค่าที่พิมพ์ · ต่างหน่วย = แปลงจากค่ามาตรฐาน ปัด 1 ตำแหน่ง · ระยะ 2) */
export function valuesFromWire(s: WireSet, units: DisplayUnits): SetValues {
  const v: SetValues = { ...EMPTY_SET_VALUES, reps: s.reps, duration_s: s.duration_s, incline_pct: s.incline_pct };
  if (s.weight_input !== null) {
    if (s.weight_unit === units.weight) Object.assign(v, { weight_input: s.weight_input, weight_unit: units.weight });
    else if (s.weight_kg !== null) Object.assign(v, { weight_input: round(units.weight === "kg" ? s.weight_kg : s.weight_kg / KG_PER_LB, 1), weight_unit: units.weight });
  }
  if (s.distance_input !== null) {
    if (s.distance_unit === units.distance) Object.assign(v, { distance_input: s.distance_input, distance_unit: units.distance });
    else if (s.distance_m !== null) Object.assign(v, { distance_input: round(units.distance === "km" ? s.distance_m / 1000 : s.distance_m / M_PER_MI, 2), distance_unit: units.distance });
  }
  if (s.speed_input !== null) {
    if (s.speed_unit === units.speed) Object.assign(v, { speed_input: s.speed_input, speed_unit: units.speed });
    else if (s.speed_mps !== null) Object.assign(v, { speed_input: round(units.speed === "kmh" ? s.speed_mps / MPS_PER_KMH : s.speed_mps / MPS_PER_MPH, 1), speed_unit: units.speed });
  }
  return v;
}

export const valuesOfDraft = (s: DraftSet): SetValues => ({
  weight_input: s.weight_input,
  weight_unit: s.weight_unit,
  reps: s.reps,
  duration_s: s.duration_s,
  distance_input: s.distance_input,
  distance_unit: s.distance_unit,
  speed_input: s.speed_input,
  speed_unit: s.speed_unit,
  incline_pct: s.incline_pct,
});

/**
 * ค่าของแถวถัดไป (UX 3): เซ็ตปกติล่าสุดในเซสชันนี้ → เซ็ตปกติแรกของครั้งก่อน (ข้ามวอร์มอัพ · D2) → เซ็ตสุดท้ายในเซสชัน (วอร์มอัพ) → ว่าง
 * `lastTime` = เซ็ตของครั้งล่าสุดที่ทำท่านี้ (exercise_summaries[].last_sets)
 */
export function suggestNext(args: { sets: readonly DraftSet[]; lastTime: readonly WireSet[] | undefined; units: DisplayUnits }): SetValues {
  const ordered = [...args.sets].sort((a, b) => a.position - b.position);
  const prevNormal = [...ordered].reverse().find((s) => s.set_kind === "normal");
  if (prevNormal) return valuesOfDraft(prevNormal);
  const first = [...(args.lastTime ?? [])].sort((a, b) => a.position - b.position).find((s) => s.set_kind === "normal");
  if (first) return valuesFromWire(first, args.units);
  const last = ordered.at(-1);
  return last ? valuesOfDraft(last) : { ...EMPTY_SET_VALUES };
}

// ---------------- แสดงผล ----------------

export type Locale = "th" | "en";

export const fmtNum = (n: number, locale: string, maxDecimals = 2): string =>
  n.toLocaleString(locale === "th" ? "th-TH-u-nu-latn" : "en-US", { maximumFractionDigits: maxDecimals });

export const unitLabel = (u: string): string => (u === "kmh" ? "km/h" : u);

/** สรุปค่าเซ็ตบรรทัดเดียว (ไม่มีคำภาษา: ใช้สัญลักษณ์) เช่น `65 kg × 5` · `5 km · 31:00` · `10:00 · 5 km/h · 3%` */
export function formatSetValues(track: TrackType, load: LoadMode, s: SetValues, locale: string): string {
  const w = s.weight_input !== null ? `${fmtNum(s.weight_input, locale)} ${unitLabel(s.weight_unit ?? "kg")}` : null;
  const t = s.duration_s !== null ? formatClock(s.duration_s) : null;
  const d = s.distance_input !== null ? `${fmtNum(s.distance_input, locale)} ${unitLabel(s.distance_unit ?? "km")}` : null;
  const sp = s.speed_input !== null ? `${fmtNum(s.speed_input, locale, 1)} ${unitLabel(s.speed_unit ?? "kmh")}` : null;
  const inc = s.incline_pct !== null ? `${fmtNum(s.incline_pct, locale, 1)}%` : null;
  const reps = s.reps !== null ? fmtNum(s.reps, locale, 0) : null;
  switch (track) {
    case "weight_reps": {
      const wt = w === null ? null : load === "assisted" ? `−${w}` : load === "bodyweight_plus" ? `+${w}` : w;
      return [wt, reps === null ? null : `× ${reps}`].filter(Boolean).join(" ");
    }
    case "reps_only":
      return reps === null ? "" : `× ${reps}`;
    case "duration":
      return t ?? "";
    case "distance_duration":
      return [d, t].filter(Boolean).join(" · ");
    case "weight_duration":
      return [w, t].filter(Boolean).join(" · ");
    case "incline_speed_duration":
      return [t, sp, inc].filter(Boolean).join(" · ");
  }
}

/** เพซ นาที:วินาทีต่อหน่วยระยะ (null = คำนวณไม่ได้) · แสดงในแถว distance_duration ที่มีระยะ */
export function paceOf(s: SetValues): string | null {
  if (s.distance_input === null || s.duration_s === null || s.distance_input <= 0 || s.duration_s <= 0) return null;
  return `${formatClock(Math.round(s.duration_s / s.distance_input))}/${s.distance_unit ?? "km"}`;
}

/** ระยะโดยประมาณของลู่วิ่ง = เร็ว × เวลา แปลงเป็นหน่วยระยะที่แสดง (null = คำนวณไม่ได้) */
export function estimatedDistance(s: SetValues, units: DisplayUnits): number | null {
  if (s.speed_input === null || s.duration_s === null) return null;
  const km = (s.speed_unit === "mph" ? s.speed_input * 1.609344 : s.speed_input) * (s.duration_s / 3600);
  return round(units.distance === "mi" ? km / 1.609344 : km, 2);
}

/** ช่วงที่ยอมรับของช่องหนึ่ง ตามหน่วย (D4) — ใช้ปิดปุ่ม −/+ ที่ขอบ */
export function limitsOf(f: SetField, unit: string): { min: number; max: number } {
  const R = SET_RANGES;
  switch (f) {
    case "weight":
      return unit === "lb" ? R.weight.lb : R.weight.kg;
    case "reps":
      return R.reps;
    case "duration":
      return R.durationS;
    case "distance":
      return unit === "mi" ? R.distance.mi : R.distance.km;
    case "speed":
      return unit === "mph" ? R.speed.mph : R.speed.kmh;
    case "incline":
      return R.inclinePct;
  }
}

/** จำนวนทศนิยมที่ช่องนี้รับ (ใช้กำหนดก้าวของ −/+ และการแสดง) */
export function decimalsOfField(f: SetField): number {
  switch (f) {
    case "weight":
    case "distance":
      return 2;
    case "speed":
    case "incline":
      return 1;
    default:
      return 0;
  }
}

export type FieldKey = "weight" | "weightPlus" | "weightAssist" | "reps" | "duration" | "distance" | "speed" | "incline";

/** คีย์ข้อความของหัวคอลัมน์ (น้ำหนักเปลี่ยนตามการใช้น้ำหนักตัว: "ตัว +" / "ช่วย −") */
export function fieldKey(f: SetField, load: LoadMode): FieldKey {
  if (f !== "weight") return f;
  return load === "bodyweight_plus" ? "weightPlus" : load === "assisted" ? "weightAssist" : "weight";
}

/** เลขเซ็ตที่แสดง: นับเฉพาะเซ็ตปกติ · วอร์มอัพ = "W" (D2) · key = id เซ็ต */
export function setLabels(sets: readonly DraftSet[]): Map<string, string> {
  const out = new Map<string, string>();
  let n = 0;
  for (const s of [...sets].sort((a, b) => a.position - b.position)) out.set(s.id, s.set_kind === "warmup" ? "W" : String(++n));
  return out;
}
