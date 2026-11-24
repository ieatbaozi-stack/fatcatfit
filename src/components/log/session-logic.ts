// ตรรกะบริสุทธิ์ + ตัวคุมการเขียนร่างเซสชันของหน้าจด (R3a) — ไม่มี React
// ทุกการเปลี่ยนร่างผ่าน `mutateSession` (ต่อคิว · อ่านร่างล่าสุดตอนทำจริง) → `applySessionChange` ของ pwa-offline

import { applySessionChange, getLocalView, type LocalView, type WriteResult } from "@/lib/offline/client";
import { addExercise, addSet, finishSession, newSessionDraft, type ActiveSessionDraft, type DraftExercise, type DraftSet, type SessionChange } from "@/lib/offline/session";
import { SET_RANGES, WORKOUT_LIMITS, type ExerciseSummary, type WireSet } from "@/lib/data/shared/workout";
import type { WirePlace } from "@/lib/data/shared/sync";
import { evaluateLive } from "./pr";
import { formatSetValues, suggestNext, valuesFromWire, valuesOfDraft, type DisplayUnits } from "./set-logic";

// ---------------- เขียนร่างทีละงาน ----------------

let chainTail: Promise<unknown> = Promise.resolve();

/**
 * ทำการเปลี่ยนร่างทีละงานตามลำดับ (แตะรัวๆ ไม่แย่งกัน) · fn อ่านร่างล่าสุดตอนทำจริง · คืน null = ไม่ทำอะไร
 * คืนผลเขียน (ok:false = "ยังบันทึกไม่ได้ · ลองอีกที")
 */
export function mutateSession(fn: (d: ActiveSessionDraft, now: number) => SessionChange | null): Promise<WriteResult | null> {
  const run = async (): Promise<WriteResult | null> => {
    const d = getLocalView().activeSession;
    if (!d) return null;
    const ch = fn(d, Date.now());
    return ch ? applySessionChange(ch) : null;
  };
  const p = chainTail.then(run, run);
  chainTail = p.catch(() => {});
  return p;
}

/** ต่อการเปลี่ยนร่าง: ขั้นถัดไปทำบนร่างที่ได้จากขั้นก่อน · writes รวมตามลำดับ */
export function chain(ch: SessionChange, next: (d: ActiveSessionDraft) => SessionChange): SessionChange {
  if (!ch.draft) return ch;
  const n = next(ch.draft);
  return { draft: n.draft, writes: [...ch.writes, ...n.writes] };
}

export const noChange = (d: ActiveSessionDraft): SessionChange => ({ draft: d, writes: [] });

export const newId = (): string => crypto.randomUUID();

// ---------------- เริ่ม / ท่า / แถวเซ็ต ----------------

/** เริ่มเซสชันที่สถานที่นี้ (ยังไม่เข้าคิวจนกว่าจะมีเซ็ตแรกที่ติ๊ก) */
export function startSession(place: Pick<WirePlace, "id" | "name">): Promise<WriteResult> {
  return applySessionChange({ draft: newSessionDraft({ id: newId(), placeId: place.id, placeName: place.name, now: Date.now() }), writes: [] });
}

/** แถวเซ็ตแนะนำของท่า (ค่าเติมตาม UX 3) — เต็มเพดานเซ็ตต่อท่า (D9) = ไม่เพิ่ม */
export function withSuggestedRow(ch: SessionChange, exRowId: string, lastTime: readonly WireSet[] | undefined, units: DisplayUnits, now: number): SessionChange {
  return chain(ch, (d) => {
    const e = d.exercises.find((x) => x.id === exRowId);
    if (!e || e.sets.some((s) => s.completed_at === null) || e.sets.length >= WORKOUT_LIMITS.setsPerExercise) return noChange(d);
    return addSet(d, exRowId, { id: newId(), values: suggestNext({ sets: e.sets, lastTime, units }) }, now);
  });
}

export type PickedExercise = { id: string; name: string; name_th: string | null; track_type: string; load_mode: string };

/** เพิ่มท่าเข้าเซสชัน + แถวเซ็ตแรก (ค่าเติมจากครั้งก่อน) · ท่าที่มีอยู่แล้ว/เต็มเพดาน = null */
export function addExerciseChange(d: ActiveSessionDraft, ex: PickedExercise, summary: Pick<ExerciseSummary, "last_sets"> | undefined, units: DisplayUnits, now: number): { change: SessionChange; rowId: string } | null {
  if (d.exercises.length >= WORKOUT_LIMITS.exercisesPerSession) return null;
  const rowId = newId();
  const base = addExercise(
    d,
    { id: rowId, exercise_id: ex.id, exercise_name: ex.name, exercise_name_th: ex.name_th, track_type: ex.track_type as DraftExercise["track_type"], load_mode: ex.load_mode as DraftExercise["load_mode"] },
    now,
  );
  return { change: withSuggestedRow(base, rowId, summary?.last_sets, units, now), rowId };
}

/** เปลี่ยนสถานที่ของเซสชัน (เมนู ⋯) — เข้าคิวด้วยถ้าเซสชันถูกส่งขึ้นไปแล้ว */
export function changePlace(d: ActiveSessionDraft, place: Pick<WirePlace, "id" | "name">, now: number): SessionChange {
  const nd: ActiveSessionDraft = { ...d, session: { ...d.session, place_id: place.id, place_name: place.name }, updated_at: now };
  if (!d.queued) return { draft: nd, writes: [] };
  return {
    draft: nd,
    writes: [
      {
        entity: "workout_session",
        id: d.session.id,
        action: "upsert",
        data: { place_id: place.id, started_at: d.session.started_at, ended_at: null, local_date: d.session.local_date, time_zone: d.session.time_zone },
        display: { place_name: place.name },
      },
    ],
  };
}

