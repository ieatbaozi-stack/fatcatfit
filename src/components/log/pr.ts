// สถิติใหม่ (PR) ระหว่างจด (R3a · contract D3) — ใช้ฟังก์ชันกลางใน src/lib/stats/bests.ts
// เทียบกับ `bests` ของท่าใน bootstrap (เซสชันที่จบแล้ว) แล้วไล่เซ็ตที่ติ๊กแล้วในเซสชันนี้ตามลำดับ (position → completed_at → id)
// - ไม่เคยทำท่านี้ (ไม่มี summary) = ไม่มีดาวทั้งเซสชัน (เซสชันแรกไม่ฉลอง)
// - ดาว = เซ็ตที่ชนะตัวใดตัวหนึ่ง · ฉลอง (toast + แมว) ไม่เกิน 1 ครั้งต่อท่าต่อเซสชัน = เซ็ตแรกที่ชนะ

import { computeSetDerived, type ExerciseSummary } from "@/lib/data/shared/workout";
import { addSetToBests, bySetOrder, emptyBests, recordsFor, type RecordMetric, type StatSet } from "@/lib/stats/bests";
import type { DraftExercise, DraftSet } from "@/lib/offline/session";

export function statSetOf(s: DraftSet): StatSet {
  const d = computeSetDerived(s);
  return {
    id: s.id,
    completed_at: s.completed_at ?? "",
    position: s.position,
    set_kind: s.set_kind,
    weight_kg: d.weight_kg,
    reps: s.reps,
    duration_s: s.duration_s,
    distance_m: d.distance_m,
    incline_pct: s.incline_pct,
  };
}

export type LiveEval = Map<string, { records: RecordMetric[]; celebrate: boolean }>;

/** ผลของทุกเซ็ตที่ติ๊กแล้วของท่านี้ในเซสชัน (key = id เซ็ต) */
export function evaluateLive(e: Pick<DraftExercise, "track_type" | "load_mode" | "sets">, summary: Pick<ExerciseSummary, "bests"> | undefined): LiveEval {
  const kind = { track_type: e.track_type, load_mode: e.load_mode };
  let bests = summary?.bests ?? emptyBests();
  let celebrated = false;
  const out: LiveEval = new Map();
  const done = e.sets.filter((s) => s.completed_at !== null).map(statSetOf).sort(bySetOrder);
  for (const set of done) {
    const records = summary ? recordsFor(kind, bests, set) : [];
    bests = addSetToBests(kind, bests, set);
    const celebrate = records.length > 0 && !celebrated;
    if (celebrate) celebrated = true;
    out.set(set.id, { records, celebrate });
  }
  return out;
}
