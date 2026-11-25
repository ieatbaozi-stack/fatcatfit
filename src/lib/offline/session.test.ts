import { describe, expect, it } from "vitest";
import { workoutSessionDataSchema, setRecordDataSchema, sessionExerciseDataSchema } from "@/lib/data/shared/workout";
import {
  addExercise,
  addSet,
  checkSet,
  discardSession,
  draftFromWire,
  dropRowsFromDraft,
  EMPTY_SET_VALUES,
  finishSession,
  newSessionDraft,
  parseDraft,
  removeExercise,
  resumeDecision,
  uncheckSet,
  updateSet,
  type ActiveSessionDraft,
} from "./session";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const H = 60 * 60 * 1000;
const at = (iso: string) => Date.parse(iso);

function bench(d: ActiveSessionDraft, now: number) {
  let c = addExercise(d, { id: U(10), exercise_id: U(99), exercise_name: "Bench press", exercise_name_th: "เบนช์เพรส", track_type: "weight_reps", load_mode: "external" }, now);
  c = addSet(c.draft!, U(10), { id: U(20), values: { ...EMPTY_SET_VALUES, weight_input: 20, weight_unit: "kg", reps: 10 } }, now);
  return c.draft!;
}

describe("ร่างเซสชัน → คิว (ADR 0004 ข้อ 6)", () => {
  it("เพิ่มท่า/แถวแนะนำ ไม่ส่งอะไร · ✓ แรกส่ง session → session_exercise → set ตามลำดับ (ผ่าน zod)", () => {
    const now = at("2026-11-24T10:00:00Z");
    const d0 = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now, timeZone: "Asia/Bangkok" });
    const d1 = bench(d0, now);
    const c = checkSet(d1, U(10), U(20), now + 60_000);
    expect(c.writes.map((w) => `${w.entity}:${w.action}`)).toEqual(["workout_session:upsert", "session_exercise:upsert", "set_record:upsert"]);
    expect(c.writes.every((w) => w.create)).toBe(true);
    expect(workoutSessionDataSchema.safeParse(c.writes[0].data).success).toBe(true);
    expect(sessionExerciseDataSchema.safeParse(c.writes[1].data).success).toBe(true);
    expect(setRecordDataSchema.safeParse(c.writes[2].data).success).toBe(true);
    expect(c.writes[2].display).toMatchObject({ exercise_name: "Bench press", track_type: "weight_reps" });
    // เซ็ตที่สอง: ส่งแค่เซ็ต
    const d2 = addSet(c.draft!, U(10), { id: U(21), values: { ...EMPTY_SET_VALUES, weight_input: 20, weight_unit: "kg", reps: 8 } }, now).draft!;
    expect(checkSet(d2, U(10), U(21), now).writes.map((w) => w.entity)).toEqual(["set_record"]);
  });

  it("แก้ค่าเซ็ตที่ติ๊กแล้ว = upsert ทั้งแถว · ยังไม่ติ๊ก = ไม่ส่ง", () => {
    const now = 0;
    const d = bench(newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now, timeZone: "UTC" }), now);
    expect(updateSet(d, U(10), U(20), { reps: 12 }, now).writes).toEqual([]);
    const c = checkSet(d, U(10), U(20), now);
    const u = updateSet(c.draft!, U(10), U(20), { reps: 12 }, now);
    expect(u.writes).toHaveLength(1);
    expect(u.writes[0].data).toMatchObject({ reps: 12, weight_input: 20, weight_unit: "kg", duration_s: null });
  });

  it("เอาติ๊กออก = delete เซ็ตนั้น · แถวกลับเป็นแนะนำด้วย id ใหม่", () => {
    const d = bench(newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: 0, timeZone: "UTC" }), 0);
    const c = checkSet(d, U(10), U(20), 0);
    const u = uncheckSet(c.draft!, U(10), U(20), U(30), 0);
    expect(u.writes).toEqual([expect.objectContaining({ entity: "set_record", id: U(20), action: "delete" })]);
    expect(u.draft!.exercises[0].sets[0]).toMatchObject({ id: U(30), completed_at: null, queued: false });
  });

  it("จบโดยไม่มีเซ็ต = ทิ้งในเครื่อง ไม่ส่ง · ทิ้งเซสชันที่ยังไม่ส่ง = ไม่ส่ง", () => {
    const d = bench(newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: 0, timeZone: "UTC" }), 0);
    expect(finishSession(d, 1000)).toEqual({ draft: null, writes: [] });
    expect(discardSession(d)).toEqual({ draft: null, writes: [] });
    const sent = checkSet(d, U(10), U(20), 0).draft!;
    expect(discardSession(sent).writes).toEqual([expect.objectContaining({ entity: "workout_session", action: "delete" })]);
  });

  it("จบ: ended_at ไม่เกิน started_at + 24 ชม. (ผ่าน CHECK)", () => {
    const now = at("2026-11-24T10:00:00Z");
    const d = checkSet(bench(newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now, timeZone: "UTC" }), now), U(10), U(20), now).draft!;
    const w = finishSession(d, now + 30 * H).writes[0];
    expect(w.data!.ended_at).toBe("2026-11-25T10:00:00.000Z");
    expect(workoutSessionDataSchema.safeParse(w.data).success).toBe(true);
  });

  it("ลบท่าที่ส่งแล้ว = delete session_exercise (เซิร์ฟเวอร์ลบเซ็ตให้) · ยังไม่ส่ง = ไม่ส่ง", () => {
    const d = bench(newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: 0, timeZone: "UTC" }), 0);
    expect(removeExercise(d, U(10), 0).writes).toEqual([]);
    const sent = checkSet(d, U(10), U(20), 0).draft!;
    expect(removeExercise(sent, U(10), 0).writes.map((w) => `${w.entity}:${w.action}`)).toEqual(["session_exercise:delete"]);
  });
});

