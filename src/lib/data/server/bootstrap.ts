import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { exercise, place, profile, sessionExercise, setRecord, workoutSession } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getCatalogVersion } from "@/lib/data/server/catalog";
import type { LoadMode, TrackType } from "@/lib/data/shared/exercise-meta";
import type { BootstrapResponse, WireMyExercise, WirePlace, WireProfile } from "@/lib/data/shared/sync";
import type { ExerciseSummary, WireSession, WireSessionExercise, WireSet } from "@/lib/data/shared/workout";
import { addSetToBests, emptyBests, type StatSet } from "@/lib/stats/bests";

// GET /api/bootstrap (ADR 0004 ข้อ 2 · R3a: + has_history / has_sessions / active_sessions / recent_sessions / exercise_summaries)
// ทุก query กรองด้วย userId ที่ได้จาก requireUser และ deleted_at IS NULL (รวมแถวที่เก็บเข้ากรุ ไม่รวมแถวที่ลบ)
// อ่านแต่ละตารางครั้งเดียวด้วย index (user_id) แล้วประกอบในหน่วยความจำ — ไม่ join หลายรอบ (เร็วทั้งบน Neon และ PGlite)

const iso = (d: Date) => d.toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
/** ประวัติใน snapshot: 60 วันตาม local_date (เผื่อเขตเวลาอีก 1 วัน) */
const RECENT_DAYS = 60;
const SUMMARY_DAYS = 90;

type SessionRow = typeof workoutSession.$inferSelect;
type SessionExRow = typeof sessionExercise.$inferSelect;
type SetRow = typeof setRecord.$inferSelect;

