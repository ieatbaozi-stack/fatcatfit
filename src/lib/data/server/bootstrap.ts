import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { exercise, place, profile, sessionExercise, setRecord, workoutSession } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getCatalogVersion } from "@/lib/data/server/catalog";
import type { LoadMode, TrackType } from "@/lib/data/shared/exercise-meta";
import type { BootstrapResponse, WireMyExercise, WirePlace, WireProfile } from "@/lib/data/shared/sync";
import type { ExerciseSummary, WireSession, WireSessionExercise, WireSet } from "@/lib/data/shared/workout";
import { computeBests, type StatSet } from "@/lib/stats/bests";

// GET /api/bootstrap (ADR 0004 ข้อ 2 · R3a: + has_history / has_sessions / active_sessions / recent_sessions / exercise_summaries)
// ทุก query กรองด้วย userId ที่ได้จาก requireUser และ deleted_at IS NULL (รวมแถวที่เก็บเข้ากรุ ไม่รวมแถวที่ลบ)

const iso = (d: Date) => d.toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
/** ประวัติใน snapshot: 60 วันตาม local_date (เผื่อเขตเวลาอีก 1 วัน) */
const RECENT_DAYS = 60;
const SUMMARY_DAYS = 90;

function parseGoals(text: string): string[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getBootstrap(db: AppDb, userId: string, now: Date): Promise<BootstrapResponse> {
  const [p] = await db.select().from(profile).where(eq(profile.userId, userId)).limit(1);
  const placeRows = await db
    .select()
    .from(place)
    .where(and(eq(place.userId, userId), isNull(place.deletedAt)))
    .orderBy(asc(place.createdAt), asc(place.id));
  const exRows = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.ownerUserId, userId), isNull(exercise.deletedAt)))
    .orderBy(asc(exercise.name), asc(exercise.id));

  const withSessions = await db
    .selectDistinct({ placeId: workoutSession.placeId })
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), isNull(workoutSession.deletedAt)));
  const hasSessions = new Set(withSessions.map((r) => r.placeId));
  const withHistory = await db
    .selectDistinct({ exerciseId: sessionExercise.exerciseId })
    .from(sessionExercise)
    .innerJoin(setRecord, eq(setRecord.sessionExerciseId, sessionExercise.id))
    .where(and(eq(sessionExercise.userId, userId), isNull(sessionExercise.deletedAt), eq(setRecord.userId, userId), isNull(setRecord.deletedAt)));
  const hasHistory = new Set(withHistory.map((r) => r.exerciseId));

  const wireProfile: WireProfile | null = p
    ? {
        locale: p.locale as "th" | "en",
        weight_unit: p.weightUnit,
        length_unit: p.lengthUnit,
        distance_unit: p.distanceUnit,
        theme: p.theme,
        rest_seconds: p.restSeconds,
        birth_year: p.birthYear,
        height_m: p.heightM,
        height_input: p.heightInput,
        height_unit: p.heightUnit,
        goals: parseGoals(p.goals),
        experience: p.experience,
        updated_at: iso(p.updatedAt),
        client_updated_at: iso(p.clientUpdatedAt),
      }
    : null;

  const places: WirePlace[] = placeRows.map((r) => ({
    id: r.id,
    name: r.name,
    map_url: r.mapUrl,
    has_sessions: hasSessions.has(r.id),
    last_used_at: r.lastUsedAt ? iso(r.lastUsedAt) : null,
    archived_at: r.archivedAt ? iso(r.archivedAt) : null,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
    client_updated_at: iso(r.clientUpdatedAt),
  }));

  const myExercises: WireMyExercise[] = exRows.map((r) => ({
    id: r.id,
    owner_user_id: r.ownerUserId,
    name: r.name,
    name_th: r.nameTh,
    search_terms: r.searchTerms,
    track_type: r.trackType,
    load_mode: r.loadMode,
    is_unilateral: r.isUnilateral,
    category: r.category,
    equipment: r.equipment,
    source_dataset: r.sourceDataset,
    source_ref: r.sourceRef,
    license: r.license,
    attribution: r.attribution,
    met: r.met,
    has_history: hasHistory.has(r.id),
    archived_at: r.archivedAt ? iso(r.archivedAt) : null,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
    client_updated_at: iso(r.clientUpdatedAt),
  }));

  // ชื่อสถานที่รวมที่ถูกลบ/เก็บกรุแล้ว (เซสชันเก่ายังอ้างได้)
  const allPlaces = await db.select({ id: place.id, name: place.name }).from(place).where(eq(place.userId, userId));
  const placeNames = new Map(allPlaces.map((r) => [r.id, r.name]));
  const activeRows = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), isNull(workoutSession.deletedAt), isNull(workoutSession.endedAt)))
    .orderBy(asc(workoutSession.startedAt), asc(workoutSession.id));
  const cutoff = new Date(now.getTime() - (RECENT_DAYS + 1) * DAY_MS).toISOString().slice(0, 10);
  const recentRows = await db
    .select()
    .from(workoutSession)
    .where(
      and(
        eq(workoutSession.userId, userId),
        isNull(workoutSession.deletedAt),
        isNotNull(workoutSession.endedAt),
        gte(workoutSession.localDate, cutoff),
      ),
    )
    .orderBy(asc(workoutSession.startedAt), asc(workoutSession.id));

  return {
    profile: wireProfile,
    places,
    my_exercises: myExercises,
    active_sessions: await withChildren(db, userId, activeRows, placeNames),
    recent_sessions: await withChildren(db, userId, recentRows, placeNames),
    exercise_summaries: await exerciseSummaries(db, userId, now),
    catalog_version: await getCatalogVersion(db),
    server_time: iso(now),
  };
}

