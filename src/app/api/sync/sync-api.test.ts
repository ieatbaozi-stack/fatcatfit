import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { exercise, place, user } from "@/db/schema";
import { inviteCookie, makeAuth, newInvite, otpSignIn, TEST_SECRET } from "@/lib/auth/testing";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";
import { EXERCISE_LIMITS } from "@/lib/data/shared/exercise-meta";

let t: TestDb;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));

import { POST as push } from "./push/route";
import { GET as catalogGet } from "../catalog/route";
import { GET as bootstrapGet } from "../bootstrap/route";
import { DELETE as meDelete } from "../me/route";
import { POST as consentPost } from "../consent/route";
import { POST as onboardingPost } from "../onboarding/route";

// integration: ฐานข้อมูลชั่วคราวที่รัน migration จริง + auth จริง (OTP) — สิทธิ์ 2 บัญชี A/B, idempotent, ขีดจำกัด, ลบบัญชี

const HOST = "localhost:3000";
let ipn = 0;
type Cookie = Record<string, string>;
const cookieHeader = (c: Cookie) =>
  Object.entries(c)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
const uuid = () => crypto.randomUUID();

function req(method: string, url: string, c?: Cookie, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}${url}`, {
    method,
    headers: {
      host: HOST,
      origin: `http://${HOST}`,
      "content-type": "application/json",
      ...(c ? { cookie: cookieHeader(c) } : {}),
      ...headers,
    },
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

