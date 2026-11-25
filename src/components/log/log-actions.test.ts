// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySessionChange, getLocalView } from "@/lib/offline/client";
import { newSessionDraft, type DraftExercise } from "@/lib/offline/session";
import type { ExerciseSummary, WireSet } from "@/lib/data/shared/workout";
import { closeTestOffline, openTestOffline } from "../test-offline";
import { adjustRestTimer, deleteSet, dropExercise, playStopwatch, restoreSet, retickSet, setKind, skipRest, stopStopwatchAndTick, tickSet, untickSet, updateValues, type ActionCtx } from "./log-actions";
import { addExerciseChange, buildSummary, changePlace, mutateSession, recentExercises, startSession, totalCompleted } from "./session-logic";
import { DEFAULT_UNITS } from "./set-logic";

const PLACE = { id: "11111111-1111-4111-8111-111111111111", name: "Gym" };
const BENCH = "55555555-5555-5555-8555-555555555555";
const PLANK = "66666666-6666-5666-8666-666666666666";
const RUN = "77777777-7777-5777-8777-777777777777";
const T0 = Date.parse("2026-11-24T10:00:00.000Z");

const lastSet = (over: Partial<WireSet>): WireSet => ({
  id: "w",
  session_exercise_id: "x",
  position: 0,
  set_kind: "normal",
  completed_at: "2026-11-20T10:00:00.000Z",
  weight_kg: null,
  weight_input: null,
  weight_unit: null,
  reps: null,
  duration_s: null,
  distance_m: null,
  distance_input: null,
  distance_unit: null,
  speed_mps: null,
  speed_input: null,
  speed_unit: null,
  incline_pct: null,
  created_at: "",
  updated_at: "",
  client_updated_at: "",
  ...over,
});

const summaries = new Map<string, Pick<ExerciseSummary, "last_sets">>([[BENCH, { last_sets: [lastSet({ weight_kg: 60, weight_input: 60, weight_unit: "kg", reps: 8 })] }]]);
const ctx: ActionCtx = { units: DEFAULT_UNITS, restS: 90, summaries };

const draft = () => getLocalView().activeSession!;
const ex = (i = 0): DraftExercise => draft().exercises[i];
const opsOf = (entity: string) => getLocalView().ops.filter((o) => o.entity === entity);

async function addEx(id: string, name: string, track: string, load = "external") {
  await mutateSession((d, now) => addExerciseChange(d, { id, name, name_th: null, track_type: track, load_mode: load }, summaries.get(id), DEFAULT_UNITS, now)?.change ?? null);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  await openTestOffline({ snapshot: { places: [] } });
  await startSession(PLACE);
});
afterEach(() => {
  closeTestOffline();
  vi.useRealTimers();
});

describe("เพิ่มท่า + แถวเซ็ตแรก", () => {
  it("เพิ่มท่า = มีแถวแนะนำ 1 แถว เติมจากเซ็ตแรกของครั้งก่อน · ยังไม่เข้าคิว (ยังไม่ติ๊ก)", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    expect(ex().sets).toHaveLength(1);
    expect(ex().sets[0]).toMatchObject({ weight_input: 60, reps: 8, completed_at: null, queued: false });
    expect(getLocalView().ops).toHaveLength(0);
  });

  it("ท่าที่ไม่เคยทำ = แถวว่าง", async () => {
    await addEx(PLANK, "Plank", "duration");
    expect(ex().sets[0]).toMatchObject({ duration_s: null, reps: null });
  });

  it("ท่าที่ 41 ในเซสชัน = เพิ่มไม่ได้ (D9)", async () => {
    for (let i = 0; i < 40; i++) await addEx(`00000000-0000-5000-8000-${String(i).padStart(12, "0")}`, `E${i}`, "reps_only");
    expect(draft().exercises).toHaveLength(40);
    const r = await mutateSession((d, now) => addExerciseChange(d, { id: PLANK, name: "x", name_th: null, track_type: "duration", load_mode: "external" }, undefined, DEFAULT_UNITS, now)?.change ?? null);
    expect(r).toBeNull();
    expect(draft().exercises).toHaveLength(40);
  });
});

