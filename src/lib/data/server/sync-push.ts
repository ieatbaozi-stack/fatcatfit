import "server-only";
import { and, count, eq, isNull, lte, ne } from "drizzle-orm";
import { exercise, place, user } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { EXERCISE_LIMITS } from "@/lib/data/shared/exercise-meta";
import { HttpError } from "@/lib/data/shared/http-error";
import {
  PUSH_ENTITIES,
  PUSH_LIMITS,
  PUSH_VERSION,
  exerciseDataSchema,
  placeDataSchema,
  pushBodySchema,
  pushOpSchema,
  type PushOp,
  type PushRejectCode,
  type PushResponse,
  type PushResult,
} from "@/lib/data/shared/sync";

// POST /api/sync/push (ADR 0004 ข้อ 4 · contract R2) — entity `place` `exercise`
// - แต่ละรายการอิสระ และเป็น transaction ของตัวเอง (ล็อกแถว user ของผู้ส่งก่อน → การเขียนของคนเดียวกันเรียงทีละรายการ นับขีดจำกัดไม่พลาด)
// - upsert: LWW ด้วย client_updated_at (เท่ากัน = ใช้ได้ → ส่งซ้ำได้ผลเท่าเดิม) · tombstone แล้ว = stale · id ของคนอื่น/ท่าคลัง = id_conflict
// - ช่องที่ไคลเอนต์ห้ามตั้ง (owner/user_id/source_*/license/attribution/met) = invalid ที่ zod · เซิร์ฟเวอร์ตั้งเอง
// - ทุกการเขียนผูก user_id/owner_user_id = ผู้ส่ง · การอ่านด้วย id อย่างเดียวเพื่อแยก id_conflict ใช้แค่ดูว่าเป็นของใคร ไม่คืนข้อมูลแถว

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
type Outcome = { status: "applied" | "stale" } | { status: "rejected"; code: PushRejectCode };

const applied: Outcome = { status: "applied" };
const stale: Outcome = { status: "stale" };
const reject = (code: PushRejectCode): Outcome => ({ status: "rejected", code });
const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);

export async function pushOps(db: AppDb, userId: string, body: unknown, now: Date): Promise<PushResponse> {
  const parsed = pushBodySchema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "invalid_input");
  if (parsed.data.v > PUSH_VERSION) throw new HttpError(409, "upgrade_required");

  const results: PushResult[] = [];
  for (const raw of parsed.data.ops) {
    results.push(await pushOne(db, userId, raw, now));
  }
  return { results, server_time: now.toISOString() };
}

async function pushOne(db: AppDb, userId: string, raw: unknown, now: Date): Promise<PushResult> {
  const rawOpId = (raw as { op_id?: unknown } | null)?.op_id;
  const echoId = typeof rawOpId === "string" ? rawOpId.slice(0, 64) : null;
  const op = pushOpSchema.safeParse(raw);
  if (!op.success) return { op_id: echoId, status: "rejected", code: "invalid" };
  const o = op.data;
  const done = (r: Outcome): PushResult =>
    r.status === "rejected" ? { op_id: o.op_id, status: "rejected", code: r.code } : { op_id: o.op_id, status: r.status };

  if (!(PUSH_ENTITIES as readonly string[]).includes(o.entity)) return done(reject("invalid"));

  // นาฬิกาเครื่อง: ล้ำอนาคตเกิน 24 ชม. = bad_clock · ล้ำเล็กน้อย = ใช้เวลาเซิร์ฟเวอร์แทน
  let ts = new Date(o.client_updated_at);
  if (ts.getTime() - now.getTime() > PUSH_LIMITS.maxFutureMs) return done(reject("bad_clock"));
  if (ts.getTime() > now.getTime()) ts = now;

  return db.transaction(async (tx) => {
    // ล็อกแถว user ของผู้ส่ง — การเขียนของคนเดียวกันเรียงทีละรายการ
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    if (o.entity === "place") return done(await applyPlace(tx, userId, o, ts, now));
    return done(await applyExercise(tx, userId, o, ts, now));
  });
}

// ---------------- place ----------------

async function applyPlace(tx: Tx, me: string, o: PushOp, ts: Date, now: Date): Promise<Outcome> {
  // ไม่มีปุ่มลบสถานที่ (D7: เซสชันใน R3 อ้างถึง) · ปิดทางเลี่ยงขีดจำกัดและกฎ "ต้องมีสถานที่ที่ใช้งานอยู่" ด้วย
  if (o.action === "delete") return reject("invalid");
  const d = placeDataSchema.safeParse(o.data);
  if (!d.success) return reject("invalid");
  const data = d.data;

  const [ex] = await tx
    .select({ userId: place.userId, deletedAt: place.deletedAt, clientUpdatedAt: place.clientUpdatedAt, archivedAt: place.archivedAt })
    .from(place)
    .where(eq(place.id, o.id));
  if (ex && ex.userId !== me) return reject("id_conflict");
  if (ex && (ex.deletedAt || ex.clientUpdatedAt.getTime() > ts.getTime())) return stale;

  // เก็บเข้ากรุได้ต่อเมื่อยังมีสถานที่อื่นที่ใช้งานอยู่อย่างน้อย 1 แห่ง
  const resultingArchived = data.archived_at !== undefined ? toDate(data.archived_at) : (ex?.archivedAt ?? null);
  if (resultingArchived) {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(place)
      .where(and(eq(place.userId, me), isNull(place.deletedAt), isNull(place.archivedAt), ne(place.id, o.id)));
    if (n === 0) return reject("invalid");
  }

  // ขีดจำกัดนับเฉพาะแถวที่ใช้งานอยู่ (ไม่ลบ ไม่เก็บเข้ากรุ) · สร้างแถวใช้งานใหม่ หรือเอาออกจากกรุ ตอนเต็ม = limit_reached
  if (!resultingArchived && (!ex || ex.archivedAt)) {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(place)
      .where(and(eq(place.userId, me), isNull(place.deletedAt), isNull(place.archivedAt)));
    if (n >= EXERCISE_LIMITS.maxPlaces) return reject("limit_reached");
  }

  const rows = await tx
    .insert(place)
    .values({
      id: o.id,
      userId: me,
      name: data.name,
      lastUsedAt: toDate(data.last_used_at),
      archivedAt: toDate(data.archived_at),
      createdAt: now,
      updatedAt: now,
      clientUpdatedAt: ts,
    })
    .onConflictDoUpdate({
      target: place.id,
      // ช่องที่ไม่ได้ส่ง = คงค่าเดิม
      set: {
        name: data.name,
        ...(data.last_used_at !== undefined ? { lastUsedAt: toDate(data.last_used_at) } : {}),
        ...(data.archived_at !== undefined ? { archivedAt: toDate(data.archived_at) } : {}),
        updatedAt: now,
        clientUpdatedAt: ts,
      },
      setWhere: and(eq(place.userId, me), isNull(place.deletedAt), lte(place.clientUpdatedAt, ts)),
    })
    .returning({ id: place.id });
  if (rows.length > 0) return applied;
  return classifyMiss(tx, me, "place", o.id);
}