// ผู้ใช้ที่ยินยอมแล้ว + กรอกแบบสอบถาม (มีสถานที่แรก 1 แห่ง)
async function readyUser(email: string) {
  const c = await signUp(email);
  await consentPost(req("POST", "/api/consent", c, { noticeVersion: PRIVACY_NOTICE_VERSION, locale: "th" }));
  const placeId = uuid();
  const res = await onboardingPost(
    req("POST", "/api/onboarding", c, {
      profile: {
        locale: "th",
        weightUnit: "kg",
        lengthUnit: "cm",
        distanceUnit: "km",
        birthYear: 1990,
        height: { value: 170, unit: "cm" },
        goals: ["fitter"],
        experience: null,
      },
      place: { id: placeId, name: "ยิม" },
      bodyEntry: {
        id: uuid(),
        weight: { value: 70, unit: "kg" },
        measuredAt: new Date().toISOString(),
        localDate: new Date().toISOString().slice(0, 10),
      },
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
const exData = (over: Record<string, unknown> = {}) => ({
  name: "My Move",
  track_type: "weight_reps",
  load_mode: "external",
  is_unilateral: false,
  category: "chest",
  equipment: "barbell",
  ...over,
});
const plData = (over: Record<string, unknown> = {}) => ({ name: "Home", ...over });

async function pushOps(c: Cookie | undefined, ops: unknown[], extra: Record<string, unknown> = {}) {
  const res = await push(req("POST", "/api/sync/push", c, { v: 1, ops, ...extra }));
  return { res, body: await res.clone().json() };
}
async function one(c: Cookie, o: unknown) {
  const { res, body } = await pushOps(c, [o]);
  expect(res.status).toBe(200);
  return body.results[0] as { op_id: string; status: string; code?: string };
}

const CENTRAL = uuid();
const CENTRAL_ARCHIVED = uuid();
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

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = TEST_SECRET;
  t = await createTestDb();
  await t.db.insert(exercise).values([
    centralRow(CENTRAL, "Barbell Bench Press"),
    centralRow(CENTRAL_ARCHIVED, "Old Move", {
      archivedAt: new Date("2026-01-03T00:00:00Z"),
      updatedAt: new Date("2026-01-03T00:00:00Z"),
    }),
  ]);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("การยืนยันตัวตน", () => {
  it("ไม่ล็อกอิน → 401 ทั้ง catalog / bootstrap / push", async () => {
    expect((await catalogGet(req("GET", "/api/catalog"))).status).toBe(401);
    expect((await bootstrapGet(req("GET", "/api/bootstrap"))).status).toBe(401);
    expect((await push(req("POST", "/api/sync/push", undefined, { v: 1, ops: [] }))).status).toBe(401);
  });

  it("ยังไม่ยินยอม → 403 consent_required ทั้งสามเส้น", async () => {
    const c = await signUp("noconsent@example.com");
    for (const res of [
      await catalogGet(req("GET", "/api/catalog", c)),
      await bootstrapGet(req("GET", "/api/bootstrap", c)),
      await push(req("POST", "/api/sync/push", c, { v: 1, ops: [] })),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "consent_required" });
    }
  });

  it("push ข้ามไซต์ → 403 bad_origin", async () => {
    const { c } = await readyUser("origin@example.com");
    const res = await push(req("POST", "/api/sync/push", c, { v: 1, ops: [] }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "bad_origin" });
  });
});

describe("GET /api/catalog", () => {
  it("คืนทุกแถวคลังกลาง (รวมที่เก็บเข้ากรุ) + version + ETag + 304", async () => {
    const { c } = await readyUser("cat@example.com");
    const res = await catalogGet(req("GET", "/api/catalog", c));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exercises.map((e: { name: string }) => e.name)).toEqual(["Barbell Bench Press", "Old Move"]);
    expect(body.exercises[1].archived_at).toBe("2026-01-03T00:00:00.000Z");
    expect(body.catalog_version).toBe(`2-${new Date("2026-01-03T00:00:00Z").getTime()}`);
    expect(body.exercises[0]).toMatchObject({
      id: CENTRAL,
      name_th: "ไทย",
      source_dataset: "test-dataset",
      license: "Unlicense",
      attribution: "tester",
      met: null,
    });
    // ไม่มีช่องเจ้าของ/ช่อง sync ใน catalog
    expect(body.exercises[0]).not.toHaveProperty("owner_user_id");
    const etag = res.headers.get("etag");
    expect(etag).toBe(`"${body.catalog_version}"`);

    const again = await catalogGet(req("GET", "/api/catalog", c, undefined, { "if-none-match": etag! }));
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect((await catalogGet(req("GET", "/api/catalog", c, undefined, { "if-none-match": `W/${etag}` }))).status).toBe(304);
    expect((await catalogGet(req("GET", "/api/catalog", c, undefined, { "if-none-match": '"old"' }))).status).toBe(200);
  });

  it("ไม่มีท่าของผู้ใช้ปนอยู่ และเวอร์ชันเปลี่ยนเมื่อแถวคลังเปลี่ยน", async () => {
    const { c } = await readyUser("cat-mine@example.com");
    await one(c, op("exercise", uuid(), "upsert", exData({ name: "Secret Own Move" })));
    const before = await (await catalogGet(req("GET", "/api/catalog", c))).json();
    expect(JSON.stringify(before)).not.toContain("Secret Own Move");

    const extra = uuid();
    await t.db.insert(exercise).values(centralRow(extra, "Zzz New", { updatedAt: new Date("2026-02-01T00:00:00Z") }));
    const after = await (await catalogGet(req("GET", "/api/catalog", c))).json();
    expect(after.catalog_version).not.toBe(before.catalog_version);
    expect(after.exercises).toHaveLength(3);
    await t.db.delete(exercise).where(eq(exercise.id, extra));
  });
});

describe("POST /api/sync/push — place", () => {
  it("ส่งชุดเดิมสองครั้ง = แถวเดียว ผลเท่าเดิม", async () => {
    const { c, id } = await readyUser("pl-idem@example.com");
    const pid = uuid();
    const ops = [op("place", pid, "upsert", plData({ name: "  Office  " }), ts(-5000))];
    const a = await pushOps(c, ops);
    const b = await pushOps(c, ops);
    expect(a.body.results).toEqual(b.body.results);
    expect(a.body.results[0]).toEqual({ op_id: ops[0].op_id, status: "applied" });
    const rows = await t.db.select().from(place).where(and(eq(place.userId, id), eq(place.id, pid)));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Office");
    expect(rows[0].clientUpdatedAt.toISOString()).toBe(ops[0].client_updated_at);
  });

  it("client_updated_at เก่ากว่า = stale แถวไม่เปลี่ยน · ใหม่กว่า = applied", async () => {
    const { c } = await readyUser("pl-lww@example.com");
    const pid = uuid();
    expect((await one(c, op("place", pid, "upsert", plData({ name: "V2" }), ts(-1000)))).status).toBe("applied");
    expect((await one(c, op("place", pid, "upsert", plData({ name: "V1" }), ts(-60_000)))).status).toBe("stale");
    expect((await t.db.select().from(place).where(eq(place.id, pid)))[0].name).toBe("V2");
    expect((await one(c, op("place", pid, "upsert", plData({ name: "V3" }), ts(-500)))).status).toBe("applied");
    expect((await t.db.select().from(place).where(eq(place.id, pid)))[0].name).toBe("V3");
  });

  it("เลือกชิป = upsert last_used_at (ช่องที่ไม่ส่งคงค่าเดิม) · เก็บเข้ากรุ/เอาออก", async () => {
    const { c } = await readyUser("pl-chip@example.com");
    const p2 = uuid();
    await one(c, op("place", p2, "upsert", plData({ name: "Park" }), ts(-9000)));
    const used = ts(-8000);
    expect((await one(c, op("place", p2, "upsert", plData({ name: "Park", last_used_at: used }), used))).status).toBe("applied");
    let [row] = await t.db.select().from(place).where(eq(place.id, p2));
    expect(row.lastUsedAt?.toISOString()).toBe(used);
    // เก็บเข้ากรุโดยไม่ส่ง last_used_at → คงเดิม
    expect((await one(c, op("place", p2, "upsert", plData({ name: "Park", archived_at: ts(-7000) }), ts(-7000)))).status).toBe("applied");
    [row] = await t.db.select().from(place).where(eq(place.id, p2));
    expect(row.archivedAt).not.toBeNull();
    expect(row.lastUsedAt?.toISOString()).toBe(used);
    expect((await one(c, op("place", p2, "upsert", plData({ name: "Park", archived_at: null }), ts(-6000)))).status).toBe("applied");
    [row] = await t.db.select().from(place).where(eq(place.id, p2));
    expect(row.archivedAt).toBeNull();
  });

  it("เก็บสถานที่แห่งสุดท้ายที่ใช้งานอยู่เข้ากรุไม่ได้ = rejected invalid", async () => {
    const { c, placeId } = await readyUser("pl-last@example.com");
    const r = await one(c, op("place", placeId, "upsert", plData({ name: "ยิม", archived_at: ts(0) }), ts(0)));
    expect(r).toMatchObject({ status: "rejected", code: "invalid" });
    expect((await t.db.select().from(place).where(eq(place.id, placeId)))[0].archivedAt).toBeNull();
    // มีแห่งอื่นแล้ว → เก็บแห่งเดิมได้ แต่แห่งที่เหลือเก็บไม่ได้
    const p2 = uuid();
    await one(c, op("place", p2, "upsert", plData({ name: "สำรอง" }), ts(0)));
    expect((await one(c, op("place", placeId, "upsert", plData({ name: "ยิม", archived_at: ts(0) }), ts(0)))).status).toBe("applied");
    expect((await one(c, op("place", p2, "upsert", plData({ name: "สำรอง", archived_at: ts(0) }), ts(0)))).code).toBe("invalid");
  });

  it("ไม่มีปุ่มลบสถานที่: delete = rejected invalid · ชื่อว่าง/ยาวเกิน = invalid", async () => {
    const { c, placeId } = await readyUser("pl-del@example.com");
    expect(await one(c, op("place", placeId, "delete", null))).toMatchObject({ status: "rejected", code: "invalid" });
    expect((await t.db.select().from(place).where(eq(place.id, placeId)))[0].deletedAt).toBeNull();
    expect((await one(c, op("place", uuid(), "upsert", plData({ name: "   " })))).code).toBe("invalid");
    expect((await one(c, op("place", uuid(), "upsert", plData({ name: "x".repeat(61) })))).code).toBe("invalid");
    expect((await one(c, op("place", uuid(), "upsert", plData({ name: "x".repeat(60) })))).status).toBe("applied");
  });

  it("เกิน 30 แห่ง = limit_reached · ส่งซ้ำ id เดิมที่มีอยู่ไม่โดนจำกัด", async () => {
    const { c, id, placeId } = await readyUser("pl-limit@example.com");
    const ids = [placeId];
    for (let i = 1; i < EXERCISE_LIMITS.maxPlaces; i++) {
      const pid = uuid();
      ids.push(pid);
      expect((await one(c, op("place", pid, "upsert", plData({ name: `P${i}` }), ts(-9000)))).status).toBe("applied");
    }
    expect(await one(c, op("place", uuid(), "upsert", plData({ name: "one too many" })))).toMatchObject({
      status: "rejected",
      code: "limit_reached",
    });
    expect((await one(c, op("place", ids[5], "upsert", plData({ name: "renamed" }), ts(-5000)))).status).toBe("applied");
    const rows = await t.db.select().from(place).where(and(eq(place.userId, id), isNull(place.deletedAt)));
    expect(rows).toHaveLength(EXERCISE_LIMITS.maxPlaces);
  });

  it("ส่งช่องที่ห้ามตั้ง (user_id) = invalid · id ของ B ที่ A ส่ง = id_conflict แถวไม่เปลี่ยน", async () => {
    const a = await readyUser("pl-a@example.com");
    const b = await readyUser("pl-b@example.com");
    expect((await one(a.c, op("place", uuid(), "upsert", plData({ user_id: b.id })))).code).toBe("invalid");
    const before = (await t.db.select().from(place).where(eq(place.id, b.placeId)))[0];
    expect(await one(a.c, op("place", b.placeId, "upsert", plData({ name: "hijack" }), ts(-10)))).toMatchObject({
      status: "rejected",
      code: "id_conflict",
    });
    expect(await one(a.c, op("place", b.placeId, "delete", null))).toMatchObject({ status: "rejected" });
    const after = (await t.db.select().from(place).where(eq(place.id, b.placeId)))[0];
    expect(after).toEqual(before);
    expect(after.userId).toBe(b.id);
  });
});

describe("POST /api/sync/push — exercise", () => {
  it("สร้าง: ส่งซ้ำ = แถวเดียว · เซิร์ฟเวอร์ตั้งเจ้าของ/ช่องที่มาเอง", async () => {
    const { c, id } = await readyUser("ex-idem@example.com");
    const eid = uuid();
    const ops = [op("exercise", eid, "upsert", exData({ name: "  Cable Fly  " }), ts(-4000))];
    const a = await pushOps(c, ops);
    const b = await pushOps(c, ops);
    expect(a.body.results).toEqual(b.body.results);
    expect(a.body.results[0].status).toBe("applied");
    const rows = await t.db.select().from(exercise).where(eq(exercise.id, eid));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerUserId: id,
      name: "Cable Fly",
      nameTh: null,
      sourceDataset: null,
      license: null,
      attribution: null,
      met: null,
      archivedAt: null,
      deletedAt: null,
    });
  });

  it("แก้ได้ทุกช่อง · stale เมื่อเก่ากว่า · เก็บเข้ากรุ", async () => {
    const { c } = await readyUser("ex-edit@example.com");
    const eid = uuid();
    await one(c, op("exercise", eid, "upsert", exData(), ts(-9000)));
    expect((await one(c, op("exercise", eid, "upsert", exData({ name: "Old" }), ts(-90_000)))).status).toBe("stale");
    const edited = exData({ name: "Run", track_type: "distance_duration", category: "cardio", equipment: null, is_unilateral: true });
    expect((await one(c, op("exercise", eid, "upsert", edited, ts(-8000)))).status).toBe("applied");
    let [row] = await t.db.select().from(exercise).where(eq(exercise.id, eid));
    expect(row).toMatchObject({ name: "Run", trackType: "distance_duration", category: "cardio", equipment: null, isUnilateral: true });
    const archived = { ...edited, archived_at: ts(-7000) };
    expect((await one(c, op("exercise", eid, "upsert", archived, ts(-7000)))).status).toBe("applied");
    [row] = await t.db.select().from(exercise).where(eq(exercise.id, eid));
    expect(row.archivedAt).not.toBeNull();
  });

  it("delete = tombstone · delete ซ้ำ/ไม่มีอยู่ = applied · upsert หลังลบ = stale (ลบชนะ)", async () => {
    const { c, id } = await readyUser("ex-del@example.com");
    const eid = uuid();
    await one(c, op("exercise", eid, "upsert", exData(), ts(-9000)));
    expect((await one(c, op("exercise", eid, "delete", null, ts(-8000)))).status).toBe("applied");
    expect((await one(c, op("exercise", eid, "delete", null, ts(-8000)))).status).toBe("applied");
    expect((await one(c, op("exercise", uuid(), "delete", null))).status).toBe("applied");
    expect((await one(c, op("exercise", eid, "upsert", exData({ name: "Back" }), ts(-100)))).status).toBe("stale");
    const [row] = await t.db.select().from(exercise).where(eq(exercise.id, eid));
    expect(row.deletedAt).not.toBeNull();
    expect(row.ownerUserId).toBe(id);
    // ไม่โผล่ใน bootstrap
    const bs = await (await bootstrapGet(req("GET", "/api/bootstrap", c))).json();
    expect(bs.my_exercises.some((e: { id: string }) => e.id === eid)).toBe(false);
  });

  it("ข้อมูลผิด = invalid: load_mode ผิดชนิด · หมวด/ชนิด/อุปกรณ์นอกรายการ · ชื่อ 0 หรือ 61 · ขาดช่องบังคับ", async () => {
    const { c } = await readyUser("ex-invalid@example.com");
    const bad: Array<Record<string, unknown>> = [
      exData({ track_type: "duration", load_mode: "assisted" }),
      exData({ track_type: "reps_only", load_mode: "bodyweight_plus" }),
      exData({ category: "neck" }),
      exData({ track_type: "swim" }),
      exData({ equipment: "spoon" }),
      exData({ name: "" }),
      exData({ name: "y".repeat(61) }),
      exData({ category: undefined }),
      exData({ track_type: undefined }),
      exData({ is_unilateral: "yes" }),
    ];
    for (const d of bad) expect(await one(c, op("exercise", uuid(), "upsert", d))).toMatchObject({ status: "rejected", code: "invalid" });
    // ที่ใช้ได้
    const okAssisted = exData({ track_type: "weight_reps", load_mode: "assisted", name: "Assisted Pull-up" });
    expect((await one(c, op("exercise", uuid(), "upsert", okAssisted))).status).toBe("applied");
    expect((await one(c, op("exercise", uuid(), "upsert", exData({ name: "z".repeat(60), equipment: null })))).status).toBe("applied");
  });

  it("ช่องที่ห้ามตั้ง (owner_user_id, source_*, license, attribution, met, name_th, search_terms) = invalid · ไม่เกิดแถว", async () => {
    const a = await readyUser("ex-forbid-a@example.com");
    const b = await readyUser("ex-forbid-b@example.com");
    for (const extra of [
      { owner_user_id: b.id },
      { owner_user_id: null },
      { source_dataset: "x" },
      { source_ref: "x" },
      { license: "MIT" },
      { attribution: "me" },
      { met: 9.5 },
      { name_th: "ไทย" },
      { search_terms: "a|b" },
      { user_id: b.id },
    ]) {
      const eid = uuid();
      expect(await one(a.c, op("exercise", eid, "upsert", exData(extra)))).toMatchObject({ status: "rejected", code: "invalid" });
      expect(await t.db.select().from(exercise).where(eq(exercise.id, eid))).toHaveLength(0);
    }
  });

  it("ส่งแถวกลับจาก bootstrap ได้ — ช่อง created_at/updated_at/deleted_at ถูกเพิกเฉย", async () => {
    const { c } = await readyUser("ex-echo@example.com");
    const eid = uuid();
    await one(c, op("exercise", eid, "upsert", exData(), ts(-3000)));
    const bs = await (await bootstrapGet(req("GET", "/api/bootstrap", c))).json();
    const row = bs.my_exercises.find((e: { id: string }) => e.id === eid);
    const echoed = {
      id: row.id,
      name: row.name,
      track_type: row.track_type,
      load_mode: row.load_mode,
      is_unilateral: row.is_unilateral,
      category: row.category,
      equipment: row.equipment,
      archived_at: row.archived_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      client_updated_at: row.client_updated_at,
      deleted_at: null,
    };
    expect((await one(c, op("exercise", eid, "upsert", { ...echoed, name: "Edited" }, ts(-2000)))).status).toBe("applied");
  });

  it("เกิน 300 ท่า = limit_reached · ท่าที่ลบแล้วไม่นับ · แก้ท่าเดิมตอนเต็มได้", async () => {
    const { c, id } = await readyUser("ex-limit@example.com");
    const now = new Date();
    const rows = Array.from({ length: EXERCISE_LIMITS.maxMyExercises }, (_, i) => ({
      id: uuid(),
      ownerUserId: id,
      name: `Bulk ${i}`,
      trackType: "reps_only",
      loadMode: "external",
      isUnilateral: false,
      category: "core",
      createdAt: now,
      updatedAt: now,
      clientUpdatedAt: new Date(now.getTime() - 60_000),
    }));
    await t.db.insert(exercise).values(rows);
    expect(await one(c, op("exercise", uuid(), "upsert", exData({ name: "301st" })))).toMatchObject({
      status: "rejected",
      code: "limit_reached",
    });
    const edit = exData({ name: "Bulk edited", track_type: "reps_only", category: "core" });
    expect((await one(c, op("exercise", rows[0].id, "upsert", edit, ts(-100)))).status).toBe("applied");
    expect((await one(c, op("exercise", rows[1].id, "delete", null))).status).toBe("applied");
    expect((await one(c, op("exercise", uuid(), "upsert", exData({ name: "fits now" })))).status).toBe("applied");
  });
});

