// ค่าคงที่ของท่าออกกำลังกาย (R2 · contract D8/D9 · ADR 0003 ข้อ 2) — ที่เดียว
// ใช้ร่วม zod, CHECK ใน schema, สคริปต์ตรวจคลัง และ UI · แก้ค่าในรายการต้องมี migration (CHECK)

/** ชนิดการจด 6 แบบ (ADR 0003 ข้อ 2) */
export const TRACK_TYPES = [
  "weight_reps",
  "reps_only",
  "duration",
  "distance_duration",
  "weight_duration",
  "incline_speed_duration",
] as const;
export type TrackType = (typeof TRACK_TYPES)[number];

/** `external` = น้ำหนักที่ยก · `bodyweight_plus` = น้ำหนักตัว + เพิ่ม · `assisted` = เครื่องช่วยผ่อน — ไม่ใช่ external ได้เฉพาะ weight_reps */
export const LOAD_MODES = ["external", "bodyweight_plus", "assisted"] as const;
export type LoadMode = (typeof LOAD_MODES)[number];

/** หมวด 11 ชิป (D9) — ลำดับนี้คือลำดับชิปในจอค้น */
export const CATEGORIES = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "core",
  "full_body",
  "cardio",
  "sport",
  "mobility",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** อุปกรณ์ (D9) — ไม่ระบุ = null (ไม่มีค่า "unspecified") */
export const EQUIPMENT = ["barbell", "dumbbell", "kettlebell", "machine", "cable", "band", "bodyweight", "other"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_LIMITS = {
  /** ชื่อท่า / ชื่อไทย / ชื่อสถานที่ (ตัวอักษร) */
  nameMax: 60,
  /** ท่าของฉันต่อคน (D8) — นับเฉพาะแถวที่ใช้งานอยู่ (ไม่ลบ ไม่เก็บเข้ากรุ) */
  maxMyExercises: 300,
  /** สถานที่ต่อคน (D7) — นับเฉพาะแถวที่ใช้งานอยู่ (ไม่ลบ ไม่เก็บเข้ากรุ) */
  maxPlaces: 30,
  /** เพดานที่สองกันสแปมแถว: นับทุกแถวที่ผู้ใช้เป็นเจ้าของ รวมเก็บเข้ากรุและ tombstone (security M2) */
  maxMyExercisesTotal: 2000,
  maxPlacesTotal: 200,
} as const;

/** id ของท่าคลังกลางเป็น UUID v5 จาก namespace ตายตัว (ไคลเอนต์ push ไม่ได้ — push รับเฉพาะ v4) · R3: exercise_id ที่อ้างคลังใช้ตัวนี้ตรวจ */
export const CATALOG_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isCatalogId = (v: unknown): v is string => typeof v === "string" && CATALOG_ID_REGEX.test(v);

/** ตัดอักขระควบคุม (\p{Cc}) และตัวควบคุมทิศทางข้อความ U+202A–202E, U+2066–2069 ออกจากชื่อที่ผู้ใช้พิมพ์ (security L2) */
const ch = (code: number) => String.fromCharCode(code);
const CONTROL_CHARS = new RegExp(`[\\p{Cc}${ch(0x202a)}-${ch(0x202e)}${ch(0x2066)}-${ch(0x2069)}]`, "gu");
export const stripControlChars = (s: string): string => s.replace(CONTROL_CHARS, "");

/** คำค้นของแถวคลังคั่นด้วยตัวนี้ในคอลัมน์ `search_terms` (ADR 0003: ไม่ใช้ JSON) */
export const SEARCH_TERMS_SEPARATOR = "|";

/** ค่าที่ใช้ใน CHECK เป็น `'a', 'b'` */
export const sqlList = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(", ");

export const isTrackType = (v: unknown): v is TrackType => (TRACK_TYPES as readonly unknown[]).includes(v);
export const isLoadMode = (v: unknown): v is LoadMode => (LOAD_MODES as readonly unknown[]).includes(v);
export const isCategory = (v: unknown): v is Category => (CATEGORIES as readonly unknown[]).includes(v);
export const isEquipment = (v: unknown): v is Equipment => (EQUIPMENT as readonly unknown[]).includes(v);

/** load_mode ที่ไม่ใช่ external ได้เฉพาะ weight_reps (CHECK + zod ใช้กติกาเดียวกัน) */
export function loadModeAllowed(trackType: TrackType, loadMode: LoadMode): boolean {
  return loadMode === "external" || trackType === "weight_reps";
}
