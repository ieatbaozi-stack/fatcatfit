import "server-only";
import { and, count, eq, inArray, isNull, lte } from "drizzle-orm";
import { exercise, place, sessionExercise, setRecord, workoutSession } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isCatalogId, type LoadMode, type TrackType } from "@/lib/data/shared/exercise-meta";
import type { PushOp, PushRejectCode } from "@/lib/data/shared/sync";
import {
  SET_RANGES,
  WORKOUT_LIMITS,
  computeSetDerived,
  sessionExerciseDataSchema,
  setRecordDataSchema,
  validateSetFields,
  workoutSessionDataSchema,
} from "@/lib/data/shared/workout";

// push ของ entity R3a: workout_session / session_exercise / set_record (contract R3 "API & ชนิดข้อมูล" · ADR 0004 ข้อ 4 ส่วน R3 · ADR 0003 ข้อ 3.2)
// เรียกภายใน transaction ที่ล็อกแถว user ของผู้ส่งแล้ว (sync-push.ts) → นับเพดาน/ตรวจประวัติไม่แข่งกันเอง
// - ช่องสำเนา (ชื่อ/ชนิดท่า) · ช่อง SI · template_id: เซิร์ฟเวอร์ตั้งเอง ไคลเอนต์ส่งมา = invalid (strict ใน zod)
// - พ่อแม่ (place / session / session_exercise / exercise) ไม่มีหรือของคนอื่น = parent_missing · พ่อแม่ที่ถูกลบ: ลูกของเซสชัน/ท่าในเซสชัน = stale

export type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
export type Outcome = { status: "applied" | "stale" } | { status: "rejected"; code: PushRejectCode };

export const applied: Outcome = { status: "applied" };
export const stale: Outcome = { status: "stale" };
export const reject = (code: PushRejectCode): Outcome => ({ status: "rejected", code });
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);

// ---------------- ตัวตรวจที่ใช้ร่วมกับ exercise / place ----------------

/** "มีประวัติ" = มี set_record ที่ไม่ถูกลบ ใต้ session_exercise ที่ไม่ถูกลบ ของ me ที่อ้างท่านั้น */
export async function exerciseHasHistory(tx: Tx, me: string, exerciseId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: setRecord.id })
    .from(sessionExercise)
    .innerJoin(setRecord, eq(setRecord.sessionExerciseId, sessionExercise.id))
    .where(
      and(
        eq(sessionExercise.userId, me),
        eq(sessionExercise.exerciseId, exerciseId),
        isNull(sessionExercise.deletedAt),
        eq(setRecord.userId, me),
        isNull(setRecord.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** สถานที่มีเซสชันที่ไม่ถูกลบหรือไม่ */
export async function placeHasSessions(tx: Tx, me: string, placeId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: workoutSession.id })
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, me), eq(workoutSession.placeId, placeId), isNull(workoutSession.deletedAt)))
    .limit(1);
  return rows.length > 0;
}

// ---------------- workout_session ----------------