describe("สิทธิ์ข้ามบัญชี (A/B) และท่าคลังกลาง", () => {
  it("B อ่านของ A ผ่าน bootstrap ไม่ได้ · push ด้วย id ของ A = id_conflict แถวของ A ไม่เปลี่ยน", async () => {
    const a = await readyUser("x-a@example.com");
    const b = await readyUser("x-b@example.com");
    const aEx = uuid();
    await one(a.c, op("exercise", aEx, "upsert", exData({ name: "A Private" }), ts(-5000)));
    await one(a.c, op("place", uuid(), "upsert", plData({ name: "A Secret Place" }), ts(-5000)));

    const bs = await (await bootstrapGet(req("GET", "/api/bootstrap", b.c))).json();
    expect(JSON.stringify(bs)).not.toMatch(/A Private|A Secret Place/);
    expect(bs.places.map((p: { id: string }) => p.id)).toEqual([b.placeId]);
    expect(bs.my_exercises).toEqual([]);

    const before = (await t.db.select().from(exercise).where(eq(exercise.id, aEx)))[0];
    expect(await one(b.c, op("exercise", aEx, "upsert", exData({ name: "hijacked" }), ts(-10)))).toMatchObject({
      status: "rejected",
      code: "id_conflict",
    });
    expect(await one(b.c, op("exercise", aEx, "delete", null))).toMatchObject({ status: "rejected", code: "id_conflict" });
    expect((await t.db.select().from(exercise).where(eq(exercise.id, aEx)))[0]).toEqual(before);
    expect(JSON.stringify(await (await bootstrapGet(req("GET", "/api/bootstrap", a.c))).json())).toContain("A Private");
  });

  it("ใครก็ push ทับ/ลบ id ท่าคลังไม่ได้ (id_conflict) · แถวคลังไม่เปลี่ยน", async () => {
    const { c } = await readyUser("x-central@example.com");
    const before = (await t.db.select().from(exercise).where(eq(exercise.id, CENTRAL)))[0];
    expect(await one(c, op("exercise", CENTRAL, "upsert", exData({ name: "Mine now" }), ts(-1)))).toMatchObject({
      status: "rejected",
      code: "id_conflict",
    });
    expect(await one(c, op("exercise", CENTRAL, "delete", null))).toMatchObject({ status: "rejected", code: "id_conflict" });
    expect((await t.db.select().from(exercise).where(eq(exercise.id, CENTRAL)))[0]).toEqual(before);
  });

  it("bootstrap คืนเฉพาะของตัวเอง + profile + catalog_version + server_time (รวมที่เก็บเข้ากรุ ไม่รวมที่ลบ)", async () => {
    const { c, id, placeId } = await readyUser("x-boot@example.com");
    const e1 = uuid();
    const e2 = uuid();
    const p2 = uuid();
    await one(c, op("exercise", e1, "upsert", exData({ name: "Keep" }), ts(-5000)));
    await one(c, op("exercise", e2, "upsert", exData({ name: "Gone" }), ts(-5000)));
    await one(c, op("exercise", e2, "delete", null));
    await one(c, op("place", p2, "upsert", plData({ name: "Second", archived_at: ts(-4000) }), ts(-4000)));
    const res = await bootstrapGet(req("GET", "/api/bootstrap", c));
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bs = await res.json();
    expect(bs.profile).toMatchObject({ locale: "th", weight_unit: "kg", height_input: 170, goals: ["fitter"] });
    expect(bs.places.map((p: { id: string }) => p.id).sort()).toEqual([placeId, p2].sort());
    expect(bs.my_exercises.map((e: { id: string }) => e.id)).toEqual([e1]);
    expect(bs.my_exercises[0].owner_user_id).toBe(id);
    expect(bs.catalog_version).toMatch(/^2-\d+$/);
    expect(Date.parse(bs.server_time)).not.toBeNaN();
  });
});

