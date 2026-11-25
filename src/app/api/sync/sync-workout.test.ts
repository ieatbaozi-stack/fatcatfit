import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import * as schema from "@/db/schema";
import { exercise, place, sessionExercise, setRecord, user, workoutSession } from "@/db/schema";
import { inviteCookie, makeAuth, newInvite, otpSignIn, TEST_SECRET } from "@/lib/auth/testing";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";
import { weightToKg } from "@/lib/data/shared/units";
import { WORKOUT_LIMITS } from "@/lib/data/shared/workout";
import type { BootstrapResponse } from "@/lib/data/shared/sync";

let t: TestDb;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));

import { POST as push } from "./push/route";
import { GET as bootstrapGet } from "../bootstrap/route";
import { DELETE as meDelete } from "../me/route";
import { POST as consentPost } from "../consent/route";
import { POST as onboardingPost } from "../onboarding/route";

// integration R3a (contract เกณฑ์ 2–9, 17, 18): ฐานข้อมูลชั่วคราวที่รัน migration จริง + auth จริง · สองบัญชี A/B

const HOST = "localhost:3000";
let ipn = 100;
type Cookie = Record<string, string>;
const cookieHeader = (c: Cookie) =>
  Object.entries(c)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
const uuid = () => crypto.randomUUID();

