import type { LoadMode, TrackType } from "../data/shared/exercise-meta";
import type { ExerciseBests } from "../data/shared/workout";

// สถิติ (PR) — คำนวณจากข้อมูล ไม่เก็บเป็นแฟลก (ADR 0003 ข้อ 4 · contract R3 D3) · ฟังก์ชันบริสุทธิ์ ใช้ร่วมไคลเอนต์/เซิร์ฟเวอร์
// - ผู้เรียกกรองเซ็ต/เซสชันที่ลบแล้ว และเซ็ตที่สำเนา track_type/load_mode ไม่ตรงท่าปัจจุบันออกก่อน · ฟังก์ชันนี้ข้ามเซ็ตวอร์มอัพให้เอง
// - ต้อง "มากกว่า" ของเดิมเท่านั้น (เท่ากันไม่นับ · epsilon 1e-6) · ไม่มีเซ็ตเดิมให้เทียบ = ไม่ชนะ
// - ปริมาณรวมต่อเซสชันไม่ฉลอง (ไปอยู่ในกราฟ R5)

export type StatKind = { track_type: TrackType; load_mode: LoadMode };

/** เซ็ตที่สถิติต้องใช้ (ตัวเลขเป็นค่ามาตรฐาน kg / เมตร / วินาที) */
export type StatSet = {
  id: string;
  completed_at: string;
  position: number;
  set_kind: "normal" | "warmup";
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  incline_pct: number | null;
};

export type RecordMetric =
  | "max_weight"
  | "reps_at_weight"
  | "max_reps"
  | "max_extra_weight"
  | "min_assist"
  | "max_duration"
  | "duration_at_weight"
  | "max_distance"
  | "best_pace"
  | "duration_at_incline";

/** เพซนับเฉพาะเซ็ตที่ระยะตั้งแต่ 1 km (D3) */
export const PACE_MIN_DISTANCE_M = 1000;
const EPS = 1e-6;

export const emptyBests = (): ExerciseBests => ({
  max_weight_kg: null,
  max_reps: null,
  reps_at_weight: [],
  max_extra_weight_kg: null,
  min_assist_kg: null,
  max_duration_s: null,
  duration_at_weight: [],
  max_distance_m: null,
  best_pace_s_per_km: null,
  duration_at_incline: [],
});