// ---------------- เซสชัน + ลูก ----------------

type SetRow = typeof setRecord.$inferSelect;
const wireSet = (r: SetRow): WireSet => ({
  id: r.id,
  session_exercise_id: r.sessionExerciseId,
  position: r.position,
  set_kind: r.setKind as WireSet["set_kind"],
  completed_at: iso(r.completedAt),
  weight_kg: r.weightKg,
  weight_input: r.weightInput,
  weight_unit: r.weightUnit,
  reps: r.reps,
  duration_s: r.durationS,
  distance_m: r.distanceM,
  distance_input: r.distanceInput,
  distance_unit: r.distanceUnit,
  speed_mps: r.speedMps,
  speed_input: r.speedInput,
  speed_unit: r.speedUnit,
  incline_pct: r.inclinePct,
  created_at: iso(r.createdAt),
  updated_at: iso(r.updatedAt),
  client_updated_at: iso(r.clientUpdatedAt),
});
const setOrder = (a: WireSet, b: WireSet) =>
  a.position - b.position || (a.completed_at < b.completed_at ? -1 : a.completed_at > b.completed_at ? 1 : a.id < b.id ? -1 : 1);

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

/** แนบท่าในเซสชันและเซ็ต (ที่ไม่ถูกลบ) ให้เซสชันที่เลือกแล้ว · query ด้วย user_id เสมอ */
async function withChildren(
  db: AppDb,
  userId: string,
  sessions: (typeof workoutSession.$inferSelect)[],
  placeNames: Map<string, string>,
): Promise<WireSession[]> {
  if (sessions.length === 0) return [];
  const ids = sessions.map((s) => s.id);
  const seRows = await db
    .select()
    .from(sessionExercise)
    .where(and(eq(sessionExercise.userId, userId), inArray(sessionExercise.sessionId, ids), isNull(sessionExercise.deletedAt)))
    .orderBy(asc(sessionExercise.position), asc(sessionExercise.createdAt), asc(sessionExercise.id));
  const seIds = seRows.map((r) => r.id);
  const setRows = seIds.length
    ? await db
        .select()
        .from(setRecord)
        .where(and(eq(setRecord.userId, userId), inArray(setRecord.sessionExerciseId, seIds), isNull(setRecord.deletedAt)))
    : [];
  const setsBy = new Map<string, WireSet[]>();
  for (const r of setRows) push(setsBy, r.sessionExerciseId, wireSet(r));
  const exBy = new Map<string, WireSessionExercise[]>();
  for (const r of seRows) {
    push(exBy, r.sessionId, {
      id: r.id,
      session_id: r.sessionId,
      exercise_id: r.exerciseId,
      position: r.position,
      exercise_name: r.exerciseName,
      exercise_name_th: r.exerciseNameTh,
      track_type: r.trackType,
      load_mode: r.loadMode,
      created_at: iso(r.createdAt),
      updated_at: iso(r.updatedAt),
      client_updated_at: iso(r.clientUpdatedAt),
      sets: (setsBy.get(r.id) ?? []).sort(setOrder),
    });
  }
  return sessions.map((s) => ({
    id: s.id,
    place_id: s.placeId,
    place_name: placeNames.get(s.placeId) ?? "",
    started_at: iso(s.startedAt),
    ended_at: s.endedAt ? iso(s.endedAt) : null,
    local_date: s.localDate,
    time_zone: s.timeZone,
    template_id: s.templateId,
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
    client_updated_at: iso(s.clientUpdatedAt),
    exercises: exBy.get(s.id) ?? [],
  }));
}