describe("รูปคำขอและนาฬิกา", () => {
  it("แต่ละรายการอิสระ: รายการเสียไม่ทำให้ที่เหลือล้ม · entity ไม่รู้จัก = invalid", async () => {
    const { c } = await readyUser("shape@example.com");
    const good = op("exercise", uuid(), "upsert", exData());
    const { res, body } = await pushOps(c, [
      { op_id: "broken", entity: "place" },
      "not-an-object",
      op("workout_session", uuid(), "upsert", {}),
      op("exercise", "not-a-uuid", "upsert", exData()),
      good,
    ]);
    expect(res.status).toBe(200);
    expect(body.results.map((r: { status: string; code?: string }) => [r.status, r.code])).toEqual([
      ["rejected", "invalid"],
      ["rejected", "invalid"],
      ["rejected", "invalid"],
      ["rejected", "invalid"],
      ["applied", undefined],
    ]);
    expect(body.results[0].op_id).toBe("broken");
    expect(body.results[1].op_id).toBeNull();
    expect(body.results[4].op_id).toBe(good.op_id);
    expect(Date.parse(body.server_time)).not.toBeNaN();
  });

  it("body ผิดรูป = 400 · ops เกิน 100 = 400 · v ใหม่กว่า = 409 upgrade_required", async () => {
    const { c } = await readyUser("body@example.com");
    expect((await push(req("POST", "/api/sync/push", c, { ops: [] }))).status).toBe(400);
    expect((await push(req("POST", "/api/sync/push", c, { v: 1, ops: "x" }))).status).toBe(400);
    expect((await push(req("POST", "/api/sync/push", c, { v: 1, ops: Array.from({ length: 101 }, () => ({})) }))).status).toBe(400);
    const up = await push(req("POST", "/api/sync/push", c, { v: 2, ops: [] }));
    expect(up.status).toBe(409);
    expect(await up.json()).toEqual({ code: "upgrade_required" });
    const badJson = new Request(`http://${HOST}/api/sync/push`, {
      method: "POST",
      headers: { host: HOST, origin: `http://${HOST}`, cookie: cookieHeader(c) },
      body: "{nope",
    });
    expect((await push(badJson)).status).toBe(400);
  });

  it("client_updated_at ล้ำอนาคตเล็กน้อย = ใช้เวลาเซิร์ฟเวอร์ · เกิน 24 ชม. = bad_clock", async () => {
    const { c } = await readyUser("clock@example.com");
    const eid = uuid();
    const t0 = Date.now();
    expect((await one(c, op("exercise", eid, "upsert", exData(), ts(60 * 60 * 1000)))).status).toBe("applied");
    const [row] = await t.db.select().from(exercise).where(eq(exercise.id, eid));
    expect(row.clientUpdatedAt.getTime()).toBeLessThan(t0 + 60_000);
    const far = uuid();
    expect(await one(c, op("exercise", far, "upsert", exData(), ts(25 * 60 * 60 * 1000)))).toMatchObject({
      status: "rejected",
      code: "bad_clock",
    });
    expect(await t.db.select().from(exercise).where(eq(exercise.id, far))).toHaveLength(0);
  });
});