/** ลำดับเซ็ตในเซสชัน: position → completed_at → id (ADR 0003 ข้อ 3.2) */
export const bySetOrder = (a: Pick<StatSet, "id" | "completed_at" | "position">, b: Pick<StatSet, "id" | "completed_at" | "position">) =>
  a.position - b.position || (a.completed_at < b.completed_at ? -1 : a.completed_at > b.completed_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const gt = (v: number | null, prior: number | null) => v !== null && prior !== null && v > prior + EPS;
const lt = (v: number | null, prior: number | null) => v !== null && prior !== null && v < prior - EPS;
const maxOf = (a: number | null, b: number | null) => (b === null ? a : a === null || b > a ? b : a);
const minOf = (a: number | null, b: number | null) => (b === null ? a : a === null || b < a ? b : a);
/** วินาทีต่อ km */
const paceOf = (s: StatSet): number | null =>
  s.distance_m !== null && s.distance_m >= PACE_MIN_DISTANCE_M && s.duration_s !== null && s.duration_s > 0
    ? s.duration_s / (s.distance_m / 1000)
    : null;

// ---- frontier ของ (y, x): "x มากสุดที่ y ≥ เดิม" (dir "ge") หรือ "y ≤ เดิม" (dir "le" · ช่วยน้อยกว่าดีกว่า) ----
type Pt = { y: number; x: number };
type Dir = "ge" | "le";
/** y′ เทียบกับ y ได้ (y′ ≥ y สำหรับ ge · y′ ≤ y สำหรับ le) */
const comparable = (dir: Dir, y: number, y2: number) => (dir === "ge" ? y2 >= y - EPS : y2 <= y + EPS);
function beatsFrontier(dir: Dir, f: readonly Pt[], y: number | null, x: number | null): boolean {
  if (y === null || x === null) return false;
  const cmp = f.filter((p) => comparable(dir, y, p.y));
  return cmp.length > 0 && x > Math.max(...cmp.map((p) => p.x)) + EPS;
}
/** เพิ่มจุดแล้วตัดจุดที่ถูกข่ม (มีจุดอื่นที่ y ดีกว่าหรือเท่ากัน และ x มากกว่าหรือเท่ากัน) */
function addToFrontier(dir: Dir, f: readonly Pt[], y: number, x: number): Pt[] {
  const all = [...f, { y, x }];
  const dominated = (p: Pt, i: number) =>
    all.some((q, j) => {
      if (i === j) return false;
      const yOk = dir === "ge" ? q.y >= p.y - EPS : q.y <= p.y + EPS;
      const same = Math.abs(q.y - p.y) < EPS && Math.abs(q.x - p.x) < EPS;
      return yOk && q.x >= p.x - EPS && (!same || j < i);
    });
  return all.filter((p, i) => !dominated(p, i)).sort((a, b) => a.y - b.y);
}
const toPts = <T>(arr: readonly T[], y: (t: T) => number, x: (t: T) => number): Pt[] => arr.map((t) => ({ y: y(t), x: x(t) }));
const repsPts = (b: ExerciseBests) => toPts(b.reps_at_weight, (e) => e.weight_kg, (e) => e.reps);
const durWPts = (b: ExerciseBests) => toPts(b.duration_at_weight, (e) => e.weight_kg, (e) => e.duration_s);
const durIPts = (b: ExerciseBests) => toPts(b.duration_at_incline, (e) => e.incline_pct, (e) => e.duration_s);

/** น้ำหนักของเซ็ตสำหรับ frontier: bodyweight_plus ที่ไม่ใส่น้ำหนักถ่วง = 0 */
const loadOf = (k: StatKind, s: StatSet) => (k.load_mode === "bodyweight_plus" ? (s.weight_kg ?? 0) : s.weight_kg);

/** เซ็ตนี้ชนะตัววัดไหนบ้าง เทียบกับ `prior` (ไม่รวมเซ็ตนี้) · วอร์มอัพไม่ชนะอะไร */
export function recordsFor(kind: StatKind, prior: ExerciseBests, s: StatSet): RecordMetric[] {
  if (s.set_kind === "warmup") return [];
  const out: RecordMetric[] = [];
  switch (kind.track_type) {
    case "weight_reps": {
      const w = loadOf(kind, s);
      if (kind.load_mode === "external") {
        if (gt(s.weight_kg, prior.max_weight_kg)) out.push("max_weight");
      } else if (kind.load_mode === "bodyweight_plus") {
        // น้ำหนักถ่วงสูงสุดต้อง > 0
        if (w !== null && w > 0 && gt(w, prior.max_extra_weight_kg)) out.push("max_extra_weight");
      } else if (lt(s.weight_kg, prior.min_assist_kg)) out.push("min_assist");
      if (beatsFrontier(kind.load_mode === "assisted" ? "le" : "ge", repsPts(prior), w, s.reps)) out.push("reps_at_weight");
      break;
    }
    case "reps_only":
      if (gt(s.reps, prior.max_reps)) out.push("max_reps");
      break;
    case "duration":
      if (gt(s.duration_s, prior.max_duration_s)) out.push("max_duration");
      break;
    case "weight_duration":
      if (gt(s.weight_kg, prior.max_weight_kg)) out.push("max_weight");
      if (beatsFrontier("ge", durWPts(prior), s.weight_kg, s.duration_s)) out.push("duration_at_weight");
      break;
    case "distance_duration":
      if (gt(s.distance_m, prior.max_distance_m)) out.push("max_distance");
      if (gt(s.duration_s, prior.max_duration_s)) out.push("max_duration");
      if (lt(paceOf(s), prior.best_pace_s_per_km)) out.push("best_pace");
      break;
    case "incline_speed_duration":
      if (beatsFrontier("ge", durIPts(prior), s.incline_pct, s.duration_s)) out.push("duration_at_incline");
      break;
  }
  return out;
}

/** เพิ่มเซ็ตเข้าสถิติ (คืนอ็อบเจ็กต์ใหม่ · ไม่แก้ของเดิม) · วอร์มอัพไม่นับ */
export function addSetToBests(kind: StatKind, b: ExerciseBests, s: StatSet): ExerciseBests {
  if (s.set_kind === "warmup") return b;
  const n: ExerciseBests = { ...b };
  const fromPts = <T>(dir: Dir, pts: Pt[], y: number | null, x: number | null, mk: (y: number, x: number) => T, cur: T[]): T[] =>
    y === null || x === null ? cur : addToFrontier(dir, pts, y, x).map((p) => mk(p.y, p.x));
  switch (kind.track_type) {
    case "weight_reps": {
      const w = loadOf(kind, s);
      if (kind.load_mode === "external") n.max_weight_kg = maxOf(n.max_weight_kg, s.weight_kg);
      else if (kind.load_mode === "bodyweight_plus") n.max_extra_weight_kg = maxOf(n.max_extra_weight_kg, w);
      else n.min_assist_kg = minOf(n.min_assist_kg, s.weight_kg);
      n.reps_at_weight = fromPts(kind.load_mode === "assisted" ? "le" : "ge", repsPts(b), w, s.reps, (y, x) => ({ weight_kg: y, reps: x }), b.reps_at_weight);
      break;
    }
    case "reps_only":
      n.max_reps = maxOf(n.max_reps, s.reps);
      break;
    case "duration":
      n.max_duration_s = maxOf(n.max_duration_s, s.duration_s);
      break;
    case "weight_duration":
      n.max_weight_kg = maxOf(n.max_weight_kg, s.weight_kg);
      n.duration_at_weight = fromPts("ge", durWPts(b), s.weight_kg, s.duration_s, (y, x) => ({ weight_kg: y, duration_s: x }), b.duration_at_weight);
      break;
    case "distance_duration":
      n.max_distance_m = maxOf(n.max_distance_m, s.distance_m);
      n.max_duration_s = maxOf(n.max_duration_s, s.duration_s);
      n.best_pace_s_per_km = minOf(n.best_pace_s_per_km, paceOf(s));
      break;
    case "incline_speed_duration":
      n.duration_at_incline = fromPts("ge", durIPts(b), s.incline_pct, s.duration_s, (y, x) => ({ incline_pct: y, duration_s: x }), b.duration_at_incline);
      break;
  }
  return n;
}

/** สถิติดีสุดของท่า จากเซ็ตทั้งหมด (ลำดับไม่สำคัญ) */
export function computeBests(kind: StatKind, sets: readonly StatSet[]): ExerciseBests {
  return sets.reduce((b, s) => addSetToBests(kind, b, s), emptyBests());
}

export type SetEvaluation = { set: StatSet; records: RecordMetric[]; celebrate: boolean };

/**
 * ประเมินเซ็ตของท่าหนึ่งในเซสชันหนึ่ง (เรียงตาม position, completed_at, id)
 * - `history` = เซ็ตของท่าเดียวกันจากเซสชันก่อนหน้า (ที่ไม่ลบ) · ไม่มีเซ็ต normal เลย = ครั้งแรกที่ทำท่านี้ → ไม่ฉลองและไม่มีดาวทั้งเซสชัน
 * - แต่ละเซ็ตเทียบกับ history + เซ็ตก่อนหน้าในเซสชัน · `records` ไม่ว่าง = ได้ดาว · `celebrate` จริงไม่เกิน 1 เซ็ตต่อท่าต่อเซสชัน (เซ็ตแรกที่ชนะ)
 */
export function evaluateSession(kind: StatKind, history: readonly StatSet[], sessionSets: readonly StatSet[]): SetEvaluation[] {
  const hasHistory = history.some((s) => s.set_kind !== "warmup");
  let bests = computeBests(kind, history);
  let celebrated = false;
  return [...sessionSets].sort(bySetOrder).map((set) => {
    const records = hasHistory ? recordsFor(kind, bests, set) : [];
    bests = addSetToBests(kind, bests, set);
    const celebrate = records.length > 0 && !celebrated;
    if (celebrate) celebrated = true;
    return { set, records, celebrate };
  });
}