describe("ข้ามเที่ยงคืน (เกณฑ์ 9 ส่วน unit · Asia/Bangkok)", () => {
  it("เริ่ม 23:50 · ✓ 00:20 · จบ 00:40 → local_date = วันที่เริ่ม ทุกครั้งที่ส่ง", () => {
    const start = at("2026-11-24T16:50:00Z"); // 23:50 เวลาไทย
    const d0 = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: start, timeZone: "Asia/Bangkok" });
    expect(d0.session.local_date).toBe("2026-11-24");
    const c = checkSet(bench(d0, start), U(10), U(20), start + 30 * 60_000);
    const f = finishSession(c.draft!, start + 50 * 60_000);
    for (const w of [c.writes[0], f.writes[0]]) {
      expect(w.data).toMatchObject({ local_date: "2026-11-24", time_zone: "Asia/Bangkok" });
      expect(workoutSessionDataSchema.safeParse(w.data).success).toBe(true);
    }
  });

  it("เปลี่ยน time zone ของเครื่องกลางเซสชันไม่เปลี่ยนวัน (ร่างเก็บค่าเดิม)", () => {
    const start = at("2026-11-24T16:50:00Z");
    const d = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: start, timeZone: "Asia/Bangkok" });
    const c = checkSet(bench(d, start), U(10), U(20), start + 3 * H);
    expect(c.writes[0].data).toMatchObject({ local_date: "2026-11-24", time_zone: "Asia/Bangkok" });
  });
});

describe("กลับมาทำต่อ D5 (เกณฑ์ 13 ส่วน unit)", () => {
  const start = at("2026-11-24T10:00:00Z");
  const withSet = (setAt: number) => checkSet(bench(newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: start, timeZone: "UTC" }), start), U(10), U(20), setAt).draft!;

  it("≤ 3 ชม. หลังเซ็ตสุดท้าย → resume", () => {
    expect(resumeDecision(withSet(start + H), start + 4 * H)).toEqual({ kind: "resume" });
  });

  it("> 3 ชม. → ask พร้อมเวลาเซ็ตสุดท้าย", () => {
    expect(resumeDecision(withSet(start + H), start + 4 * H + 1)).toEqual({ kind: "ask", endAt: start + H });
  });

  it("> 24 ชม. → auto_end ที่ min(เซ็ตสุดท้าย, started_at + 24 ชม.)", () => {
    expect(resumeDecision(withSet(start + H), start + 25 * H)).toEqual({ kind: "auto_end", endAt: start + H });
  });

  it("> 24 ชม. ไม่มีเซ็ต → auto_end endAt null (ทิ้งเงียบ)", () => {
    const d = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: start, timeZone: "UTC" });
    expect(resumeDecision(d, start + 25 * H)).toEqual({ kind: "auto_end", endAt: null });
  });

  it("เซสชันค้างจากอีกเครื่อง → ร่างที่ถือว่าส่งแล้ว (✓ ต่อส่งแค่เซ็ต)", () => {
    const ws = {
      id: U(1),
      place_id: U(2),
      place_name: "ยิม",
      started_at: "2026-11-24T10:00:00.000Z",
      ended_at: null,
      local_date: "2026-11-24",
      time_zone: "UTC",
      template_id: null,
      created_at: "",
      updated_at: "",
      client_updated_at: "",
      exercises: [
        { id: U(10), session_id: U(1), exercise_id: U(99), position: 0, exercise_name: "Bench", exercise_name_th: null, track_type: "weight_reps", load_mode: "external", created_at: "", updated_at: "", client_updated_at: "", sets: [] },
      ],
    };
    const d = draftFromWire(ws as never, start);
    const c = addSet(d, U(10), { id: U(40), values: { ...EMPTY_SET_VALUES, weight_input: 30, weight_unit: "kg", reps: 5 } }, start).draft!;
    expect(checkSet(c, U(10), U(40), start).writes.map((w) => w.entity)).toEqual(["set_record"]);
  });
});

describe("อื่นๆ", () => {
  it("ทิ้งรายการที่ส่งไม่ผ่าน → เอาแถวออกจากร่าง · ทิ้งเซสชัน = ร่างหาย", () => {
    const d = checkSet(bench(newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: 0, timeZone: "UTC" }), 0), U(10), U(20), 0).draft!;
    expect(dropRowsFromDraft(d, [{ entity: "set_record", id: U(20) }])!.exercises[0].sets).toEqual([]);
    expect(dropRowsFromDraft(d, [{ entity: "workout_session", id: U(1) }])).toBeNull();
  });

  it("parseDraft: รุ่นไม่รู้จัก/รูปเสีย = null · round-trip JSON ได้", () => {
    const d = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: 0, timeZone: "UTC" });
    expect(parseDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(parseDraft({ v: 2 })).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
});
