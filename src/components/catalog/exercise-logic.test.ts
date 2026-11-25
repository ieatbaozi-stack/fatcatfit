import { describe, expect, it } from "vitest";
import { exerciseDataSchema } from "@/lib/data/shared/sync";
import {
  EMPTY_FORM,
  clampName,
  displayNames,
  exerciseHasHistory,
  hasDuplicateName,
  isDirty,
  isFormValid,
  showsLoadMode,
  showsUnilateral,
  sortForBrowse,
  toPushData,
  withTrack,
  type ExerciseRow,
} from "./exercise-logic";

const lib = (over: Partial<ExerciseRow> = {}): ExerciseRow =>
  ({
    id: "l1",
    owner_user_id: null,
    name: "Barbell Bench Press",
    name_th: "บาร์เบลเบนช์เพรส",
    search_terms: null,
    track_type: "weight_reps",
    load_mode: "external",
    is_unilateral: false,
    category: "chest",
    equipment: "barbell",
    source_dataset: "x",
    source_ref: null,
    license: "x",
    attribution: "x",
    met: null,
    archived_at: null,
    ...over,
  }) as ExerciseRow;

describe("displayNames (D3)", () => {
  it("โหมดไทย: ท่าคลัง = ชื่อไทยบน อังกฤษใต้", () => {
    expect(displayNames(lib(), "th")).toEqual({ primary: "บาร์เบลเบนช์เพรส", secondary: "english", english: "Barbell Bench Press" });
  });
  it("โหมดอังกฤษ: ท่าคลัง = อังกฤษอย่างเดียว", () => {
    expect(displayNames(lib(), "en")).toEqual({ primary: "Barbell Bench Press", secondary: null, english: "Barbell Bench Press" });
  });
  it("name_th ว่าง = แสดง name บรรทัดเดียว", () => {
    expect(displayNames(lib({ name_th: null }), "th").secondary).toBeNull();
    expect(displayNames(lib({ name_th: "  " }), "th").primary).toBe("Barbell Bench Press");
  });
  it("ท่าของฉัน: ชื่อที่พิมพ์ไม่แปล + บรรทัดรอง mine ทั้งสองภาษา", () => {
    const mine = lib({ owner_user_id: "u1", name: "ท่าของฉัน", name_th: null });
    expect(displayNames(mine, "th")).toMatchObject({ primary: "ท่าของฉัน", secondary: "mine" });
    expect(displayNames(mine, "en")).toMatchObject({ primary: "ท่าของฉัน", secondary: "mine" });
  });
});

describe("sortForBrowse", () => {
  it("ท่าของฉันก่อน แล้วท่าคลังตามตัวอักษรของชื่อที่แสดง", () => {
    const a = lib({ id: "a", name: "Zeta", name_th: "ก" });
    const b = lib({ id: "b", name: "Alpha", name_th: "ข" });
    const m = lib({ id: "m", owner_user_id: "u", name: "ไว้ก่อน", name_th: null });
    expect(sortForBrowse([a, b, m], "th").map((e) => e.id)).toEqual(["m", "a", "b"]);
    expect(sortForBrowse([a, b, m], "en").map((e) => e.id)).toEqual(["m", "b", "a"]);
  });
});

describe("clampName", () => {
  it("ตัดช่องว่างหัวท้าย และไม่เกิน 60 ตัว", () => {
    expect(clampName("  bench  ")).toBe("bench");
    expect(Array.from(clampName("ก".repeat(80))).length).toBe(60);
  });
});

