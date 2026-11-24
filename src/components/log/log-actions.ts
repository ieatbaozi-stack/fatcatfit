// การกระทำของหน้าจด (R3a) — แต่ละอันเป็นการเปลี่ยนร่างเซสชันผ่าน mutateSession (ทีละงาน · เขียนคิวก่อนร่าง)
// ไม่มี React · เทสต์ในไฟล์ log-actions.test.ts

import type { ExerciseSummary } from "@/lib/data/shared/workout";
import type { WriteResult } from "@/lib/offline/client";
import { addSet, checkSet, removeExercise, removeSet, setRest, setStopwatch, uncheckSet, updateSet, type SetValues } from "@/lib/offline/session";
import { adjustRest, restAppliesTo, startRest, startStopwatch, stopStopwatch, stopwatchElapsedS } from "@/lib/offline/timer";
import { SET_RANGES } from "@/lib/data/shared/workout";
import { chain, mutateSession, newId, withSuggestedRow } from "./session-logic";
import type { DisplayUnits } from "./set-logic";

export type ActionCtx = {
  units: DisplayUnits;
  /** ค่าตั้งต้นเวลาพัก (วินาที) */
  restS: number;
  summaries: ReadonlyMap<string, Pick<ExerciseSummary, "last_sets">>;
};

type R = Promise<WriteResult | null>;

/** ✓: ติ๊กเซ็ต (เข้าคิวพร้อมพ่อแม่) · แถวถัดไปขึ้นเอง · พักเริ่มเองถ้าไม่ใช่คาร์ดิโอ (D1) */
export function tickSet(exRowId: string, setId: string, ctx: ActionCtx): R {
  return mutateSession((d, now) => {
    const e = d.exercises.find((x) => x.id === exRowId);
    const s = e?.sets.find((x) => x.id === setId);
    if (!e || !s || s.completed_at !== null) return null;
    let ch = checkSet(d, exRowId, setId, now);
    ch = withSuggestedRow(ch, exRowId, ctx.summaries.get(e.exercise_id)?.last_sets, ctx.units, now);
    if (restAppliesTo(e.track_type)) ch = chain(ch, (dd) => setRest(dd, startRest(now, ctx.restS), now));
    return ch;
  });
}

/** เอาติ๊กออก = ลบเซ็ตที่ส่งแล้ว (แถวกลับเป็นแถวแนะนำด้วย id ใหม่) · คืน id ใหม่ไว้ให้ "ย้อนกลับ" */
export async function untickSet(exRowId: string, setId: string): Promise<{ result: WriteResult | null; newSetId: string }> {
  const newSetId = newId();
  const result = await mutateSession((d, now) => {
    const s = d.exercises.find((x) => x.id === exRowId)?.sets.find((x) => x.id === setId);
    if (!s || s.completed_at === null) return null;
    return uncheckSet(d, exRowId, setId, newSetId, now);
  });
  return { result, newSetId };
}

/** ย้อนกลับการเอาติ๊กออก: ติ๊กแถวนั้นใหม่ (ค่าเดิมยังอยู่ในแถว) */
export function retickSet(exRowId: string, setId: string): R {
  return mutateSession((d, now) => {
    const s = d.exercises.find((x) => x.id === exRowId)?.sets.find((x) => x.id === setId);
    return s && s.completed_at === null ? checkSet(d, exRowId, setId, now) : null;
  });
}

/** แก้ค่า (ค่าต้องผ่านช่วง D4 มาแล้ว) · ติ๊กแล้ว = เขียนคิวใหม่ → สถิติคำนวณใหม่ */
export function updateValues(exRowId: string, setId: string, values: SetValues): R {
  return mutateSession((d, now) => (d.exercises.find((x) => x.id === exRowId)?.sets.some((x) => x.id === setId) ? updateSet(d, exRowId, setId, values, now) : null));
}

/** วอร์มอัพ ↔ เซ็ตปกติ (D2) */
export function setKind(exRowId: string, setId: string, kind: "normal" | "warmup"): R {
  return mutateSession((d, now) => (d.exercises.find((x) => x.id === exRowId)?.sets.some((x) => x.id === setId) ? updateSet(d, exRowId, setId, { set_kind: kind }, now) : null));
}