// ---------------- exercise ----------------

async function applyExercise(tx: Tx, me: string, o: PushOp, ts: Date, now: Date): Promise<Outcome> {
  const [ex] = await tx
    .select({ owner: exercise.ownerUserId, deletedAt: exercise.deletedAt, archivedAt: exercise.archivedAt, clientUpdatedAt: exercise.clientUpdatedAt })
    .from(exercise)
    .where(eq(exercise.id, o.id));
  // ท่าคลังกลาง (owner null) และท่าของคนอื่น = id_conflict เหมือนกัน (ไม่บอกว่าเป็นของใคร)
  if (ex && ex.owner !== me) return reject("id_conflict");

  if (o.action === "delete") {
    if (!ex) return applied; // ไม่มีอยู่ = ถือว่าลบแล้ว
    // R3: เพิ่มตรวจ exercise_has_history ที่นี่ (ท่าที่มีเซ็ตแล้วลบไม่ได้ → archived_at)
    if (!ex.deletedAt) {
      await tx
        .update(exercise)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(exercise.id, o.id), eq(exercise.ownerUserId, me), isNull(exercise.deletedAt)));
    }
    return applied;
  }

  const d = exerciseDataSchema.safeParse(o.data);
  if (!d.success) return reject("invalid");
  const data = d.data;

  if (ex && (ex.deletedAt || ex.clientUpdatedAt.getTime() > ts.getTime())) return stale;
  // R3: ท่าที่มีเซ็ตแล้ว เปลี่ยน track_type/load_mode ไม่ได้ (exercise_has_history)

  // ขีดจำกัดนับเฉพาะท่าที่ใช้งานอยู่ (ไม่ลบ ไม่เก็บเข้ากรุ) · สร้างท่าใช้งานใหม่ หรือเอาออกจากกรุ ตอนเต็ม = limit_reached
  const resultingArchived = data.archived_at !== undefined ? toDate(data.archived_at) : (ex?.archivedAt ?? null);
  if (!resultingArchived && (!ex || ex.archivedAt)) {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(exercise)
      .where(and(eq(exercise.ownerUserId, me), isNull(exercise.deletedAt), isNull(exercise.archivedAt)));
    if (n >= EXERCISE_LIMITS.maxMyExercises) return reject("limit_reached");
  }

  const rows = await tx
    .insert(exercise)
    .values({
      id: o.id,
      ownerUserId: me,
      name: data.name,
      trackType: data.track_type,
      loadMode: data.load_mode,
      isUnilateral: data.is_unilateral,
      category: data.category,
      equipment: data.equipment ?? null,
      archivedAt: toDate(data.archived_at),
      createdAt: now,
      updatedAt: now,
      clientUpdatedAt: ts,
    })
    .onConflictDoUpdate({
      target: exercise.id,
      set: {
        name: data.name,
        trackType: data.track_type,
        loadMode: data.load_mode,
        isUnilateral: data.is_unilateral,
        category: data.category,
        ...(data.equipment !== undefined ? { equipment: data.equipment } : {}),
        ...(data.archived_at !== undefined ? { archivedAt: toDate(data.archived_at) } : {}),
        updatedAt: now,
        clientUpdatedAt: ts,
      },
      setWhere: and(eq(exercise.ownerUserId, me), isNull(exercise.deletedAt), lte(exercise.clientUpdatedAt, ts)),
    })
    .returning({ id: exercise.id });
  if (rows.length > 0) return applied;
  return classifyMiss(tx, me, "exercise", o.id);
}

/** upsert ไม่โดนแถวเลย (ชนกับ id ที่โผล่มาระหว่างทาง) — แยกว่าเป็นของคนอื่นหรือเก่ากว่า */
async function classifyMiss(tx: Tx, me: string, entity: "place" | "exercise", id: string): Promise<Outcome> {
  if (entity === "place") {
    const [r] = await tx.select({ u: place.userId }).from(place).where(eq(place.id, id));
    return r && r.u !== me ? reject("id_conflict") : stale;
  }
  const [r] = await tx.select({ o: exercise.ownerUserId }).from(exercise).where(eq(exercise.id, id));
  return r && r.o !== me ? reject("id_conflict") : stale;
}