describe("ฟอร์ม", () => {
  it("เปลี่ยนชนิดการจด: ล้างค่าที่ใช้ไม่ได้", () => {
    const v = { ...EMPTY_FORM, track: "weight_reps" as const, loadMode: "assisted" as const, unilateral: true };
    expect(withTrack(v, "weight_reps")).toMatchObject({ loadMode: "assisted", unilateral: true });
    expect(withTrack(v, "reps_only")).toMatchObject({ loadMode: "external", unilateral: true });
    expect(withTrack(v, "distance_duration")).toMatchObject({ loadMode: "external", unilateral: false });
    expect(withTrack(v, "incline_speed_duration").unilateral).toBe(false);
  });
  it("สวิตช์ข้างละ: 4 ชนิด · ตัวเลือกน้ำหนักตัว: weight_reps เท่านั้น", () => {
    for (const t of ["weight_reps", "reps_only", "duration", "weight_duration"] as const) expect(showsUnilateral(t)).toBe(true);
    expect(showsUnilateral("distance_duration")).toBe(false);
    expect(showsUnilateral("incline_speed_duration")).toBe(false);
    expect(showsUnilateral(null)).toBe(false);
    expect(showsLoadMode("weight_reps")).toBe(true);
    expect(showsLoadMode("duration")).toBe(false);
  });
  it("บันทึกได้เมื่อมีชื่อ + หมวด + ชนิดการจด", () => {
    expect(isFormValid(EMPTY_FORM)).toBe(false);
    expect(isFormValid({ ...EMPTY_FORM, name: "x", category: "arms" })).toBe(false);
    expect(isFormValid({ ...EMPTY_FORM, name: "  ", category: "arms", track: "duration" })).toBe(false);
    expect(isFormValid({ ...EMPTY_FORM, name: "x", category: "arms", track: "duration" })).toBe(true);
    expect(isFormValid({ ...EMPTY_FORM, name: "ก".repeat(61), category: "arms", track: "duration" })).toBe(false);
  });
  it("data ของ push ผ่าน zod ของเซิร์ฟเวอร์ และไม่มีช่องต้องห้าม", () => {
    for (const track of ["weight_reps", "reps_only", "duration", "distance_duration", "weight_duration", "incline_speed_duration"] as const) {
      const data = toPushData(withTrack({ ...EMPTY_FORM, name: " สควอท ", category: "legs", unilateral: true, loadMode: "assisted", equipment: "barbell" }, track));
      expect(exerciseDataSchema.safeParse(data).success, track).toBe(true);
      expect(Object.keys(data).sort()).toEqual(["category", "equipment", "is_unilateral", "load_mode", "name", "track_type"]);
      expect(data.name).toBe("สควอท");
    }
  });
  it("weight_reps เก็บ load_mode ที่เลือก", () => {
    const data = toPushData({ ...EMPTY_FORM, name: "ดึงข้อ", category: "back", track: "weight_reps", loadMode: "bodyweight_plus" });
    expect(data.load_mode).toBe("bodyweight_plus");
  });
  it("toPushData ล้มถ้าฟอร์มไม่ครบ", () => {
    expect(() => toPushData(EMPTY_FORM)).toThrow();
  });
  it("isDirty เทียบหลังตัดช่องว่าง", () => {
    const a = { ...EMPTY_FORM, name: "a" };
    expect(isDirty(a, { ...a, name: " a " })).toBe(false);
    expect(isDirty(a, { ...a, equipment: "band" })).toBe(true);
  });
  it("ชื่อซ้ำ: ไม่สนตัวพิมพ์ นับในกรุ ไม่นับตัวเอง", () => {
    const mine = [
      { id: "1", name: "Plank" },
      { id: "2", name: "ท่า" },
    ];
    expect(hasDuplicateName(" plank ", mine, null)).toBe(true);
    expect(hasDuplicateName("plank", mine, "1")).toBe(false);
    expect(hasDuplicateName("", mine, null)).toBe(false);
  });
  it("exerciseHasHistory: has_history · เซ็ตที่ติ๊กในร่าง · เซ็ตที่ค้างในคิว (ท่าที่ยังไม่มีเซ็ตติ๊ก = ยังไม่มีประวัติ)", () => {
    const none = { ops: [], activeSession: null };
    expect(exerciseHasHistory({ id: "e1", has_history: true }, none)).toBe(true);
    expect(exerciseHasHistory({ id: "e1", has_history: false }, none)).toBe(false);
    const draft = (completed: string | null) =>
      ({ exercises: [{ exercise_id: "e1", sets: [{ completed_at: completed }] }] }) as unknown as NonNullable<Parameters<typeof exerciseHasHistory>[1]["activeSession"]>;
    expect(exerciseHasHistory({ id: "e1" }, { ops: [], activeSession: draft("2026-01-01T00:00:00.000Z") })).toBe(true);
    expect(exerciseHasHistory({ id: "e1" }, { ops: [], activeSession: draft(null) })).toBe(false);
    const op = (action: "upsert" | "delete") => ({ entity: "set_record", action, display: { exercise_id: "e1" } }) as never;
    expect(exerciseHasHistory({ id: "e1" }, { ops: [op("upsert")], activeSession: null })).toBe(true);
    expect(exerciseHasHistory({ id: "e1" }, { ops: [op("delete")], activeSession: null })).toBe(false);
    expect(exerciseHasHistory({ id: "e2" }, { ops: [op("upsert")], activeSession: null })).toBe(false);
  });
});