describe("ลบบัญชี", () => {
  it("ท่าของฉันและสถานที่หายหมด · ท่าคลังกลางอยู่ครบ · ของคนอื่นไม่โดน", async () => {
    const a = await readyUser("acct-del@example.com");
    const k = await readyUser("acct-keep@example.com");
    await one(a.c, op("exercise", uuid(), "upsert", exData({ name: "Del 1" })));
    await one(a.c, op("exercise", uuid(), "upsert", exData({ name: "Del 2" })));
    await one(a.c, op("place", uuid(), "upsert", plData({ name: "Del place" })));
    await one(k.c, op("exercise", uuid(), "upsert", exData({ name: "Keep 1" })));
    const centralBefore = await t.db.select().from(exercise).where(isNull(exercise.ownerUserId));

    expect((await meDelete(req("DELETE", "/api/me", a.c))).status).toBe(200);
    expect(await t.db.select().from(exercise).where(eq(exercise.ownerUserId, a.id))).toHaveLength(0);
    expect(await t.db.select().from(place).where(eq(place.userId, a.id))).toHaveLength(0);
    expect(await t.db.select().from(exercise).where(isNull(exercise.ownerUserId))).toEqual(centralBefore);
    expect(await t.db.select().from(exercise).where(eq(exercise.ownerUserId, k.id))).toHaveLength(1);
    expect(await t.db.select().from(place).where(eq(place.userId, k.id))).toHaveLength(1);
  });
});