export async function applyWorkoutSession(tx: Tx, me: string, o: PushOp, ts: Date, now: Date): Promise<Outcome> {
  if (o.action === "delete") return deleteSession(tx, me, o.id, now);
  const d = workoutSessionDataSchema.safeParse(o.data);
  if (!d.success) return reject("invalid");
  const data = d.data;

  const [ex] = await tx
    .select({ userId: workoutSession.userId, deletedAt: workoutSession.deletedAt, clientUpdatedAt: workoutSession.clientUpdatedAt, endedAt: workoutSession.endedAt })
    .from(workoutSession)
    .where(eq(workoutSession.id, o.id));
  if (ex && ex.userId !== me) return reject("id_conflict");
  if (ex && (ex.deletedAt || ex.clientUpdatedAt.getTime() > ts.getTime())) return stale;

  // ไม่ส่ง ended_at = คงค่าเดิม · ต้องผ่านช่วง 24 ชม. กับ started_at ที่ส่งมาด้วย (กัน CHECK ของฐานข้อมูลล้ม)
  const finalEnd = data.ended_at !== undefined ? toDate(data.ended_at) : (ex?.endedAt ?? null);
  if (finalEnd) {
    const span = finalEnd.getTime() - new Date(data.started_at).getTime();
    if (span < 0 || span > SET_RANGES.sessionMaxMs) return reject("invalid");
  }

  // สถานที่ต้องเป็นของ me (ถูก tombstone/เก็บกรุแล้วยังรับ — FK ยังอยู่)
  const [pl] = await tx.select({ userId: place.userId }).from(place).where(eq(place.id, data.place_id));
  if (!pl || pl.userId !== me) return reject("parent_missing");

  if (!ex) {
    const [{ n }] = await tx.select({ n: count() }).from(workoutSession).where(eq(workoutSession.userId, me));
    if (n >= WORKOUT_LIMITS.sessionsTotal) return reject("limit_reached");
  }

  const rows = await tx
    .insert(workoutSession)
    .values({
      id: o.id,
      userId: me,
      placeId: data.place_id,
      startedAt: new Date(data.started_at),
      endedAt: finalEnd,
      localDate: data.local_date,
      timeZone: data.time_zone,
      createdAt: now,
      updatedAt: now,
      clientUpdatedAt: ts,
    })
    .onConflictDoUpdate({
      target: workoutSession.id,
      set: {
        placeId: data.place_id,
        startedAt: new Date(data.started_at),
        endedAt: finalEnd,
        localDate: data.local_date,
        timeZone: data.time_zone,
        updatedAt: now,
        clientUpdatedAt: ts,
      },
      setWhere: and(eq(workoutSession.userId, me), isNull(workoutSession.deletedAt), lte(workoutSession.clientUpdatedAt, ts)),
    })
    .returning({ id: workoutSession.id });
  if (rows.length > 0) return applied;
  const [r] = await tx.select({ u: workoutSession.userId }).from(workoutSession).where(eq(workoutSession.id, o.id));
  return r && r.u !== me ? reject("id_conflict") : stale;
}

/** ลบเซสชัน: tombstone ตัวเอง + ท่าในเซสชัน + เซ็ต ใน transaction เดียว (deleted_at เดียวกัน) · ไม่มีอยู่/ลบแล้ว = applied */
async function deleteSession(tx: Tx, me: string, id: string, now: Date): Promise<Outcome> {
  const [ex] = await tx.select({ userId: workoutSession.userId, deletedAt: workoutSession.deletedAt }).from(workoutSession).where(eq(workoutSession.id, id));
  if (!ex) return applied;
  if (ex.userId !== me) return reject("id_conflict");
  if (ex.deletedAt) return applied;
  const seIds = tx.select({ id: sessionExercise.id }).from(sessionExercise).where(and(eq(sessionExercise.sessionId, id), eq(sessionExercise.userId, me)));
  await tx
    .update(setRecord)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(setRecord.userId, me), inArray(setRecord.sessionExerciseId, seIds), isNull(setRecord.deletedAt)));
  await tx
    .update(sessionExercise)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(sessionExercise.userId, me), eq(sessionExercise.sessionId, id), isNull(sessionExercise.deletedAt)));
  await tx
    .update(workoutSession)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(workoutSession.id, id), eq(workoutSession.userId, me), isNull(workoutSession.deletedAt)));
  return applied;
}

// ---------------- session_exercise ----------------