describe("✓ ติ๊กเซ็ต", () => {
  it("ติ๊ก = เซสชัน → ท่า → เซ็ต เข้าคิวตามลำดับ · แถวถัดไปขึ้นเองพร้อมค่าเดิม · พักเริ่ม 90 วิ", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const s = ex().sets[0];
    expect((await tickSet(ex().id, s.id, ctx))?.ok).toBe(true);
    expect(getLocalView().ops.map((o) => o.entity)).toEqual(["workout_session", "session_exercise", "set_record"]);
    expect(opsOf("set_record")[0].data).toMatchObject({ weight_input: 60, weight_unit: "kg", reps: 8, set_kind: "normal", completed_at: new Date(T0).toISOString() });
    expect(ex().sets).toHaveLength(2);
    expect(ex().sets[1]).toMatchObject({ weight_input: 60, reps: 8, completed_at: null });
    expect(draft().rest).toEqual({ started_at: T0, duration_s: 90 });
    // ใช้ค่าตั้งต้นพักจากโปรไฟล์ (R3b) แทน 90
    const s2 = ex().sets[1];
    await tickSet(ex().id, s2.id, { ...ctx, restS: 120 });
    expect(draft().rest?.duration_s).toBe(120);
  });

  it("ติ๊กซ้ำที่เซ็ตเดิมไม่ทำอะไร", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const id = ex().sets[0].id;
    await tickSet(ex().id, id, ctx);
    const before = getLocalView().ops.length;
    expect(await tickSet(ex().id, id, ctx)).toBeNull();
    expect(getLocalView().ops).toHaveLength(before);
  });

  it("ท่าคาร์ดิโอ (ระยะ+เวลา · ลู่วิ่ง) ไม่เริ่มพัก (D1)", async () => {
    await addEx(RUN, "Run", "distance_duration");
    await updateValues(ex().id, ex().sets[0].id, { ...ex().sets[0], duration_s: 1800 } as never);
    await tickSet(ex().id, ex().sets[0].id, ctx);
    expect(draft().rest).toBeNull();
  });

  it("แตะรัวๆ ทำทีละงานตามลำดับ ไม่ซ้ำแถว", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const e = ex();
    const id0 = e.sets[0].id;
    await Promise.all([tickSet(e.id, id0, ctx), tickSet(e.id, id0, ctx), tickSet(e.id, id0, ctx)]);
    expect(opsOf("set_record")).toHaveLength(1);
    expect(ex().sets).toHaveLength(2);
  });

  it("เซ็ตที่ 101 ไม่ขึ้นแถวใหม่ (D9)", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    for (let i = 0; i < 100; i++) {
      const open = ex().sets.find((s) => s.completed_at === null)!;
      await tickSet(ex().id, open.id, ctx);
    }
    expect(ex().sets).toHaveLength(100);
    expect(ex().sets.every((s) => s.completed_at !== null)).toBe(true);
  });
});