function req(method: string, url: string, c?: Cookie, body?: unknown) {
  return new Request(`http://${HOST}${url}`, {
    method,
    headers: { host: HOST, origin: `http://${HOST}`, "content-type": "application/json", ...(c ? { cookie: cookieHeader(c) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signUp(email: string): Promise<Cookie> {
  const { auth, sent, clock } = makeAuth(t.db);
  clock.t = new Date(Date.now() + ++ipn * 1000);
  const inv = await newInvite(t.db, clock.t, 1);
  const { session } = await otpSignIn(auth, sent, email, inviteCookie(inv.code), `203.0.113.${ipn}`);
  if (!session) throw new Error("signup failed");
  return session;
}

type Me = { c: Cookie; id: string; placeId: string };
async function readyUser(email: string): Promise<Me> {
  const c = await signUp(email);
  await consentPost(req("POST", "/api/consent", c, { noticeVersion: PRIVACY_NOTICE_VERSION, locale: "th" }));
  const placeId = uuid();
  const res = await onboardingPost(
    req("POST", "/api/onboarding", c, {
      profile: { locale: "th", weightUnit: "kg", lengthUnit: "cm", distanceUnit: "km", birthYear: 1990, height: { value: 170, unit: "cm" }, goals: ["fitter"], experience: null },
      place: { id: placeId, name: "ยิม" },
      bodyEntry: { id: uuid(), weight: { value: 70, unit: "kg" }, measuredAt: new Date().toISOString(), localDate: new Date().toISOString().slice(0, 10) },
    }),
  );
  expect(res.status).toBe(200);
  const [u] = await t.db.select().from(user).where(eq(user.email, email));
  return { c, id: u.id, placeId };
}

let opn = 0;
const ts = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const op = (entity: string, id: string, action: "upsert" | "delete", data: unknown, clientUpdatedAt = ts(-1000)) => ({
  op_id: `op-${++opn}`,
  entity,
  id,
  action,
  data,
  client_updated_at: clientUpdatedAt,
});
type R = { op_id: string; status: string; code?: string };
async function pushOps(c: Cookie, ops: unknown[]) {
  const res = await push(req("POST", "/api/sync/push", c, { v: 1, ops }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: R[] }).results;
}
const one = async (c: Cookie, o: unknown) => (await pushOps(c, [o]))[0];
const boot = async (c: Cookie) => {
  const res = await bootstrapGet(req("GET", "/api/bootstrap", c));
  expect(res.status).toBe(200);
  return (await res.json()) as BootstrapResponse;
};

// ---- ตัวสร้างข้อมูล ----
const STARTED = "2026-11-24T16:50:00.000Z"; // 23:50 กรุงเทพ
const exData = (over: Record<string, unknown> = {}) => ({ name: "My Move", track_type: "weight_reps", load_mode: "external", is_unilateral: false, category: "chest", equipment: "barbell", ...over });
const sesData = (placeId: string, over: Record<string, unknown> = {}) => ({ place_id: placeId, started_at: STARTED, local_date: "2026-11-24", time_zone: "Asia/Bangkok", ...over });
const seData = (sessionId: string, exerciseId: string, position = 0) => ({ session_id: sessionId, exercise_id: exerciseId, position });
const setData = (seId: string, over: Record<string, unknown> = {}) => ({
  session_exercise_id: seId,
  position: 0,
  set_kind: "normal",
  completed_at: "2026-11-24T17:20:00.000Z",
  weight_input: 20,
  weight_unit: "kg",
  reps: 10,
  ...over,
});

const CENTRAL = "11111111-1111-5111-8111-1111111111aa"; // v5 = ท่าคลัง
const centralRow = (id: string, name: string, over: Partial<typeof exercise.$inferInsert> = {}): typeof exercise.$inferInsert => ({
  id,
  ownerUserId: null,
  name,
  nameTh: "ไทย",
  searchTerms: "a|b",
  trackType: "weight_reps",
  loadMode: "external",
  isUnilateral: false,
  category: "chest",
  equipment: "barbell",
  sourceDataset: "test-dataset",
  sourceRef: "ref",
  license: "Unlicense",
  attribution: "tester",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  clientUpdatedAt: new Date("2026-01-02T00:00:00Z"),
  ...over,
});

/** สร้างท่าของฉัน (ผ่าน push) แล้วคืน id */
async function myExercise(u: Me, over: Record<string, unknown> = {}) {
  const id = uuid();
  expect((await one(u.c, op("exercise", id, "upsert", exData(over)))).status).toBe("applied");
  return id;
}
/** เซสชัน + ท่า + n เซ็ต (ผ่าน push) */
async function mkSession(u: Me, exId: string, nSets = 2, sesOver: Record<string, unknown> = {}) {
  const sid = uuid();
  const seId = uuid();
  const setIds = Array.from({ length: nSets }, () => uuid());
  const ops = [
    op("workout_session", sid, "upsert", sesData(u.placeId, sesOver)),
    op("session_exercise", seId, "upsert", seData(sid, exId)),
    ...setIds.map((id, i) => op("set_record", id, "upsert", setData(seId, { position: i, reps: 5 + i }))),
  ];
  const res = await pushOps(u.c, ops);
  expect(res.map((r) => r.status)).toEqual(res.map(() => "applied"));
  return { sid, seId, setIds, ops };
}
const count = async (table: typeof workoutSession | typeof sessionExercise | typeof setRecord, userId: string) => {
  const rows = await t.db.select({ id: table.id }).from(table).where(eq(table.userId, userId));
  return rows.length;
};

let A: Me, B: Me;
beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = TEST_SECRET;
  t = await createTestDb();
  await t.db.insert(exercise).values([centralRow(CENTRAL, "Barbell Bench Press")]);
  A = await readyUser("w-a@example.com");
  B = await readyUser("w-b@example.com");
}, 60_000);
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("เกณฑ์ 2: migration 0005 บนฐานที่มีข้อมูล R2/CR3", () => {
  it("แถวเดิมครบ · ตารางใหม่ว่าง · CHECK ทำงาน", async () => {
    const root = path.resolve(process.cwd(), "drizzle");
    const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    const old = fs.mkdtempSync(path.join(os.tmpdir(), "fcf-mig-"));
    fs.mkdirSync(path.join(old, "meta"));
    const before = { ...journal, entries: journal.entries.filter((e) => !e.tag.startsWith("0005")) };
    expect(before.entries.length).toBe(journal.entries.length - 1);
    fs.writeFileSync(path.join(old, "meta/_journal.json"), JSON.stringify(before));
    for (const e of before.entries) fs.copyFileSync(path.join(root, `${e.tag}.sql`), path.join(old, `${e.tag}.sql`));

    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: old });
    const uid = uuid();
    const pid = uuid();
    const now = new Date();
    await db.insert(user).values({ id: uid, name: "M", email: "mig@example.com", createdAt: now, updatedAt: now });
    await db.insert(place).values({ id: pid, userId: uid, name: "เดิม", createdAt: now, updatedAt: now, clientUpdatedAt: now });
    await db.insert(exercise).values(centralRow(CENTRAL, "Old"));

    await migrate(db, { migrationsFolder: root }); // ใช้ 0005 ทับ
    expect(await db.select().from(user)).toHaveLength(1);
    expect(await db.select().from(place)).toHaveLength(1);
    expect(await db.select().from(exercise)).toHaveLength(1);
    expect(await db.select().from(workoutSession)).toHaveLength(0);
    expect(await db.select().from(sessionExercise)).toHaveLength(0);
    expect(await db.select().from(setRecord)).toHaveLength(0);

    // CHECK ในฐานข้อมูล
    const sid = uuid();
    const seId = uuid();
    await db.insert(workoutSession).values({ id: sid, userId: uid, placeId: pid, startedAt: now, localDate: "2026-11-24", timeZone: "UTC", createdAt: now, updatedAt: now, clientUpdatedAt: now });
    await db.insert(sessionExercise).values({ id: seId, userId: uid, sessionId: sid, exerciseId: CENTRAL, position: 0, exerciseName: "x", exerciseNameTh: null, trackType: "weight_reps", loadMode: "external", createdAt: now, updatedAt: now, clientUpdatedAt: now });
    const base = { userId: uid, sessionExerciseId: seId, position: 0, setKind: "normal", completedAt: now, createdAt: now, updatedAt: now, clientUpdatedAt: now };
    const okSet = { ...base, weightKg: 20, weightInput: 20, weightUnit: "kg", reps: 5 };
    await db.insert(setRecord).values({ id: uuid(), ...okSet });
    const bad: Record<string, Partial<typeof setRecord.$inferInsert>> = {
      "weight 1000.01 kg": { weightInput: 1000.01 },
      "weight 2200.01 lb": { weightUnit: "lb", weightInput: 2200.01 },
      "reps 0": { reps: 0 },
      "reps 1001": { reps: 1001 },
      "duration 86401": { durationS: 86_401 },
      "duration 0": { durationS: 0 },
      "distance 0.009 km": { distanceM: 9, distanceInput: 0.009, distanceUnit: "km" },
      "distance 620.01 mi": { distanceM: 1, distanceInput: 620.01, distanceUnit: "mi" },
      "speed 40.1 kmh": { speedMps: 1, speedInput: 40.1, speedUnit: "kmh" },
      "speed 25.1 mph": { speedMps: 1, speedInput: 25.1, speedUnit: "mph" },
      "incline -0.1": { inclinePct: -0.1 },
      "incline 40.1": { inclinePct: 40.1 },
      "ค่าไม่มีหน่วย": { weightUnit: null },
      "SI ไม่ครบชุด": { weightKg: null },
      "set_kind แปลก": { setKind: "drop" },
      "position 1001": { position: 1001 },
    };
    for (const [name, patch] of Object.entries(bad)) {
      await expect(db.insert(setRecord).values({ id: uuid(), ...okSet, ...patch }), name).rejects.toThrow();
    }
    // ขอบผ่าน
    await db.insert(setRecord).values({ id: uuid(), ...okSet, weightKg: weightToKg(2200, "lb"), weightInput: 2200, weightUnit: "lb" });
    await db.insert(setRecord).values({ id: uuid(), ...base, durationS: 86_400, inclinePct: 40, distanceM: 10, distanceInput: 0.01, distanceUnit: "km" });
    // เซสชันเกิน 24 ชม. / จบก่อนเริ่ม
    const later = new Date(now.getTime() + 24 * 3600_000 + 1);
    await expect(db.insert(workoutSession).values({ id: uuid(), userId: uid, placeId: pid, startedAt: now, endedAt: later, localDate: "2026-11-24", timeZone: "UTC", createdAt: now, updatedAt: now, clientUpdatedAt: now })).rejects.toThrow();
    await expect(db.insert(workoutSession).values({ id: uuid(), userId: uid, placeId: pid, startedAt: now, endedAt: new Date(now.getTime() - 1), localDate: "2026-11-24", timeZone: "UTC", createdAt: now, updatedAt: now, clientUpdatedAt: now })).rejects.toThrow();
    // composite FK: ลูกผูกพ่อแม่ของคนอื่นไม่ได้
    const other = uuid();
    await db.insert(user).values({ id: other, name: "O", email: "o@example.com", createdAt: now, updatedAt: now });
    await expect(db.insert(workoutSession).values({ id: uuid(), userId: other, placeId: pid, startedAt: now, localDate: "2026-11-24", timeZone: "UTC", createdAt: now, updatedAt: now, clientUpdatedAt: now })).rejects.toThrow();
    await expect(db.insert(setRecord).values({ id: uuid(), ...okSet, userId: other })).rejects.toThrow();
    await client.close();
    fs.rmSync(old, { recursive: true, force: true });
  }, 60_000);
});

describe("เกณฑ์ 4: ส่งซ้ำไม่ซ้ำแถว", () => {
  it("ชุด session + 2 ท่า + 5 เซ็ต ส่ง 3 ครั้ง (รวมครั้งที่ตัดกลางชุด) → 1/2/5 แถว", async () => {
    const ex1 = await myExercise(A);
    const sid = uuid();
    const se = [uuid(), uuid()];
    const sets = Array.from({ length: 5 }, () => uuid());
    const ops = [
      op("workout_session", sid, "upsert", sesData(A.placeId)),
      op("session_exercise", se[0], "upsert", seData(sid, ex1, 0)),
      op("session_exercise", se[1], "upsert", seData(sid, CENTRAL, 1)),
      ...sets.map((id, i) => op("set_record", id, "upsert", setData(se[i < 3 ? 0 : 1], { position: i }))),
    ];
    const r1 = await pushOps(A.c, ops.slice(0, 4)); // ตัดกลางชุด
    expect(r1.every((r) => r.status === "applied")).toBe(true);
    const r2 = await pushOps(A.c, ops);
    expect(r2.every((r) => r.status === "applied" || r.status === "stale")).toBe(true);
    const r3 = await pushOps(A.c, ops);
    expect(r3.every((r) => r.status === "applied" || r.status === "stale")).toBe(true);
    expect(await t.db.select().from(workoutSession).where(eq(workoutSession.id, sid))).toHaveLength(1);
    expect(await t.db.select().from(sessionExercise).where(eq(sessionExercise.sessionId, sid))).toHaveLength(2);
    const sc = await t.db.select().from(setRecord).where(and(eq(setRecord.userId, A.id), isNull(setRecord.deletedAt)));
    expect(sc.filter((s) => sets.includes(s.id))).toHaveLength(5);
  });

  it("เซิร์ฟเวอร์คัดลอกสำเนาท่า · คำนวณ SI เอง (lb→kg) · upsert ครั้งหลังไม่แตะสำเนา", async () => {
    const ex1 = await myExercise(A, { name: "Copy Me" });
    const sid = uuid();
    const seId = uuid();
    const setId = uuid();
    await pushOps(A.c, [
      op("workout_session", sid, "upsert", sesData(A.placeId)),
      op("session_exercise", seId, "upsert", seData(sid, ex1)),
      op("set_record", setId, "upsert", setData(seId, { weight_input: 45, weight_unit: "lb" })),
    ]);
    const [se] = await t.db.select().from(sessionExercise).where(eq(sessionExercise.id, seId));
    expect([se.exerciseName, se.trackType, se.loadMode]).toEqual(["Copy Me", "weight_reps", "external"]);
    const [s] = await t.db.select().from(setRecord).where(eq(setRecord.id, setId));
    expect(s.weightKg).toBe(weightToKg(45, "lb"));
    expect([s.weightInput, s.weightUnit]).toEqual([45, "lb"]);
    // เปลี่ยนชื่อท่า (ยังไม่มี... มีเซ็ตแล้ว แต่ชื่อแก้ได้) → ประวัติยังแสดงชื่อตอนจด
    expect((await one(A.c, op("exercise", ex1, "upsert", exData({ name: "Renamed" }), ts(-500)))).status).toBe("applied");
    expect((await one(A.c, op("session_exercise", seId, "upsert", seData(sid, ex1, 3), ts(-400)))).status).toBe("applied");
    const [se2] = await t.db.select().from(sessionExercise).where(eq(sessionExercise.id, seId));
    expect([se2.exerciseName, se2.position]).toEqual(["Copy Me", 3]);
  });

  it("ช่องที่เซิร์ฟเวอร์ตั้งเอง/ไม่รู้จัก = invalid ทุก entity", async () => {
    const ex1 = await myExercise(A);
    const m = await mkSession(A, ex1, 1);
    const bad = [
      op("workout_session", uuid(), "upsert", sesData(A.placeId, { template_id: uuid() })),
      op("workout_session", uuid(), "upsert", sesData(A.placeId, { user_id: A.id })),
      op("session_exercise", uuid(), "upsert", { ...seData(m.sid, ex1), track_type: "reps_only" }),
      op("session_exercise", uuid(), "upsert", { ...seData(m.sid, ex1), exercise_name: "x" }),
      op("set_record", uuid(), "upsert", setData(m.seId, { weight_kg: 1 })),
      op("set_record", uuid(), "upsert", setData(m.seId, { distance_m: 1 })),
    ];
    const res = await pushOps(A.c, bad);
    expect(res.map((r) => r.code)).toEqual(bad.map(() => "invalid"));
  });
});

describe("เกณฑ์ 3/5: ช่องตาม track_type · การชนกัน", () => {
  it("เซ็ตตรวจกับสำเนาของท่าในเซสชัน: ขาดช่อง ● / มีช่อง – / เกินช่วง = invalid", async () => {
    const reps = await myExercise(A, { name: "R", track_type: "reps_only", category: "core" });
    const run = await myExercise(A, { name: "Run", track_type: "distance_duration", category: "cardio" });
    const sid = uuid();
    const seR = uuid();
    const seRun = uuid();
    const seW = uuid();
    await pushOps(A.c, [
      op("workout_session", sid, "upsert", sesData(A.placeId)),
      op("session_exercise", seR, "upsert", seData(sid, reps, 0)),
      op("session_exercise", seRun, "upsert", seData(sid, run, 1)),
      op("session_exercise", seW, "upsert", seData(sid, CENTRAL, 2)),
    ]);
    const only = { weight_input: null, weight_unit: null, reps: null };
    const cases: [string, string, Record<string, unknown>, string][] = [
      ["reps_only ปกติ", seR, { ...only, reps: 10 }, "applied"],
      ["reps_only มีน้ำหนัก", seR, { reps: 10 }, "invalid"],
      ["reps_only ขาดครั้ง", seR, only, "invalid"],
      ["วิ่ง มีแค่เวลา", seRun, { ...only, duration_s: 600 }, "applied"],
      ["วิ่ง ระยะ 5 km", seRun, { ...only, duration_s: 1800, distance_input: 5, distance_unit: "km" }, "applied"],
      ["วิ่ง ขาดเวลา", seRun, { ...only, distance_input: 5, distance_unit: "km" }, "invalid"],
      ["วิ่ง มีครั้ง", seRun, { ...only, duration_s: 60, reps: 1 }, "invalid"],
      ["วิ่ง ระยะ 1000.01 km", seRun, { ...only, duration_s: 60, distance_input: 1000.01, distance_unit: "km" }, "invalid"],
      ["วิ่ง ค่าไม่มีหน่วย", seRun, { ...only, duration_s: 60, distance_input: 5 }, "invalid"],
      ["เวท ขาดน้ำหนัก", seW, { weight_input: null, weight_unit: null }, "invalid"],
      ["เวท น้ำหนัก 0 (ไม้เปล่า)", seW, { weight_input: 0 }, "applied"],
      ["เวท 2200 lb", seW, { weight_input: 2200, weight_unit: "lb" }, "applied"],
      ["เวท 1000.01 kg", seW, { weight_input: 1000.01 }, "invalid"],
      ["เวท ครั้ง 1001", seW, { reps: 1001 }, "invalid"],
      ["เวท ครั้งทศนิยมใกล้จำนวนเต็ม (SEC-M1)", seW, { reps: 10.0000001 }, "invalid"],
      ["วิ่ง เวลาทศนิยมใกล้จำนวนเต็ม (SEC-M1)", seRun, { ...only, duration_s: 60.0000001 }, "invalid"],
      ["เวท ทศนิยม 3 ตำแหน่ง", seW, { weight_input: 20.125 }, "invalid"],
      ["เวท มีเวลา", seW, { duration_s: 5 }, "invalid"],
    ];
    for (const [name, se, over, want] of cases) {
      const r = await one(A.c, op("set_record", uuid(), "upsert", setData(se, over)));
      expect(r.status === "rejected" ? r.code : r.status, name).toBe(want);
    }
  });

  it("สองเครื่องแก้เซ็ตเดียวกัน = ใหม่กว่าชนะ · ลบชนะแก้ · ลูกของเซสชันที่ลบ = stale", async () => {
    const ex1 = await myExercise(A);
    const m = await mkSession(A, ex1, 1);
    const id = m.setIds[0];
    expect((await one(A.c, op("set_record", id, "upsert", setData(m.seId, { reps: 8 }), ts(-300)))).status).toBe("applied");
    expect((await one(A.c, op("set_record", id, "upsert", setData(m.seId, { reps: 99 }), ts(-600)))).status).toBe("stale");
    expect((await t.db.select().from(setRecord).where(eq(setRecord.id, id)))[0].reps).toBe(8);
    expect((await one(A.c, op("set_record", id, "delete", undefined, ts(-700)))).status).toBe("applied"); // ลบชนะแม้เวลาเก่ากว่า
    expect((await one(A.c, op("set_record", id, "upsert", setData(m.seId, { reps: 50 }), ts(-100)))).status).toBe("stale");
    expect((await t.db.select().from(setRecord).where(eq(setRecord.id, id)))[0].deletedAt).not.toBeNull();
    // ลบซ้ำ / ไม่มีอยู่ = applied
    expect((await one(A.c, op("set_record", id, "delete", undefined))).status).toBe("applied");
    expect((await one(A.c, op("set_record", uuid(), "delete", undefined))).status).toBe("applied");

    // ลบเซสชัน → ลูกทั้งหมด tombstone (deleted_at เดียวกัน) · ลูกที่มาทีหลัง = stale
    const m2 = await mkSession(A, ex1, 2);
    expect((await one(A.c, op("workout_session", m2.sid, "delete", undefined))).status).toBe("applied");
    const rows = await t.db.select().from(setRecord).where(eq(setRecord.sessionExerciseId, m2.seId));
    const [se] = await t.db.select().from(sessionExercise).where(eq(sessionExercise.id, m2.seId));
    const [ses] = await t.db.select().from(workoutSession).where(eq(workoutSession.id, m2.sid));
    expect(new Set([...rows.map((r) => r.deletedAt?.getTime()), se.deletedAt?.getTime(), ses.deletedAt?.getTime()]).size).toBe(1);
    expect(ses.deletedAt).not.toBeNull();
    expect((await one(A.c, op("set_record", uuid(), "upsert", setData(m2.seId)))).status).toBe("stale");
    expect((await one(A.c, op("session_exercise", uuid(), "upsert", seData(m2.sid, ex1)))).status).toBe("stale");
    expect((await one(A.c, op("workout_session", m2.sid, "upsert", sesData(A.placeId), ts(-1)))).status).toBe("stale");

    // ลบท่าในเซสชัน → ตัวเอง + เซ็ต
    const m3 = await mkSession(A, ex1, 2);
    await one(A.c, op("session_exercise", m3.seId, "delete", undefined));
    expect((await t.db.select().from(setRecord).where(eq(setRecord.sessionExerciseId, m3.seId))).every((r) => r.deletedAt)).toBe(true);
    expect((await t.db.select().from(workoutSession).where(eq(workoutSession.id, m3.sid)))[0].deletedAt).toBeNull();
  });

  it("พ่อแม่ไม่มี = parent_missing · exercise_id ของคนอื่น = parent_missing · id ของคนอื่น = id_conflict", async () => {
    const exB = await myExercise(B, { name: "B only" });
    const exA = await myExercise(A);
    const mA = await mkSession(A, exA, 1);
    const sid = uuid();
    expect((await one(A.c, op("workout_session", sid, "upsert", sesData(uuid())))).code).toBe("parent_missing"); // ไม่มีสถานที่
    expect((await one(A.c, op("workout_session", uuid(), "upsert", sesData(B.placeId)))).code).toBe("parent_missing"); // สถานที่ของ B
    expect((await one(A.c, op("session_exercise", uuid(), "upsert", seData(uuid(), exA)))).code).toBe("parent_missing");
    expect((await one(A.c, op("session_exercise", uuid(), "upsert", seData(mA.sid, exB)))).code).toBe("parent_missing"); // ท่าของ B
    expect((await one(A.c, op("session_exercise", uuid(), "upsert", seData(mA.sid, uuid())))).code).toBe("parent_missing"); // ไม่มีท่า
    expect((await one(A.c, op("session_exercise", uuid(), "upsert", seData(mA.sid, "11111111-1111-5111-8111-1111111111bb")))).code).toBe("parent_missing"); // v5 ไม่ใช่คลัง
    expect((await one(A.c, op("set_record", uuid(), "upsert", setData(uuid())))).code).toBe("parent_missing");
    // v5 ที่เป็นแถวของคนอื่นในตาราง (ไม่ใช่คลัง) ก็ไม่ผ่าน
    expect((await one(A.c, op("session_exercise", uuid(), "upsert", seData(mA.sid, CENTRAL)))).status).toBe("applied");
    // B ส่ง id ของ A
    expect((await one(B.c, op("workout_session", mA.sid, "upsert", sesData(B.placeId)))).code).toBe("id_conflict");
    expect((await one(B.c, op("session_exercise", mA.seId, "upsert", seData(mA.sid, exB)))).code).toBe("id_conflict");
    expect((await one(B.c, op("set_record", mA.setIds[0], "upsert", setData(mA.seId)))).code).toBe("id_conflict");
    for (const [e, id] of [["workout_session", mA.sid], ["session_exercise", mA.seId], ["set_record", mA.setIds[0]]] as const) {
      expect((await one(B.c, op(e, id, "delete", undefined))).code, e).toBe("id_conflict");
    }
    // B สร้างลูกใต้พ่อแม่ของ A ไม่ได้
    expect((await one(B.c, op("session_exercise", uuid(), "upsert", seData(mA.sid, exB)))).code).toBe("parent_missing");
    expect((await one(B.c, op("set_record", uuid(), "upsert", setData(mA.seId)))).code).toBe("parent_missing");
    // ของ A ไม่เปลี่ยน
    const [s] = await t.db.select().from(setRecord).where(eq(setRecord.id, mA.setIds[0]));
    expect(s.deletedAt).toBeNull();
    expect(s.userId).toBe(A.id);
  });

  it("เปลี่ยน session_id / exercise_id / session_exercise_id ของแถวเดิม = invalid", async () => {
    const ex1 = await myExercise(A);
    const m = await mkSession(A, ex1, 1);
    const m2 = await mkSession(A, ex1, 1);
    expect((await one(A.c, op("session_exercise", m.seId, "upsert", seData(m2.sid, ex1), ts(-10)))).code).toBe("invalid");
    expect((await one(A.c, op("session_exercise", m.seId, "upsert", seData(m.sid, CENTRAL), ts(-10)))).code).toBe("invalid");
    expect((await one(A.c, op("set_record", m.setIds[0], "upsert", setData(m2.seId), ts(-10)))).code).toBe("invalid");
  });

  it("เซสชันที่อ้างสถานที่/ท่าที่ถูกลบจากอีกเครื่อง = รับ (FK ยังอยู่)", async () => {
    const p2 = uuid();
    expect((await one(A.c, op("place", p2, "upsert", { name: "ชั่วคราว" }))).status).toBe("applied");
    expect((await one(A.c, op("place", p2, "delete", undefined))).status).toBe("applied");
    const sid = uuid();
    expect((await one(A.c, op("workout_session", sid, "upsert", sesData(p2)))).status).toBe("applied");
    const ex2 = await myExercise(A, { name: "gone" });
    expect((await one(A.c, op("exercise", ex2, "delete", undefined))).status).toBe("applied");
    const seId = uuid();
    expect((await one(A.c, op("session_exercise", seId, "upsert", seData(sid, ex2)))).status).toBe("applied");
    expect((await t.db.select().from(sessionExercise).where(eq(sessionExercise.id, seId)))[0].exerciseName).toBe("gone");
  });

  it("เวลา: local_date ไม่ตรง started_at+time_zone = invalid · time_zone ผิด = invalid · bad_clock · ended_at เกิน 24 ชม. = invalid", async () => {
    const mk = (over: Record<string, unknown>, c = ts(-1000)) => op("workout_session", uuid(), "upsert", sesData(A.placeId, over), c);
    expect((await one(A.c, mk({ local_date: "2026-11-25" }))).code).toBe("invalid");
    expect((await one(A.c, mk({ time_zone: "Mars/Base" }))).code).toBe("invalid");
    expect((await one(A.c, mk({ ended_at: "2026-11-25T17:00:00.000Z" }))).code).toBe("invalid");
    expect((await one(A.c, mk({ ended_at: "2026-11-24T16:00:00.000Z" }))).code).toBe("invalid");
    expect((await one(A.c, mk({}, ts(2 * 24 * 3600_000)))).code).toBe("bad_clock");
    expect((await one(A.c, op("set_record", uuid(), "upsert", setData(uuid()), ts(2 * 24 * 3600_000)))).code).toBe("bad_clock");
  });

  it("เกณฑ์ 9: ข้ามเที่ยงคืน — เริ่ม 23:50 ✓ 00:20 จบ 00:40 → local_date = วันที่เริ่ม · วันเดียว 2 เซสชันได้ · ส่งซ้ำด้วยค่าเดิมหลังจบผ่าน", async () => {
    const ex1 = await myExercise(A);
    const sid = uuid();
    const seId = uuid();
    const begin = op("workout_session", sid, "upsert", sesData(A.placeId), ts(-5000));
    expect((await one(A.c, begin)).status).toBe("applied");
    expect((await one(A.c, op("session_exercise", seId, "upsert", seData(sid, ex1)))).status).toBe("applied");
    // ✓ ตอน 00:20 (เที่ยงคืนผ่านไปแล้ว)
    expect((await one(A.c, op("set_record", uuid(), "upsert", setData(seId, { completed_at: "2026-11-24T17:20:00.000Z" })))).status).toBe("applied");
    // จบ 00:40 — ไคลเอนต์ส่ง local_date/time_zone เดิมทุกครั้ง
    const end = op("workout_session", sid, "upsert", sesData(A.placeId, { ended_at: "2026-11-24T17:40:00.000Z" }), ts(-4000));
    expect((await one(A.c, end)).status).toBe("applied");
    const [row] = await t.db.select().from(workoutSession).where(eq(workoutSession.id, sid));
    expect(row.localDate).toBe("2026-11-24");
    expect(row.timeZone).toBe("Asia/Bangkok");
    // เซสชันที่สองวันเดียวกัน
    const sid2 = uuid();
    expect((await one(A.c, op("workout_session", sid2, "upsert", sesData(A.placeId, { started_at: "2026-11-24T05:00:00.000Z", local_date: "2026-11-24" })))).status).toBe("applied");
    // เปลี่ยน time zone ไปนิวยอร์กกลางเซสชัน: ถ้าไคลเอนต์ส่งวันใหม่ในโซนใหม่ไม่ตรง = invalid (ต้องส่งค่าเดิมทั้งชุด)
    expect((await one(A.c, op("workout_session", sid, "upsert", sesData(A.placeId, { time_zone: "Pacific/Auckland" }), ts(-3000)))).code).toBe("invalid");
  });
});

describe("เกณฑ์ 6: ล็อกท่าและสถานที่", () => {
  it("ท่าที่มีเซ็ต: เปลี่ยน track_type/load_mode/ลบ = exercise_has_history · เปลี่ยนชื่อได้ · ลบเซ็ตหมดแล้วเปลี่ยนได้", async () => {
    const ex1 = await myExercise(A, { name: "Lock" });
    const m = await mkSession(A, ex1, 2);
    let n = 0;
    const edit = (over: Record<string, unknown>) => op("exercise", ex1, "upsert", exData({ name: "Lock", ...over }), ts(-900 + ++n * 10));
    expect((await one(A.c, edit({ track_type: "reps_only", category: "chest" }))).code).toBe("exercise_has_history");
    expect((await one(A.c, edit({ load_mode: "assisted" }))).code).toBe("exercise_has_history");
    expect((await one(A.c, op("exercise", ex1, "delete", undefined))).code).toBe("exercise_has_history");
    expect((await one(A.c, edit({ name: "Lock 2", category: "back", equipment: null, is_unilateral: true, archived_at: ts(-5) }))).status).toBe("applied");
    expect((await one(A.c, edit({ name: "Lock 2", archived_at: null }))).status).toBe("applied");
    expect((await boot(A.c)).my_exercises.find((e) => e.id === ex1)?.has_history).toBe(true);
    // ลบเซ็ตทั้งหมด
    for (const id of m.setIds) await one(A.c, op("set_record", id, "delete", undefined));
    expect((await boot(A.c)).my_exercises.find((e) => e.id === ex1)?.has_history).toBe(false);
    expect((await one(A.c, edit({ track_type: "reps_only", category: "core" }))).status).toBe("applied");
    expect((await one(A.c, op("exercise", ex1, "delete", undefined))).status).toBe("applied");
  });

  it("ท่าที่มีเซ็ตแต่เซสชันถูกลบ (tombstone ลูก) = ไม่มีประวัติแล้ว", async () => {
    const ex1 = await myExercise(A, { name: "Lock3" });
    const m = await mkSession(A, ex1, 1);
    await one(A.c, op("workout_session", m.sid, "delete", undefined));
    expect((await one(A.c, op("exercise", ex1, "delete", undefined))).status).toBe("applied");
  });

  it("สถานที่ที่มีเซสชัน: delete = place_has_history · เก็บเข้ากรุได้ · ลบเซสชันแล้วลบได้", async () => {
    const p2 = uuid();
    await one(A.c, op("place", p2, "upsert", { name: "สถานที่ 2" }));
    const ex1 = await myExercise(A);
    const sid = uuid();
    await one(A.c, op("workout_session", sid, "upsert", sesData(p2)));
    expect((await one(A.c, op("place", p2, "delete", undefined))).code).toBe("place_has_history");
    expect((await boot(A.c)).places.find((p) => p.id === p2)?.has_sessions).toBe(true);
    expect((await one(A.c, op("place", p2, "upsert", { name: "สถานที่ 2", archived_at: ts(-100) }, ts(-200)))).status).toBe("applied");
    expect((await one(A.c, op("workout_session", sid, "delete", undefined))).status).toBe("applied");
    expect((await boot(A.c)).places.find((p) => p.id === p2)?.has_sessions).toBe(false);
    expect((await one(A.c, op("place", p2, "delete", undefined))).status).toBe("applied");
    void ex1;
  });
});

describe("เกณฑ์ 7: เพดาน D9", () => {
  it("ท่าที่ 41 ในเซสชัน / เซ็ตที่ 101 = limit_reached · ที่ลบแล้วไม่นับ", async () => {
    const u = await readyUser("w-cap@example.com");
    const sid = uuid();
    await pushOps(u.c, [op("workout_session", sid, "upsert", sesData(u.placeId))]);
    const ids = Array.from({ length: WORKOUT_LIMITS.exercisesPerSession }, () => uuid());
    for (let i = 0; i < ids.length; i += 20) {
      const res = await pushOps(u.c, ids.slice(i, i + 20).map((id, j) => op("session_exercise", id, "upsert", seData(sid, CENTRAL, i + j))));
      expect(res.every((r) => r.status === "applied")).toBe(true);
    }
    expect((await one(u.c, op("session_exercise", uuid(), "upsert", seData(sid, CENTRAL, 40)))).code).toBe("limit_reached");
    // ส่งซ้ำของเดิมไม่โดนจำกัด
    expect((await one(u.c, op("session_exercise", ids[0], "upsert", seData(sid, CENTRAL, 0)))).status).toBe("applied");
    // ลบหนึ่งท่าแล้วเพิ่มได้
    await one(u.c, op("session_exercise", ids[1], "delete", undefined));
    expect((await one(u.c, op("session_exercise", uuid(), "upsert", seData(sid, CENTRAL, 41)))).status).toBe("applied");

    const seId = ids[0];
    const sets = Array.from({ length: WORKOUT_LIMITS.setsPerExercise }, () => uuid());
    for (let i = 0; i < sets.length; i += 50) {
      const res = await pushOps(u.c, sets.slice(i, i + 50).map((id, j) => op("set_record", id, "upsert", setData(seId, { position: i + j }))));
      expect(res.every((r) => r.status === "applied")).toBe(true);
    }
    expect((await one(u.c, op("set_record", uuid(), "upsert", setData(seId, { position: 100 })))).code).toBe("limit_reached");
    await one(u.c, op("set_record", sets[0], "delete", undefined));
    expect((await one(u.c, op("set_record", uuid(), "upsert", setData(seId, { position: 100 })))).status).toBe("applied");
  }, 60_000);

  it("ส่งพร้อมกัน 2 คำขอตอนเหลือที่ 1 ที่ ไม่เกินเพดาน", async () => {
    const u = await readyUser("w-race@example.com");
    const sid = uuid();
    await pushOps(u.c, [op("workout_session", sid, "upsert", sesData(u.placeId))]);
    for (let i = 0; i < 39; i += 13) {
      await pushOps(u.c, Array.from({ length: 13 }, (_, j) => op("session_exercise", uuid(), "upsert", seData(sid, CENTRAL, i + j))));
    }
    const [r1, r2] = await Promise.all([
      one(u.c, op("session_exercise", uuid(), "upsert", seData(sid, CENTRAL, 40))),
      one(u.c, op("session_exercise", uuid(), "upsert", seData(sid, CENTRAL, 40))),
    ]);
    expect([r1.status, r2.status].sort()).toEqual(["applied", "rejected"]);
    expect([r1.code, r2.code].filter(Boolean)).toEqual(["limit_reached"]);
    const rows = await t.db.select().from(sessionExercise).where(and(eq(sessionExercise.sessionId, sid), isNull(sessionExercise.deletedAt)));
    expect(rows).toHaveLength(40);
  }, 60_000);

  it("เพดานรวมต่อคนนับแถวที่ลบแล้วด้วย: เซสชัน 20,000 · ท่าในเซสชัน 150,000 · เซ็ต 500,000", async () => {
    const u = await readyUser("w-total@example.com");
    const m = await mkSession(u, CENTRAL, 1);
    const T = `'${new Date().toISOString()}'::timestamptz`;
    const fill = async (table: string, n: number, extra: string, cols: string, vals: string) => {
      await t.client.query(
        `insert into "${table}" (id, user_id, ${cols}, created_at, updated_at, client_updated_at, deleted_at) select gen_random_uuid(), $1::uuid, ${vals}, ${T}, ${T}, ${T}, case when g % 2 = 0 then ${T} else null end from generate_series(1, ${n}) g ${extra}`,
        [u.id],
      );
    };
    // ลบแถวเดิมของผู้ใช้นี้ออกจากการนับไม่ได้ (นับทั้งหมด) → เติมให้ครบ (เพดาน − แถวที่มีอยู่)
    const ses = await count(workoutSession, u.id);
    await fill("workout_session", WORKOUT_LIMITS.sessionsTotal - ses, "", "place_id, started_at, local_date, time_zone", `'${u.placeId}', ${T}, '2026-01-01'::date, 'UTC'`);
    expect(await count(workoutSession, u.id)).toBe(WORKOUT_LIMITS.sessionsTotal);
    expect((await one(u.c, op("workout_session", uuid(), "upsert", sesData(u.placeId)))).code).toBe("limit_reached");
    expect((await one(u.c, op("workout_session", m.sid, "upsert", sesData(u.placeId), ts(-1)))).status).toBe("applied"); // แถวเดิมแก้ได้

    const se = await count(sessionExercise, u.id);
    await fill("session_exercise", WORKOUT_LIMITS.sessionExercisesTotal - se, "", "session_id, exercise_id, position, exercise_name, track_type, load_mode", `'${m.sid}', '${CENTRAL}', 0, 'x', 'weight_reps', 'external'`);
    expect((await one(u.c, op("session_exercise", uuid(), "upsert", seData(m.sid, CENTRAL)))).code).toBe("limit_reached");

    const sets = await count(setRecord, u.id);
    await fill("set_record", WORKOUT_LIMITS.setsTotal - sets, "", "session_exercise_id, position, set_kind, completed_at, reps", `'${m.seId}', 0, 'normal', ${T}, 5`);
    expect(await count(setRecord, u.id)).toBe(WORKOUT_LIMITS.setsTotal);
    // เซสชันใหม่ (ท่าที่ 1 ของเซสชันนั้น) แต่เพดานเซ็ตรวมเต็มแล้ว
    expect((await one(u.c, op("set_record", uuid(), "upsert", setData(m.seId)))).code).toBe("limit_reached");
  }, 120_000);
});

describe("bootstrap R3a และสถิติ (เกณฑ์ 8)", () => {
  it("active_sessions / recent_sessions (60 วัน) / exercise_summaries · แก้/ลบเซ็ตแล้ว bests เปลี่ยน", async () => {
    const u = await readyUser("w-boot@example.com");
    const ex1 = await myExercise(u, { name: "BootEx" });
    const day = (d: number) => new Date(Date.now() - d * 86_400_000);
    const sess = async (daysAgo: number, weights: number[], ended: boolean) => {
      const start = day(daysAgo);
      const sid = uuid();
      const seId = uuid();
      const ld = start.toISOString().slice(0, 10);
      const ops = [
        op("workout_session", sid, "upsert", sesData(u.placeId, { started_at: start.toISOString(), local_date: ld, time_zone: "UTC", ended_at: ended ? new Date(start.getTime() + 3600_000).toISOString() : null })),
        op("session_exercise", seId, "upsert", seData(sid, ex1)),
        ...weights.map((w, i) => op("set_record", uuid(), "upsert", setData(seId, { position: i, weight_input: w, completed_at: new Date(start.getTime() + 60_000 * (i + 1)).toISOString() }))),
      ];
      const res = await pushOps(u.c, ops);
      expect(res.every((r) => r.status === "applied")).toBe(true);
      return { sid, seId, setOps: ops.slice(2) };
    };
    const old = await sess(100, [100], true); // เกิน 60 วัน แต่ยังนับใน bests
    const s1 = await sess(30, [60, 70], true);
    const s2 = await sess(5, [65], true);
    const act = await sess(0, [40], false);
    const b = await boot(u.c);
    expect(b.active_sessions.map((s) => s.id)).toEqual([act.sid]);
    expect(b.active_sessions[0].place_name).toBe("ยิม");
    expect(b.active_sessions[0].exercises[0].sets).toHaveLength(1);
    expect(b.recent_sessions.map((s) => s.id)).toEqual([s1.sid, s2.sid]);
    expect(b.recent_sessions[0].exercises[0].sets.map((x) => x.weight_kg)).toEqual([60, 70]);
    const sum = b.exercise_summaries.find((x) => x.exercise_id === ex1)!;
    expect(sum.bests.max_weight_kg).toBe(100);
    expect(sum.sessions_90d).toBe(2); // s1 (30 วัน) s2 (5 วัน) · old 100 วัน · active ไม่นับ
    expect(sum.last_sets.map((x) => x.weight_kg)).toEqual([65]);
    expect(Math.abs(Date.parse(sum.last_used_at) - (day(5).getTime() + 60_000))).toBeLessThan(5000);
    // ลบเซสชันเก่า → bests ลดลงเอง
    await one(u.c, op("workout_session", old.sid, "delete", undefined));
    expect((await boot(u.c)).exercise_summaries.find((x) => x.exercise_id === ex1)!.bests.max_weight_kg).toBe(70);
    // แก้เซ็ต 70 → 50: bests = 65
    const setId = (s1.setOps[1] as { id: string }).id;
    await one(u.c, op("set_record", setId, "upsert", setData(s1.seId, { position: 1, weight_input: 50, completed_at: new Date(day(30).getTime() + 120_000).toISOString() }), ts(-10)));
    expect((await boot(u.c)).exercise_summaries.find((x) => x.exercise_id === ex1)!.bests.max_weight_kg).toBe(65);
    // ลบเซ็ต 65 → 60
    await one(u.c, op("set_record", (s2.setOps[0] as { id: string }).id, "delete", undefined));
    const after = (await boot(u.c)).exercise_summaries.find((x) => x.exercise_id === ex1)!;
    expect(after.bests.max_weight_kg).toBe(60);
    expect(after.last_sets.map((x) => x.weight_kg)).toEqual([60, 50]);
  }, 60_000);

  it("วอร์มอัพไม่นับใน bests · เซ็ตที่สำเนาไม่ตรงท่าปัจจุบันไม่นับ", async () => {
    const u = await readyUser("w-warm@example.com");
    const ex1 = await myExercise(u, { name: "Warm" });
    const sid = uuid();
    const seId = uuid();
    await pushOps(u.c, [
      op("workout_session", sid, "upsert", sesData(u.placeId, { ended_at: "2026-11-24T17:40:00.000Z" })),
      op("session_exercise", seId, "upsert", seData(sid, ex1)),
      op("set_record", uuid(), "upsert", setData(seId, { weight_input: 200, set_kind: "warmup", position: 0 })),
      op("set_record", uuid(), "upsert", setData(seId, { weight_input: 50, position: 1 })),
    ]);
    const s = (await boot(u.c)).exercise_summaries.find((x) => x.exercise_id === ex1)!;
    expect(s.bests.max_weight_kg).toBe(50);
    expect(s.last_sets).toHaveLength(2); // last_sets รวมวอร์มอัพ (ไคลเอนต์ข้ามเอง)
    // จำลองสองเครื่องแข่งกัน: ท่าเปลี่ยนชนิดหลังมีสำเนา (ผ่าน DB ตรง) → ไม่นับ
    await t.db.update(exercise).set({ trackType: "reps_only", category: "core" }).where(eq(exercise.id, ex1));
    expect((await boot(u.c)).exercise_summaries.find((x) => x.exercise_id === ex1)).toBeUndefined();
  });
});

describe("เกณฑ์ 17: สิทธิ์ข้อมูล + ลบบัญชี", () => {
  it("B อ่านของ A ผ่าน bootstrap ไม่ได้ (เซสชัน/สรุป/flag)", async () => {
    const u = await readyUser("w-priv-a@example.com");
    const v = await readyUser("w-priv-b@example.com");
    const ex1 = await myExercise(u, { name: "Private" });
    await mkSession(u, ex1, 2, { ended_at: "2026-11-24T17:40:00.000Z" });
    const a = await boot(u.c);
    expect(a.recent_sessions.length).toBe(1);
    const b = await boot(v.c);
    expect(b.recent_sessions).toEqual([]);
    expect(b.active_sessions).toEqual([]);
    expect(b.exercise_summaries).toEqual([]);
    expect(b.places.every((p) => !p.has_sessions)).toBe(true);
    expect(JSON.stringify(b)).not.toContain(u.id);
    // ท่าคลังที่ A ใช้ ไม่ปรากฏในสรุปของ B
    expect(b.exercise_summaries.find((s) => s.exercise_id === CENTRAL)).toBeUndefined();
  });

  it("ลบบัญชี → 0 แถวในตารางใหม่ของคนนั้น · ท่าคลังอยู่ครบ · ของคนอื่นไม่โดน", async () => {
    const u = await readyUser("w-del@example.com");
    const k = await readyUser("w-keep@example.com");
    const ex1 = await myExercise(u, { name: "Del" });
    await mkSession(u, ex1, 3);
    await mkSession(u, CENTRAL, 2);
    await mkSession(k, CENTRAL, 2);
    expect(await count(setRecord, u.id)).toBe(5);
    expect((await meDelete(req("DELETE", "/api/me", u.c))).status).toBe(200);
    for (const table of [workoutSession, sessionExercise, setRecord] as const) {
      expect(await count(table, u.id)).toBe(0);
      expect(await count(table, k.id)).toBeGreaterThan(0);
    }
    expect(await t.db.select().from(exercise).where(eq(exercise.id, CENTRAL))).toHaveLength(1);
  });
});

describe("เกณฑ์ 18: วัดขนาดและเวลา (ผู้ใช้จำลอง 1 ปี: 4 เซสชัน/สัปดาห์ × 6 ท่า × 4 เซ็ต)", () => {
  it("bootstrap ≤ 1 MB และ ≤ 1.5 วิ · push 50 รายการ ≤ 2 วิ", async () => {
    const u = await readyUser("w-year@example.com");
    const exIds: string[] = [];
    for (let i = 0; i < 6; i++) exIds.push(await myExercise(u, { name: `Year ${i}` }));
    const now = new Date();
    const sessions = 52 * 4;
    const sesRows: (typeof workoutSession.$inferInsert)[] = [];
    const seRows: (typeof sessionExercise.$inferInsert)[] = [];
    const setRows: (typeof setRecord.$inferInsert)[] = [];
    for (let s = 0; s < sessions; s++) {
      const start = new Date(now.getTime() - (s * 365 * 86_400_000) / sessions - 3600_000 * 2);
      const sid = uuid();
      sesRows.push({ id: sid, userId: u.id, placeId: u.placeId, startedAt: start, endedAt: new Date(start.getTime() + 3600_000), localDate: start.toISOString().slice(0, 10), timeZone: "UTC", createdAt: start, updatedAt: start, clientUpdatedAt: start });
      exIds.forEach((exId, e) => {
        const seId = uuid();
        seRows.push({ id: seId, userId: u.id, sessionId: sid, exerciseId: exId, position: e, exerciseName: `Year ${e}`, exerciseNameTh: null, trackType: "weight_reps", loadMode: "external", createdAt: start, updatedAt: start, clientUpdatedAt: start });
        for (let k = 0; k < 4; k++) {
          setRows.push({ id: uuid(), userId: u.id, sessionExerciseId: seId, position: k, setKind: "normal", completedAt: new Date(start.getTime() + 60_000 * (e * 4 + k)), weightKg: 20 + k * 2.5 + e, weightInput: 20 + k * 2.5 + e, weightUnit: "kg", reps: 8 + k, createdAt: start, updatedAt: start, clientUpdatedAt: start });
        }
      });
    }
    for (let i = 0; i < sesRows.length; i += 500) await t.db.insert(workoutSession).values(sesRows.slice(i, i + 500));
    for (let i = 0; i < seRows.length; i += 500) await t.db.insert(sessionExercise).values(seRows.slice(i, i + 500));
    for (let i = 0; i < setRows.length; i += 500) await t.db.insert(setRecord).values(setRows.slice(i, i + 500));

    const t0 = performance.now();
    const res = await bootstrapGet(req("GET", "/api/bootstrap", u.c));
    const text = await res.text();
    const bootMs = performance.now() - t0;
    const bytes = Buffer.byteLength(text);
    const b = JSON.parse(text) as BootstrapResponse;

    const ops = Array.from({ length: 50 }, (_, i) => op("set_record", uuid(), "upsert", setData(seRows[0].id as string, { position: 200 + i })));
    // 50 เซ็ตใต้ท่าเดียว เกิน 100? ใช้ท่าในเซสชันล่าสุดที่มี 4 เซ็ต → 54 ไม่เกิน 100
    const t1 = performance.now();
    const pr = await pushOps(u.c, ops);
    const pushMs = performance.now() - t1;
    expect(pr.every((r) => r.status === "applied")).toBe(true);

    console.log(`[R3a metrics] sessions=${sessions} sets=${setRows.length} bootstrap=${(bytes / 1024).toFixed(0)} KB ${bootMs.toFixed(0)} ms (recent=${b.recent_sessions.length}, summaries=${b.exercise_summaries.length}) · push 50 ops=${pushMs.toFixed(0)} ms`);
    expect(bytes).toBeLessThanOrEqual(1024 * 1024);
    expect(bootMs).toBeLessThanOrEqual(1500);
    expect(pushMs).toBeLessThanOrEqual(2000);
  }, 120_000);
});