export async function applySessionExercise(tx: Tx, me: string, o: PushOp, ts: Date, now: Date): Promise<Outcome> {
  if (o.action === "delete") return deleteSessionExercise(tx, me, o.id, now);
  const d = sessionExerciseDataSchema.safeParse(o.data);
  if (!d.success) return reject("invalid");
  const data = d.data;

  const [ex] = await tx
    .select({
      userId: sessionExercise.userId,
      sessionId: sessionExercise.sessionId,
      exerciseId: sessionExercise.exerciseId,
      name: sessionExercise.exerciseName,
      nameTh: sessionExercise.exerciseNameTh,
      trackType: sessionExercise.trackType,
      loadMode: sessionExercise.loadMode,
      deletedAt: sessionExercise.deletedAt,
      clientUpdatedAt: sessionExercise.clientUpdatedAt,
    })
    .from(sessionExercise)
    .where(eq(sessionExercise.id, o.id));
  if (ex && ex.userId !== me) return reject("id_conflict");
  // session_id / exercise_id เปลี่ยนไม่ได้หลัง insert
  if (ex && (ex.sessionId !== data.session_id || ex.exerciseId !== data.exercise_id)) return reject("invalid");
  if (ex && (ex.deletedAt || ex.clientUpdatedAt.getTime() > ts.getTime())) return stale;

  const [ses] = await tx
    .select({ userId: workoutSession.userId, deletedAt: workoutSession.deletedAt })
    .from(workoutSession)
    .where(eq(workoutSession.id, data.session_id));
  if (!ses || ses.userId !== me) return reject("parent_missing");
  if (ses.deletedAt) return stale; // ลูกของเซสชันที่ลบแล้ว (ลบชนะ)

  // แถวเดิม: ใช้สำเนาเดิม (ส่งเข้า VALUES ให้ผ่าน CHECK ก่อนชน id · ส่วน UPDATE ไม่แตะสำเนา)
  let copy: { name: string; nameTh: string | null; trackType: string; loadMode: string } | null = ex
    ? { name: ex.name, nameTh: ex.nameTh, trackType: ex.trackType, loadMode: ex.loadMode }
    : null;
  if (!ex) {
    // exercise_id: v5 = ท่าคลัง (owner null) · v4 = ท่าของ me · ท่าของ me ที่ถูก tombstone แล้วยังรับ (ไม่ทิ้งข้อมูลที่จดแล้ว)
    const [e] = await tx
      .select({ owner: exercise.ownerUserId, name: exercise.name, nameTh: exercise.nameTh, trackType: exercise.trackType, loadMode: exercise.loadMode })
      .from(exercise)
      .where(eq(exercise.id, data.exercise_id));
    const okOwner = e && (isCatalogId(data.exercise_id) ? e.owner === null : e.owner === me);
    if (!e || !okOwner) return reject("parent_missing");
    copy = { name: e.name, nameTh: e.nameTh, trackType: e.trackType, loadMode: e.loadMode };

    const [{ total }] = await tx.select({ total: count() }).from(sessionExercise).where(eq(sessionExercise.userId, me));
    if (total >= WORKOUT_LIMITS.sessionExercisesTotal) return reject("limit_reached");
    const [{ inSession }] = await tx
      .select({ inSession: count() })
      .from(sessionExercise)
      .where(and(eq(sessionExercise.userId, me), eq(sessionExercise.sessionId, data.session_id), isNull(sessionExercise.deletedAt)));
    if (inSession >= WORKOUT_LIMITS.exercisesPerSession) return reject("limit_reached");
  }

  const rows = await tx
    .insert(sessionExercise)
    .values({
      id: o.id,
      userId: me,
      sessionId: data.session_id,
      exerciseId: data.exercise_id,
      position: data.position,
      exerciseName: copy!.name,
      exerciseNameTh: copy!.nameTh,
      trackType: copy!.trackType,
      loadMode: copy!.loadMode,
      createdAt: now,
      updatedAt: now,
      clientUpdatedAt: ts,
    })
    .onConflictDoUpdate({
      target: sessionExercise.id,
      // สำเนาไม่แตะเมื่อ upsert ครั้งหลัง
      set: { position: data.position, updatedAt: now, clientUpdatedAt: ts },
      setWhere: and(eq(sessionExercise.userId, me), isNull(sessionExercise.deletedAt), lte(sessionExercise.clientUpdatedAt, ts)),
    })
    .returning({ id: sessionExercise.id });
  if (rows.length > 0) return applied;
  const [r] = await tx.select({ u: sessionExercise.userId }).from(sessionExercise).where(eq(sessionExercise.id, o.id));
  return r && r.u !== me ? reject("id_conflict") : stale;
}

async function deleteSessionExercise(tx: Tx, me: string, id: string, now: Date): Promise<Outcome> {
  const [ex] = await tx.select({ userId: sessionExercise.userId, deletedAt: sessionExercise.deletedAt }).from(sessionExercise).where(eq(sessionExercise.id, id));
  if (!ex) return applied;
  if (ex.userId !== me) return reject("id_conflict");
  if (ex.deletedAt) return applied;
  await tx
    .update(setRecord)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(setRecord.userId, me), eq(setRecord.sessionExerciseId, id), isNull(setRecord.deletedAt)));
  await tx
    .update(sessionExercise)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(sessionExercise.id, id), eq(sessionExercise.userId, me), isNull(sessionExercise.deletedAt)));
  return applied;
}

// ---------------- set_record ----------------