export type RemovedSet = { values: SetValues; set_kind: "normal" | "warmup"; wasChecked: boolean };

/** ลบเซ็ต (ไม่ถาม · มี "ย้อนกลับ" 5 วิ) · คืนข้อมูลไว้ย้อนกลับ */
export async function deleteSet(exRowId: string, setId: string, ctx: ActionCtx): Promise<{ result: WriteResult | null; removed: RemovedSet | null }> {
  let removed: RemovedSet | null = null;
  const result = await mutateSession((d, now) => {
    const e = d.exercises.find((x) => x.id === exRowId);
    const s = e?.sets.find((x) => x.id === setId);
    if (!e || !s) return null;
    removed = {
      values: {
        weight_input: s.weight_input,
        weight_unit: s.weight_unit,
        reps: s.reps,
        duration_s: s.duration_s,
        distance_input: s.distance_input,
        distance_unit: s.distance_unit,
        speed_input: s.speed_input,
        speed_unit: s.speed_unit,
        incline_pct: s.incline_pct,
      },
      set_kind: s.set_kind,
      wasChecked: s.completed_at !== null,
    };
    return withSuggestedRow(removeSet(d, exRowId, setId, now), exRowId, ctx.summaries.get(e.exercise_id)?.last_sets, ctx.units, now);
  });
  return { result, removed: removed as RemovedSet | null };
}

/** ย้อนกลับการลบเซ็ต: เพิ่มกลับเป็นแถวใหม่ (ท้ายรายการ) · ถ้าเดิมติ๊กไว้ก็ติ๊กให้ */
export function restoreSet(exRowId: string, r: RemovedSet): R {
  return mutateSession((d, now) => {
    if (!d.exercises.some((x) => x.id === exRowId)) return null;
    const id = newId();
    const ch = addSet(d, exRowId, { id, values: r.values, set_kind: r.set_kind }, now);
    return r.wasChecked ? chain(ch, (dd) => checkSet(dd, exRowId, id, now)) : ch;
  });
}

export const dropExercise = (exRowId: string): R => mutateSession((d, now) => (d.exercises.some((x) => x.id === exRowId) ? removeExercise(d, exRowId, now) : null));

// ---- ตัวจับเวลาพัก ----

export const adjustRestTimer = (deltaS: number): R => mutateSession((d, now) => (d.rest ? setRest(d, adjustRest(d.rest, deltaS, now), now) : null));
export const skipRest = (): R => mutateSession((d, now) => (d.rest ? setRest(d, null, now) : null));

// ---- ▶ จับเวลาท่า duration ----

export const playStopwatch = (exRowId: string, setId: string): R =>
  mutateSession((d, now) => (d.stopwatch && d.stopwatch.stopped_at === null ? null : setStopwatch(d, { ...startStopwatch(now), exercise_row_id: exRowId, set_id: setId }, now)));

/** ■: ใส่เวลาที่นับได้ลงเซ็ต + ติ๊กให้เลย (2 แตะ) + พักเริ่ม · นับได้ < 1 วิ = แค่ยกเลิก */
export function stopStopwatchAndTick(ctx: ActionCtx): R {
  return mutateSession((d, now) => {
    const sw = d.stopwatch;
    if (!sw) return null;
    const secs = Math.min(stopwatchElapsedS(stopStopwatch(sw, now), now), SET_RANGES.durationS.max);
    const e = d.exercises.find((x) => x.id === sw.exercise_row_id);
    const s = e?.sets.find((x) => x.id === sw.set_id);
    if (!e || !s || s.completed_at !== null || secs < SET_RANGES.durationS.min) return setStopwatch(d, null, now);
    let ch = updateSet(d, e.id, s.id, { duration_s: secs }, now);
    ch = chain(ch, (dd) => checkSet(dd, e.id, s.id, now));
    ch = chain(ch, (dd) => setStopwatch(dd, null, now));
    ch = withSuggestedRow(ch, e.id, ctx.summaries.get(e.exercise_id)?.last_sets, ctx.units, now);
    if (restAppliesTo(e.track_type)) ch = chain(ch, (dd) => setRest(dd, startRest(now, ctx.restS), now));
    return ch;
  });
}