describe("แก้ · วอร์มอัพ · เอาติ๊กออก · ลบ", () => {
  it("แก้ค่าเซ็ตที่ติ๊กแล้ว = เขียนคิวใหม่ (ทับแถวเดิม ไม่เพิ่มแถว)", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const id = ex().sets[0].id;
    await tickSet(ex().id, id, ctx);
    await updateValues(ex().id, id, { weight_input: 62.5, weight_unit: "kg", reps: 8, duration_s: null, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null });
    expect(opsOf("set_record")).toHaveLength(1);
    expect(opsOf("set_record")[0].data).toMatchObject({ weight_input: 62.5 });
  });

  it("เซ็ตวอร์มอัพ: เปลี่ยนชนิดแล้วเข้าคิว set_kind · เลขเซ็ตไม่นับ", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const id = ex().sets[0].id;
    await tickSet(ex().id, id, ctx);
    await setKind(ex().id, id, "warmup");
    expect(ex().sets[0].set_kind).toBe("warmup");
    expect(opsOf("set_record")[0].data).toMatchObject({ set_kind: "warmup" });
  });

  it("เอาติ๊กออก = ยกเลิกเซ็ตที่ยังไม่เคยส่ง (ไม่มี set ในคิว) · แถวกลับเป็นแถวแนะนำ id ใหม่ · ย้อนกลับติ๊กใหม่ได้", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const id = ex().sets[0].id;
    await tickSet(ex().id, id, ctx);
    const { newSetId } = await untickSet(ex().id, id);
    const row = ex().sets.find((s) => s.id === newSetId)!;
    expect(row.completed_at).toBeNull();
    expect(opsOf("set_record")).toHaveLength(0);
    await retickSet(ex().id, newSetId);
    expect(opsOf("set_record")).toHaveLength(1);
    expect(ex().sets.find((s) => s.id === newSetId)!.completed_at).not.toBeNull();
  });

  it("ลบเซ็ต = แถวหาย + แถวแนะนำท้ายยังอยู่ · ย้อนกลับ = เพิ่มกลับพร้อมติ๊กตามเดิม", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const id = ex().sets[0].id;
    await tickSet(ex().id, id, ctx);
    const { removed } = await deleteSet(ex().id, id, ctx);
    expect(removed).toMatchObject({ wasChecked: true, set_kind: "normal", values: { weight_input: 60, reps: 8 } });
    expect(ex().sets.some((s) => s.id === id)).toBe(false);
    expect(ex().sets.some((s) => s.completed_at === null)).toBe(true);
    await restoreSet(ex().id, removed!);
    expect(ex().sets.filter((s) => s.completed_at !== null)).toHaveLength(1);
    expect(opsOf("set_record")).toHaveLength(1);
  });

  it("เอาท่าออก = ท่าและเซ็ตหายจากร่าง และจากคิวที่ยังไม่ส่ง", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    await tickSet(ex().id, ex().sets[0].id, ctx);
    await dropExercise(ex().id);
    expect(draft().exercises).toHaveLength(0);
    expect(opsOf("set_record")).toHaveLength(0);
    expect(opsOf("session_exercise")).toHaveLength(0);
  });
});

describe("ตัวจับเวลาพัก (D1)", () => {
  it("−15/+15 ปรับเฉพาะรอบนี้ · ข้าม = ล้าง", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    await tickSet(ex().id, ex().sets[0].id, ctx);
    await adjustRestTimer(15);
    expect(draft().rest?.duration_s).toBe(105);
    await adjustRestTimer(-15);
    await adjustRestTimer(-15);
    expect(draft().rest?.duration_s).toBe(75);
    await skipRest();
    expect(draft().rest).toBeNull();
  });

  it("เวลาที่เหลือคำนวณจาก timestamp: ผ่านไป 60 วิ เหลือ 30 (จอดับแล้วกลับมาถูก)", async () => {
    const { restRemainingS } = await import("@/lib/offline/timer");
    await addEx(BENCH, "Bench press", "weight_reps");
    await tickSet(ex().id, ex().sets[0].id, ctx);
    vi.setSystemTime(T0 + 60_000);
    expect(restRemainingS(draft().rest!, Date.now())).toBe(30);
    vi.setSystemTime(T0 + 100_000);
    expect(restRemainingS(draft().rest!, Date.now())).toBe(0);
  });
});

describe("▶ จับเวลาท่า duration", () => {
  it("▶ แล้ว ■ = ใส่เวลาที่นับได้ + ติ๊กให้เลย + พักเริ่ม + แถวถัดไปขึ้น", async () => {
    await addEx(PLANK, "Plank", "duration");
    const id = ex().sets[0].id;
    await playStopwatch(ex().id, id);
    expect(draft().stopwatch).toMatchObject({ set_id: id, started_at: T0, stopped_at: null });
    vi.setSystemTime(T0 + 95_400);
    await stopStopwatchAndTick(ctx);
    expect(draft().stopwatch).toBeNull();
    expect(ex().sets[0]).toMatchObject({ duration_s: 95, completed_at: new Date(T0 + 95_400).toISOString() });
    expect(opsOf("set_record")[0].data).toMatchObject({ duration_s: 95 });
    expect(draft().rest).not.toBeNull();
    expect(ex().sets).toHaveLength(2);
  });

  it("ปิดแอปแล้วกลับมา: ตัวจับเวลายังเดินจากเวลาเริ่มเดิม (อยู่ในร่าง)", async () => {
    await addEx(PLANK, "Plank", "duration");
    await playStopwatch(ex().id, ex().sets[0].id);
    const saved = JSON.parse(JSON.stringify(draft()));
    expect(saved.stopwatch.started_at).toBe(T0);
  });

  it("นับได้ไม่ถึง 1 วิ = แค่ยกเลิก ไม่ติ๊ก · ▶ ซ้อนตอนกำลังนับไม่ทำอะไร · เกิน 24 ชม. ตัดที่ 24:00:00", async () => {
    await addEx(PLANK, "Plank", "duration");
    const id = ex().sets[0].id;
    await playStopwatch(ex().id, id);
    expect(await playStopwatch(ex().id, id)).toBeNull();
    await stopStopwatchAndTick(ctx);
    expect(ex().sets[0].completed_at).toBeNull();
    expect(draft().stopwatch).toBeNull();
    await playStopwatch(ex().id, id);
    vi.setSystemTime(T0 + 30 * 3600_000);
    await stopStopwatchAndTick(ctx);
    expect(ex().sets[0].duration_s).toBe(86_400);
  });
});