export async function applySetRecord(tx: Tx, me: string, o: PushOp, ts: Date, now: Date): Promise<Outcome> {
  if (o.action === "delete") return deleteSet(tx, me, o.id, now);
  const d = setRecordDataSchema.safeParse(o.data);
  if (!d.success) return reject("invalid");
  const data = d.data;

  const [ex] = await tx
    .select({
      userId: setRecord.userId,
      sessionExerciseId: setRecord.sessionExerciseId,
      deletedAt: setRecord.deletedAt,
      clientUpdatedAt: setRecord.clientUpdatedAt,
    })
    .from(setRecord)
    .where(eq(setRecord.id, o.id));
  if (ex && ex.userId !== me) return reject("id_conflict");
  if (ex && ex.sessionExerciseId !== data.session_exercise_id) return reject("invalid");
  if (ex && (ex.deletedAt || ex.clientUpdatedAt.getTime() > ts.getTime())) return stale;

  const [se] = await tx
    .select({ userId: sessionExercise.userId, deletedAt: sessionExercise.deletedAt, trackType: sessionExercise.trackType, loadMode: sessionExercise.loadMode })
    .from(sessionExercise)
    .where(eq(sessionExercise.id, data.session_exercise_id));
  if (!se || se.userId !== me) return reject("parent_missing");
  if (se.deletedAt) return stale; // ลูกของท่าในเซสชันที่ลบแล้ว (ลบชนะ)

  // ตรวจช่องตาม track_type/load_mode ของสำเนาใน session_exercise
  if (validateSetFields(data, se.trackType as TrackType, se.loadMode as LoadMode).length > 0) return reject("invalid");

  if (!ex) {
    const [{ total }] = await tx.select({ total: count() }).from(setRecord).where(eq(setRecord.userId, me));
    if (total >= WORKOUT_LIMITS.setsTotal) return reject("limit_reached");
    const [{ inEx }] = await tx
      .select({ inEx: count() })
      .from(setRecord)
      .where(and(eq(setRecord.userId, me), eq(setRecord.sessionExerciseId, data.session_exercise_id), isNull(setRecord.deletedAt)));
    if (inEx >= WORKOUT_LIMITS.setsPerExercise) return reject("limit_reached");
  }

  const si = computeSetDerived(data);
  // upsert = ทั้งแถว: ช่องที่ไม่ส่ง = null
  const values = {
    position: data.position,
    setKind: data.set_kind,
    completedAt: new Date(data.completed_at),
    weightKg: si.weight_kg,
    weightInput: data.weight_input ?? null,
    weightUnit: data.weight_unit ?? null,
    reps: data.reps ?? null,
    durationS: data.duration_s ?? null,
    distanceM: si.distance_m,
    distanceInput: data.distance_input ?? null,
    distanceUnit: data.distance_unit ?? null,
    speedMps: si.speed_mps,
    speedInput: data.speed_input ?? null,
    speedUnit: data.speed_unit ?? null,
    inclinePct: data.incline_pct ?? null,
  };
  const rows = await tx
    .insert(setRecord)
    .values({ id: o.id, userId: me, sessionExerciseId: data.session_exercise_id, ...values, createdAt: now, updatedAt: now, clientUpdatedAt: ts })
    .onConflictDoUpdate({
      target: setRecord.id,
      set: { ...values, updatedAt: now, clientUpdatedAt: ts },
      setWhere: and(eq(setRecord.userId, me), isNull(setRecord.deletedAt), lte(setRecord.clientUpdatedAt, ts)),
    })
    .returning({ id: setRecord.id });
  if (rows.length > 0) return applied;
  const [r] = await tx.select({ u: setRecord.userId }).from(setRecord).where(eq(setRecord.id, o.id));
  return r && r.u !== me ? reject("id_conflict") : stale;
}

async function deleteSet(tx: Tx, me: string, id: string, now: Date): Promise<Outcome> {
  const [ex] = await tx.select({ userId: setRecord.userId, deletedAt: setRecord.deletedAt }).from(setRecord).where(eq(setRecord.id, id));
  if (!ex) return applied;
  if (ex.userId !== me) return reject("id_conflict");
  if (ex.deletedAt) return applied;
  await tx
    .update(setRecord)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(setRecord.id, id), eq(setRecord.userId, me), isNull(setRecord.deletedAt)));
  return applied;
}