// ---------------- สรุปต่อท่า (ADR 0003 ข้อ 4) ----------------

type Acc = {
  kind: { track_type: TrackType; load_mode: LoadMode };
  sets: StatSet[];
  sessions90: Set<string>;
  lastAt: Date;
  lastSe: string;
  bySe: Map<string, SetRow[]>;
};

/**
 * ต่อท่าที่เคยจดเซ็ต (เซสชันที่จบแล้ว ไม่ลบ): last_used_at · sessions_90d · last_sets (เซ็ตของครั้งล่าสุด) · bests
 * ไม่รวมเซ็ตที่สำเนา track_type/load_mode ไม่ตรงท่าปัจจุบัน (ใช้แถวท่าแม้ถูก tombstone) · คำนวณสดทุกครั้ง ไม่เก็บ
 */
async function exerciseSummaries(db: AppDb, userId: string, now: Date): Promise<ExerciseSummary[]> {
  const rows = await db
    .select({
      set: setRecord,
      seId: sessionExercise.id,
      sessionId: sessionExercise.sessionId,
      exerciseId: sessionExercise.exerciseId,
      trackType: sessionExercise.trackType,
      loadMode: sessionExercise.loadMode,
      startedAt: workoutSession.startedAt,
    })
    .from(setRecord)
    .innerJoin(sessionExercise, eq(setRecord.sessionExerciseId, sessionExercise.id))
    .innerJoin(workoutSession, eq(sessionExercise.sessionId, workoutSession.id))
    .where(
      and(
        eq(setRecord.userId, userId),
        isNull(setRecord.deletedAt),
        eq(sessionExercise.userId, userId),
        isNull(sessionExercise.deletedAt),
        eq(workoutSession.userId, userId),
        isNull(workoutSession.deletedAt),
        isNotNull(workoutSession.endedAt),
      ),
    );
  if (rows.length === 0) return [];
  const exIds = [...new Set(rows.map((r) => r.exerciseId))];
  const cur = await db
    .select({ id: exercise.id, trackType: exercise.trackType, loadMode: exercise.loadMode })
    .from(exercise)
    .where(inArray(exercise.id, exIds));
  const curBy = new Map(cur.map((c) => [c.id, c]));

  const since = now.getTime() - SUMMARY_DAYS * DAY_MS;
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const c = curBy.get(r.exerciseId);
    if (!c || c.trackType !== r.trackType || c.loadMode !== r.loadMode) continue;
    let a = acc.get(r.exerciseId);
    if (!a) {
      a = {
        kind: { track_type: c.trackType as TrackType, load_mode: c.loadMode as LoadMode },
        sets: [],
        sessions90: new Set(),
        lastAt: r.set.completedAt,
        lastSe: r.seId,
        bySe: new Map(),
      };
      acc.set(r.exerciseId, a);
    }
    a.sets.push({
      id: r.set.id,
      completed_at: iso(r.set.completedAt),
      position: r.set.position,
      set_kind: r.set.setKind as StatSet["set_kind"],
      weight_kg: r.set.weightKg,
      reps: r.set.reps,
      duration_s: r.set.durationS,
      distance_m: r.set.distanceM,
      incline_pct: r.set.inclinePct,
    });
    if (r.startedAt.getTime() >= since) a.sessions90.add(r.sessionId);
    // ท่าในเซสชันที่ทำล่าสุด = ที่มีเซ็ตติ๊กล่าสุด
    if (r.set.completedAt > a.lastAt || (r.set.completedAt.getTime() === a.lastAt.getTime() && r.seId > a.lastSe)) {
      a.lastAt = r.set.completedAt;
      a.lastSe = r.seId;
    }
    push(a.bySe, r.seId, r.set);
  }
  return [...acc.entries()]
    .map(([exerciseId, a]) => ({
      exercise_id: exerciseId,
      last_used_at: iso(a.lastAt),
      sessions_90d: a.sessions90.size,
      last_sets: (a.bySe.get(a.lastSe) ?? []).map(wireSet).sort(setOrder),
      bests: computeBests(a.kind, a.sets),
    }))
    .sort((x, y) => (x.exercise_id < y.exercise_id ? -1 : 1));
}
