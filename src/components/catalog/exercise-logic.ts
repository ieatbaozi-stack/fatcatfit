// ตรรกะบริสุทธิ์ของจอท่าออกกำลังกาย (R2) — ไม่มี React/DOM เพื่อเทสต์ได้ตรงๆ

import { CATEGORIES, EXERCISE_LIMITS, TRACK_TYPES, loadModeAllowed, type Category, type LoadMode, type TrackType } from "@/lib/data/shared/exercise-meta";
import type { CatalogExercise, WireExercise } from "@/lib/data/shared/sync";

export type Locale = "th" | "en";

/** แถวที่จอค้นใช้: คลังกลาง (owner null) + ท่าของฉัน */
export type ExerciseRow = (CatalogExercise | WireExercise) & { owner_user_id: string | null };

export const isMine = (e: Pick<ExerciseRow, "owner_user_id">): boolean => e.owner_user_id !== null;

/**
 * ชื่อที่แสดงตาม D3 (UX 12.5)
 * - ไทย · คลัง: บรรทัด 1 = name_th บรรทัด 2 = name (ไม่มี name_th = name บรรทัดเดียว)
 * - อังกฤษ · คลัง: name อย่างเดียว
 * - ท่าของฉัน: ชื่อที่ผู้ใช้พิมพ์ (ไม่แปล) · บรรทัด 2 เป็น "ของฉัน · หมวด · ชนิด" (component เติมข้อความ)
 */
export function displayNames(e: Pick<ExerciseRow, "name" | "name_th" | "owner_user_id">, locale: Locale): { primary: string; secondary: "english" | "mine" | null; english: string } {
  if (isMine(e)) return { primary: e.name, secondary: "mine", english: e.name };
  if (locale === "th" && e.name_th && e.name_th.trim() !== "") return { primary: e.name_th, secondary: "english", english: e.name };
  return { primary: e.name, secondary: null, english: e.name };
}

const collators: Record<Locale, Intl.Collator> = {
  th: new Intl.Collator("th", { sensitivity: "base", numeric: true }),
  en: new Intl.Collator("en", { sensitivity: "base", numeric: true }),
};

/** เรียงตามชื่อที่แสดง (โหมดไทย = name_th · อังกฤษ = name) */
export function compareByDisplay(a: ExerciseRow, b: ExerciseRow, locale: Locale): number {
  return collators[locale].compare(displayNames(a, locale).primary, displayNames(b, locale).primary) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** ท่าเรียงของหมวดเดียว (ไม่มีคำค้น): ท่าของฉันก่อน แล้วท่าคลัง — ภายในกลุ่มตามตัวอักษรของชื่อที่แสดง */
export function sortForBrowse<T extends ExerciseRow>(items: readonly T[], locale: Locale): T[] {
  return [...items].sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || compareByDisplay(a, b, locale));
}

/** ตัดช่องว่างหัวท้าย + ไม่เกิน 60 ตัว (คำที่ส่งต่อไปฟอร์ม) */
export function clampName(text: string): string {
  return Array.from(text.trim()).slice(0, EXERCISE_LIMITS.nameMax).join("");
}

export const PAGE_SIZE = 50;

// ---- ฟอร์ม ----

export type FormValues = {
  name: string;
  category: Category | null;
  track: TrackType | null;
  loadMode: LoadMode;
  unilateral: boolean;
  equipment: string | null;
};

export const EMPTY_FORM: FormValues = { name: "", category: null, track: null, loadMode: "external", unilateral: false, equipment: null };

/** ชนิดที่แสดงสวิตช์ "จดข้างละ" (ระยะ+เวลา กับลู่วิ่งซ่อนและส่ง false — ตรงกับ zod ฝั่งเซิร์ฟเวอร์) */
export const UNILATERAL_TRACKS: readonly TrackType[] = ["weight_reps", "reps_only", "duration", "weight_duration"];
export const showsUnilateral = (t: TrackType | null): boolean => t !== null && UNILATERAL_TRACKS.includes(t);
export const showsLoadMode = (t: TrackType | null): boolean => t === "weight_reps";