// ---------------- ชื่อ / เวลา / สรุป ----------------

export const completedSets = (e: DraftExercise): DraftSet[] => e.sets.filter((s) => s.completed_at !== null);
export const totalCompleted = (d: ActiveSessionDraft): number => d.exercises.reduce((n, e) => n + completedSets(e).length, 0);

export const elapsedMs = (d: ActiveSessionDraft, now: number): number => Math.max(0, Math.min(now - Date.parse(d.session.started_at), SET_RANGES.sessionMaxMs));

/** หมวดไม่ซ้ำของท่าในเซสชัน ตามลำดับที่เพิ่ม (ชื่อเซสชัน = หมวดของท่า · contract) */
export function sessionCategories(d: ActiveSessionDraft, categoryOf: (exerciseId: string) => string | undefined): string[] {
  const out: string[] = [];
  for (const e of d.exercises) {
    const c = categoryOf(e.exercise_id);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** หมวดของท่า: คลังกลาง → ท่าของฉัน (จาก LocalView) */
export function categoryLookup(view: Pick<LocalView, "catalog" | "myExercises">): (exerciseId: string) => string | undefined {
  const map = new Map<string, string>();
  for (const e of view.catalog?.exercises ?? []) map.set(e.id, e.category);
  for (const e of view.myExercises) map.set(e.id, e.category);
  return (id) => map.get(id);
}

export type SummaryExercise = { name: string; nameTh: string | null; sets: number; best: string; pr: boolean };
export type SummaryData = {
  placeName: string;
  durationMs: number;
  totalSets: number;
  prCount: number;
  exercises: SummaryExercise[];
  categories: string[];
};

/** สรุปตอนจบ (ก่อนร่างถูกล้าง) · วอร์มอัพนับในจำนวนเซ็ต (D2) · ไม่นับแถวที่ไม่ได้ติ๊ก */
export function buildSummary(d: ActiveSessionDraft, now: number, summaries: ReadonlyMap<string, ExerciseSummary>, locale: string, categoryOf: (id: string) => string | undefined): SummaryData {
  let prCount = 0;
  const exercises: SummaryExercise[] = [];
  for (const e of d.exercises) {
    const done = completedSets(e);
    if (done.length === 0) continue;
    const ev = evaluateLive(e, summaries.get(e.exercise_id));
    const pr = [...ev.values()].some((x) => x.records.length > 0);
    if (pr) prCount += 1;
    const lastNormal = [...done].reverse().find((s) => s.set_kind === "normal") ?? done.at(-1)!;
    exercises.push({ name: e.exercise_name, nameTh: e.exercise_name_th, sets: done.length, best: formatSetValues(e.track_type, e.load_mode, valuesOfDraft(lastNormal), locale), pr });
  }
  return { placeName: d.session.place_name, durationMs: elapsedMs(d, now), totalSets: totalCompleted(d), prCount, exercises, categories: sessionCategories(d, categoryOf) };
}

/** จบเซสชัน ณ เวลานี้ */
export const finishChange = (d: ActiveSessionDraft, now: number): SessionChange => finishSession(d, now);

// ---------------- ล่าสุด 5 ท่า (D7) ----------------

export type RecentExercise = { exerciseId: string; at: number; last: string };

/** ท่าที่จดเซ็ตล่าสุด 5 ท่า (รวมที่ยังค้างส่ง) · เซ็ตสุดท้ายแสดงเป็นค่า · ไม่รวมท่าที่ผู้เรียกกรองทิ้ง (ในกรุ/หาย) */
export function recentExercises(view: Pick<LocalView, "snapshot" | "ops" | "activeSession">, keep: (exerciseId: string) => boolean, locale: string, typeOf: (exerciseId: string) => { track: DraftExercise["track_type"]; load: DraftExercise["load_mode"] } | undefined, units: DisplayUnits, limit = 5): RecentExercise[] {
  const best = new Map<string, { at: number; last: string }>();
  const consider = (id: string, at: number, last: string) => {
    const cur = best.get(id);
    if (!cur || at > cur.at) best.set(id, { at, last });
  };
  for (const s of view.snapshot?.exercise_summaries ?? []) {
    const t = typeOf(s.exercise_id);
    const lastSet = [...s.last_sets].sort((a, b) => a.position - b.position).at(-1);
    consider(s.exercise_id, Date.parse(s.last_used_at), t && lastSet ? formatSetValues(t.track, t.load, valuesFromWire(lastSet, units), locale) : "");
  }
  for (const e of view.activeSession?.exercises ?? []) {
    for (const s of completedSets(e)) consider(e.exercise_id, Date.parse(s.completed_at ?? ""), formatSetValues(e.track_type, e.load_mode, valuesOfDraft(s), locale));
  }
  for (const op of view.ops) {
    const id = op.display?.exercise_id;
    if (op.entity !== "set_record" || op.action !== "upsert" || !id || typeof op.data?.completed_at !== "string") continue;
    consider(id, Date.parse(op.data.completed_at), "");
  }
  return [...best.entries()]
    .filter(([id, v]) => Number.isFinite(v.at) && keep(id))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .map(([exerciseId, v]) => ({ exerciseId, at: v.at, last: v.last }));
}