function parseGoals(text: string): string[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

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

function buildWireSessions(
  sessions: SessionRow[],
  seBySession: Map<string, SessionExRow[]>,
  setsBySe: Map<string, SetRow[]>,
  placeNames: Map<string, string>,
): WireSession[] {
  return sessions.map((s) => {
    const exRows = seBySession.get(s.id) ?? [];
    const exercises: WireSessionExercise[] = exRows.map((r) => ({
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
      sets: (setsBySe.get(r.id) ?? []).map(wireSet).sort(setOrder),
    }));
    return {
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
      exercises,
    };
  });
}

type Acc = {
  kind: { track_type: TrackType; load_mode: LoadMode };
  bests: ReturnType<typeof emptyBests>;
  seen: Set<string>;
  sessions90: Set<string>;
  lastAt: Date;
  lastSe: string;
};

export async function getBootstrap(db: AppDb, userId: string, now: Date): Promise<BootstrapResponse> {
  // อ่านข้อมูลของผู้ใช้ทีละตารางแบบ flat index scan (ไม่มี join ซ้ำซ้อน)
  const [[p], allPlaceRows, exRows, sessionRows, seRows, setRows, catalogVersion] = await Promise.all([
    db.select().from(profile).where(eq(profile.userId, userId)).limit(1),
    db.select().from(place).where(eq(place.userId, userId)).orderBy(asc(place.createdAt), asc(place.id)),
    db.select().from(exercise).where(and(eq(exercise.ownerUserId, userId), isNull(exercise.deletedAt))).orderBy(asc(exercise.name), asc(exercise.id)),
    db.select().from(workoutSession).where(and(eq(workoutSession.userId, userId), isNull(workoutSession.deletedAt))).orderBy(asc(workoutSession.startedAt), asc(workoutSession.id)),
    db
      .select()
      .from(sessionExercise)
      .where(and(eq(sessionExercise.userId, userId), isNull(sessionExercise.deletedAt)))
      .orderBy(asc(sessionExercise.position), asc(sessionExercise.createdAt), asc(sessionExercise.id)),
    db.select().from(setRecord).where(and(eq(setRecord.userId, userId), isNull(setRecord.deletedAt))),
    getCatalogVersion(db),
  ]);

  const placeRows = allPlaceRows.filter((r) => r.deletedAt === null);
  const placeNames = new Map(allPlaceRows.map((r) => [r.id, r.name]));

  // แยก active / recent sessions และเก็บ map สำหรับอ้างอิง O(1)
  const cutoff = new Date(now.getTime() - (RECENT_DAYS + 1) * DAY_MS).toISOString().slice(0, 10);
  const hasSessions = new Set<string>();
  const sessionById = new Map<string, SessionRow>();
  const activeRows: SessionRow[] = [];
  const recentRows: SessionRow[] = [];
  const needChildSessions = new Set<string>();
  for (const s of sessionRows) {
    hasSessions.add(s.placeId);
    sessionById.set(s.id, s);
    if (s.endedAt === null) {
      activeRows.push(s);
      needChildSessions.add(s.id);
    } else if (s.localDate >= cutoff) {
      recentRows.push(s);
      needChildSessions.add(s.id);
    }
  }

  // จัดกลุ่ม session_exercise
  const seById = new Map<string, SessionExRow>();
  const seBySession = new Map<string, SessionExRow[]>();
  const referencedExIds = new Set<string>();
  for (const se of seRows) {
    seById.set(se.id, se);
    referencedExIds.add(se.exerciseId);
    if (needChildSessions.has(se.sessionId)) push(seBySession, se.sessionId, se);
  }

  // ดึง track_type/load_mode ปัจจุบันของท่าที่เคยเล่น (รวมท่าคลังและท่าที่ถูกลบ) เฉพาะ id ที่ยังไม่มีใน exRows
  const curExBy = new Map<string, { trackType: string; loadMode: string }>();
  for (const e of exRows) curExBy.set(e.id, { trackType: e.trackType, loadMode: e.loadMode });
  const missingExIds = [...referencedExIds].filter((id) => !curExBy.has(id));
  if (missingExIds.length > 0) {
    const extra = await db
      .select({ id: exercise.id, trackType: exercise.trackType, loadMode: exercise.loadMode })
      .from(exercise)
      .where(inArray(exercise.id, missingExIds));
    for (const c of extra) curExBy.set(c.id, { trackType: c.trackType, loadMode: c.loadMode });
  }

  // วน set_record รอบเดียว: หา hasHistory, จัดกลุ่มเซ็ตของ active/recent, และสรุป exercise_summaries
  const since = now.getTime() - SUMMARY_DAYS * DAY_MS;
  const hasHistory = new Set<string>();
  const setsBySe = new Map<string, SetRow[]>();
  const acc = new Map<string, Acc>();

  for (const r of setRows) {
    const se = seById.get(r.sessionExerciseId);
    if (!se) continue;
    hasHistory.add(se.exerciseId);
    if (needChildSessions.has(se.sessionId)) push(setsBySe, r.sessionExerciseId, r);

    const ses = sessionById.get(se.sessionId);
    if (!ses || ses.endedAt === null) continue;
    const c = curExBy.get(se.exerciseId);
    if (!c || c.trackType !== se.trackType || c.loadMode !== se.loadMode) continue;

    let a = acc.get(se.exerciseId);
    if (!a) {
      a = {
        kind: { track_type: c.trackType as TrackType, load_mode: c.loadMode as LoadMode },
        bests: emptyBests(),
        seen: new Set(),
        sessions90: new Set(),
        lastAt: r.completedAt,
        lastSe: se.id,
      };
      acc.set(se.exerciseId, a);
    }
    if (ses.startedAt.getTime() >= since) a.sessions90.add(se.sessionId);
    // ท่าในเซสชันที่ทำล่าสุด = ที่มีเซ็ตติ๊กล่าสุด
    if (r.completedAt > a.lastAt || (r.completedAt.getTime() === a.lastAt.getTime() && se.id > a.lastSe)) {
      a.lastAt = r.completedAt;
      a.lastSe = se.id;
    }
    // ตัดค่าเซ็ต normal ที่ซ้ำกันก่อนส่งเข้า addSetToBests (ผลเท่าเดิมทุกประการ แต่ลดการคำนวณ frontier มหาศาล)
    if (r.setKind !== "warmup") {
      const key = `${r.weightKg ?? ""}|${r.reps ?? ""}|${r.durationS ?? ""}|${r.distanceM ?? ""}|${r.inclinePct ?? ""}`;
      if (!a.seen.has(key)) {
        a.seen.add(key);
        a.bests = addSetToBests(a.kind, a.bests, {
          id: "",
          completed_at: "",
          position: 0,
          set_kind: "normal",
          weight_kg: r.weightKg,
          reps: r.reps,
          duration_s: r.durationS,
          distance_m: r.distanceM,
          incline_pct: r.inclinePct,
        } satisfies StatSet);
      }
    }
  }

  // เก็บเซ็ตของ lastSe ที่ไม่ได้อยู่ใน active/recent (กรณีครั้งล่าสุดของท่านั้นเก่ากว่า 60 วัน)
  const lastSeSet = new Set<string>();
  for (const a of acc.values()) {
    if (!setsBySe.has(a.lastSe)) lastSeSet.add(a.lastSe);
  }
  if (lastSeSet.size > 0) {
    for (const r of setRows) {
      if (lastSeSet.has(r.sessionExerciseId)) push(setsBySe, r.sessionExerciseId, r);
    }
  }

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

  const exerciseSummaries: ExerciseSummary[] = [...acc.entries()]
    .map(([exerciseId, a]) => ({
      exercise_id: exerciseId,
      last_used_at: iso(a.lastAt),
      sessions_90d: a.sessions90.size,
      last_sets: (setsBySe.get(a.lastSe) ?? []).map(wireSet).sort(setOrder),
      bests: a.bests,
    }))
    .sort((x, y) => (x.exercise_id < y.exercise_id ? -1 : 1));

  return {
    profile: wireProfile,
    places,
    my_exercises: myExercises,
    active_sessions: buildWireSessions(activeRows, seBySession, setsBySe, placeNames),
    recent_sessions: buildWireSessions(recentRows, seBySession, setsBySe, placeNames),
    exercise_summaries: exerciseSummaries,
    catalog_version: catalogVersion,
    server_time: iso(now),
  };
}