/** เปลี่ยนชนิดการจด: ล้างค่าที่ใช้ไม่ได้กับชนิดใหม่ (load_mode กลับเป็น external · ข้างละ = false ถ้าชนิดไม่รองรับ) */
export function withTrack(v: FormValues, track: TrackType): FormValues {
  return {
    ...v,
    track,
    loadMode: loadModeAllowed(track, v.loadMode) ? v.loadMode : "external",
    unilateral: showsUnilateral(track) ? v.unilateral : false,
  };
}

export function valuesOf(e: WireExercise): FormValues {
  return {
    name: e.name,
    category: (CATEGORIES as readonly string[]).includes(e.category) ? (e.category as Category) : null,
    track: (TRACK_TYPES as readonly string[]).includes(e.track_type) ? (e.track_type as TrackType) : null,
    loadMode: e.load_mode as LoadMode,
    unilateral: e.is_unilateral,
    equipment: e.equipment,
  };
}

export const normalizeName = (s: string): string => s.trim().normalize("NFC").toLowerCase();

export function isFormValid(v: FormValues): boolean {
  const len = Array.from(v.name.trim()).length;
  return len >= 1 && len <= EXERCISE_LIMITS.nameMax && v.category !== null && v.track !== null;
}

export function isDirty(a: FormValues, b: FormValues): boolean {
  return (
    a.name.trim() !== b.name.trim() ||
    a.category !== b.category ||
    a.track !== b.track ||
    a.loadMode !== b.loadMode ||
    a.unilateral !== b.unilateral ||
    a.equipment !== b.equipment
  );
}

/** ชื่อซ้ำกับท่าของฉันอื่น (ไม่สนตัวพิมพ์ · นับในกรุ · ไม่นับตัวเอง) — เตือนไม่บล็อก */
export function hasDuplicateName(name: string, mine: readonly Pick<WireExercise, "id" | "name">[], selfId: string | null): boolean {
  const n = normalizeName(name);
  if (n === "") return false;
  return mine.some((e) => e.id !== selfId && normalizeName(e.name) === n);
}

/** data ของ push exercise (ช่องที่ไคลเอนต์ตั้งได้เท่านั้น) · ค่าต้องผ่าน isFormValid ก่อน */
export function toPushData(v: FormValues): Record<string, unknown> {
  if (!v.track || !v.category) throw new Error("form incomplete");
  return {
    name: v.name.trim(),
    track_type: v.track,
    load_mode: showsLoadMode(v.track) ? v.loadMode : "external",
    is_unilateral: showsUnilateral(v.track) ? v.unilateral : false,
    category: v.category,
    equipment: v.equipment,
  };
}

/** แถวท่าของฉันที่ประกอบในเครื่องหลังเซิร์ฟเวอร์ตอบ applied (ใช้อัปเดตจอทันที · แล้วถาม bootstrap ใหม่เงียบๆ) */
export function buildExerciseRow(args: { id: string; ownerId: string; values: FormValues; archivedAt: string | null; base: WireExercise | null; now: string }): WireExercise {
  const d = toPushData(args.values) as { name: string; track_type: string; load_mode: string; is_unilateral: boolean; category: string; equipment: string | null };
  return {
    id: args.id,
    owner_user_id: args.base?.owner_user_id ?? args.ownerId,
    name: d.name,
    name_th: null,
    search_terms: null,
    track_type: d.track_type,
    load_mode: d.load_mode,
    is_unilateral: d.is_unilateral,
    category: d.category,
    equipment: d.equipment,
    source_dataset: null,
    source_ref: null,
    license: null,
    attribution: null,
    met: null,
    archived_at: args.archivedAt,
    created_at: args.base?.created_at ?? args.now,
    updated_at: args.now,
    client_updated_at: args.now,
  };
}