describe("เปลี่ยนสถานที่ · จบ · สรุป", () => {
  it("เปลี่ยนสถานที่ก่อนมีเซ็ต = แก้ในร่าง ไม่เข้าคิว · หลังมีเซ็ต = เข้าคิว place_id ใหม่", async () => {
    await mutateSession((d, now) => changePlace(d, { id: "22222222-2222-4222-8222-222222222222", name: "Park" }, now));
    expect(draft().session).toMatchObject({ place_id: "22222222-2222-4222-8222-222222222222", place_name: "Park" });
    expect(getLocalView().ops).toHaveLength(0);
    await addEx(BENCH, "Bench press", "weight_reps");
    await tickSet(ex().id, ex().sets[0].id, ctx);
    await mutateSession((d, now) => changePlace(d, PLACE, now));
    expect(opsOf("workout_session")[0].data).toMatchObject({ place_id: PLACE.id });
  });

  it("สรุป: นับเซ็ตที่ติ๊ก (วอร์มอัพนับด้วย · D2) ไม่นับแถวแนะนำ · ท่าที่ทำครั้งแรกไม่มีสถิติ", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const id0 = ex().sets[0].id;
    await tickSet(ex().id, id0, ctx);
    await setKind(ex().id, id0, "warmup");
    await tickSet(ex().id, ex().sets.find((s) => s.completed_at === null)!.id, ctx);
    expect(totalCompleted(draft())).toBe(2);
    const sum = buildSummary(draft(), T0 + 30 * 60_000, new Map(), "en", () => "chest");
    expect(sum).toMatchObject({ totalSets: 2, prCount: 0, categories: ["chest"], placeName: "Gym", durationMs: 30 * 60_000 });
    expect(sum.exercises).toHaveLength(1);
    expect(sum.exercises[0]).toMatchObject({ name: "Bench press", sets: 2, best: "60 kg × 8" });
  });

  it("สรุปมีสถิติเมื่อเซ็ตชนะของเดิม (D3)", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    await updateValues(ex().id, ex().sets[0].id, { weight_input: 100, weight_unit: "kg", reps: 5, duration_s: null, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null });
    await tickSet(ex().id, ex().sets[0].id, ctx);
    const prior = new Map([[BENCH, { exercise_id: BENCH, last_used_at: "2026-11-20T00:00:00.000Z", sessions_90d: 3, last_sets: [], bests: { max_weight_kg: 90, max_reps: null, reps_at_weight: [{ weight_kg: 90, reps: 5 }], max_extra_weight_kg: null, min_assist_kg: null, max_duration_s: null, duration_at_weight: [], max_distance_m: null, best_pace_s_per_km: null, duration_at_incline: [] } } as ExerciseSummary]]);
    const sum = buildSummary(draft(), T0 + 1000, prior, "en", () => "chest");
    expect(sum.prCount).toBe(1);
    expect(sum.exercises[0].pr).toBe(true);
  });

  it("QA-M1: เซสชันก่อนหน้ามีแต่วอร์มอัพ (bests ว่าง) → เซสชันจริงครั้งแรกไม่ฉลอง PR (D2/D3)", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    await updateValues(ex().id, ex().sets[0].id, { weight_input: 60, weight_unit: "kg", reps: 8, duration_s: null, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null });
    await tickSet(ex().id, ex().sets[0].id, ctx);
    await updateValues(ex().id, ex().sets[1].id, { weight_input: 80, weight_unit: "kg", reps: 8, duration_s: null, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null });
    await tickSet(ex().id, ex().sets[1].id, ctx);
    const warmupOnly = new Map([[BENCH, { exercise_id: BENCH, last_used_at: "2026-11-20T00:00:00.000Z", sessions_90d: 1, last_sets: [], bests: { max_weight_kg: null, max_reps: null, reps_at_weight: [], max_extra_weight_kg: null, min_assist_kg: null, max_duration_s: null, duration_at_weight: [], max_distance_m: null, best_pace_s_per_km: null, duration_at_incline: [] } } as ExerciseSummary]]);
    const sum = buildSummary(draft(), T0 + 1000, warmupOnly, "en", () => "chest");
    expect(sum.prCount).toBe(0);
    expect(sum.exercises[0].pr).toBe(false);
  });

  it("ล่าสุด 5 ท่า: เรียงตามเวลาเซ็ตล่าสุด รวมที่ค้างส่ง · ไม่รวมท่าที่กรองทิ้ง · สูงสุด 5", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    await tickSet(ex().id, ex().sets[0].id, ctx);
    vi.setSystemTime(T0 + 60_000);
    await addEx(PLANK, "Plank", "duration");
    await updateValues(ex(1).id, ex(1).sets[0].id, { weight_input: null, weight_unit: null, reps: null, duration_s: 45, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null });
    await tickSet(ex(1).id, ex(1).sets[0].id, ctx);
    const view = getLocalView();
    const typeOf = (id: string) => (id === BENCH ? { track: "weight_reps" as const, load: "external" as const } : { track: "duration" as const, load: "external" as const });
    const r = recentExercises(view, () => true, "en", typeOf, DEFAULT_UNITS);
    expect(r.map((x) => x.exerciseId)).toEqual([PLANK, BENCH]);
    expect(r[0].last).toBe("0:45");
    expect(recentExercises(view, (id) => id !== PLANK, "en", typeOf, DEFAULT_UNITS).map((x) => x.exerciseId)).toEqual([BENCH]);

    // QA-M3: จบเซสชันออฟไลน์แล้ว (activeSession = null, ops ยังค้างส่ง) → ยังแสดงค่าเซ็ตสุดท้าย
    const { finishSession } = await import("@/lib/offline/session");
    await applySessionChange(finishSession(draft(), T0 + 120_000));
    expect(getLocalView().activeSession).toBeNull();
    const afterFinish = recentExercises(getLocalView(), () => true, "en", typeOf, DEFAULT_UNITS);
    expect(afterFinish.map((x) => x.exerciseId)).toEqual([PLANK, BENCH]);
    expect(afterFinish[0].last).toBe("0:45");
    expect(afterFinish[1].last).toBe("60 kg × 8");
  });

  it("applySessionChange ตรง ๆ: จบโดยไม่มีเซ็ต = ทิ้งร่าง ไม่ส่งอะไร", async () => {
    await addEx(BENCH, "Bench press", "weight_reps");
    const { finishSession } = await import("@/lib/offline/session");
    await applySessionChange(finishSession(draft(), T0 + 1000));
    expect(getLocalView().activeSession).toBeNull();
    expect(getLocalView().ops).toHaveLength(0);
  });

  it("ข้ามเที่ยงคืน: เริ่ม 23:50 ติ๊ก 00:20 จบ 00:40 → local_date = วันที่เริ่ม (Asia/Bangkok)", async () => {
    closeTestOffline();
    await openTestOffline({ snapshot: { places: [] } });
    const start = Date.parse("2026-11-24T16:50:00.000Z"); // 23:50 ใน Asia/Bangkok
    vi.setSystemTime(start);
    await applySessionChange({ draft: newSessionDraft({ id: "22222222-2222-4222-8222-222222222222", placeId: PLACE.id, placeName: "Gym", now: start, timeZone: "Asia/Bangkok" }), writes: [] });
    await addEx(BENCH, "Bench press", "weight_reps");
    vi.setSystemTime(start + 30 * 60_000); // 00:20
    await tickSet(ex().id, ex().sets[0].id, ctx);
    vi.setSystemTime(start + 50 * 60_000); // 00:40
    const { finishSession } = await import("@/lib/offline/session");
    await applySessionChange(finishSession(draft(), Date.now()));
    expect(opsOf("workout_session")[0].data).toMatchObject({ local_date: "2026-11-24", time_zone: "Asia/Bangkok", ended_at: new Date(start + 50 * 60_000).toISOString() });
  });
});
