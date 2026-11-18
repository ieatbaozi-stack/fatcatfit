import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import * as schema from "@/db/schema";
import { bodyEntry, consentRecord, place, profile, session, user, verification } from "@/db/schema";
import { inviteCookie, makeAuth, newInvite, otpSignIn, setCookies, TEST_SECRET } from "@/lib/auth/testing";
import { otpEmailKeys, otpVerificationIdentifiers } from "@/lib/auth/throttle";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";

let t: TestDb;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));

import { GET as meGet, DELETE as meDelete } from "./route";
import { POST as consentPost } from "../consent/route";
import { POST as onboardingPost } from "../onboarding/route";

const HOST = "localhost:3000";
let ipn = 0;
const NOW = new Date();

type Cookie = Record<string, string>;
const cookieHeader = (c: Cookie) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join("; ");

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

// สมัครผ่าน flow จริง (OTP + โค้ดเชิญ) แล้วคืน cookie session
async function signUp(email: string): Promise<Cookie> {
  const { auth, sent, clock } = makeAuth(t.db);
  clock.t = new Date(NOW.getTime() + ++ipn * 1000);
  const inv = await newInvite(t.db, clock.t, 1);
  const { session: s } = await otpSignIn(auth, sent, email, inviteCookie(inv.code), `203.0.113.${ipn}`);
  if (!s) throw new Error("signup failed");
  return s;
}

const uuid = () => crypto.randomUUID();
const goodOnboarding = (over: Record<string, unknown> = {}) => ({
  profile: {
    locale: "en",
    weightUnit: "lb",
    lengthUnit: "in",
    distanceUnit: "mi",
    birthYear: 1990,
    height: { value: 70, unit: "in" },
    goals: ["stronger", "show_up"],
    experience: "some",
  },
  place: { id: uuid(), name: "  Gym  " },
  bodyEntry: {
    id: uuid(),
    weight: { value: 165, unit: "lb" },
    measuredAt: new Date().toISOString(),
    localDate: new Date().toISOString().slice(0, 10),
  },
  ...over,
});

const consent = (c: Cookie, locale = "th", noticeVersion = PRIVACY_NOTICE_VERSION) =>
  consentPost(req("POST", "/api/consent", c, { noticeVersion, locale }));

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = TEST_SECRET; // getAuth() อ่านตอนสร้างครั้งแรก
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/me", () => {
  it("ไม่ล็อกอิน → 401 unauthenticated + no-store", async () => {
    const res = await meGet(req("GET", "/api/me"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "unauthenticated" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("cookie ปลอม/session ไม่มีจริง → 401", async () => {
    const res = await meGet(req("GET", "/api/me", { "better-auth.session_token": "forged.value" }));
    expect(res.status).toBe(401);
  });

  it("สามสถานะ: consent_required → onboarding_required → ready (+ no-store)", async () => {
    const c = await signUp("flow@example.com");
    const res = await meGet(req("GET", "/api/me", c));
    expect(res.headers.get("cache-control")).toBe("no-store");
    let me = await res.json();
    expect(me.state).toBe("consent_required");
    expect(me.noticeVersion).toBe(PRIVACY_NOTICE_VERSION);
    expect(me.user.email).toBe("flow@example.com");
    expect(me.profile).toBeNull();

    expect((await consent(c)).status).toBe(200);
    me = await (await meGet(req("GET", "/api/me", c))).json();
    expect(me.state).toBe("onboarding_required");
    expect(me.consent.accepted).toBe(true);

    expect((await onboardingPost(req("POST", "/api/onboarding", c, goodOnboarding()))).status).toBe(200);
    me = await (await meGet(req("GET", "/api/me", c))).json();
    expect(me.state).toBe("ready");
    expect(me.profile).toMatchObject({
      locale: "en",
      weightUnit: "lb",
      lengthUnit: "in",
      distanceUnit: "mi",
      birthYear: 1990,
      height: { value: 70, unit: "in" },
      goals: ["stronger", "show_up"],
      experience: "some",
      restSeconds: 90,
    });
    // ไม่มีข้อมูลที่ไม่ควรออก
    expect(JSON.stringify(me)).not.toMatch(/inviteCodeId|invite_code|token/i);
  });

  it("เวอร์ชันประกาศเปลี่ยน → ต้องยินยอมใหม่ (เกณฑ์ 7)", async () => {
    const c = await signUp("reconsent@example.com");
    await consent(c);
    await onboardingPost(req("POST", "/api/onboarding", c, goodOnboarding()));
    const [u] = await t.db.select().from(user).where(eq(user.email, "reconsent@example.com"));
    // จำลองว่าเคยยินยอมแค่เวอร์ชันเก่า
    await t.db.update(consentRecord).set({ noticeVersion: "2000-01-01" }).where(eq(consentRecord.userId, u.id));
    const me = await (await meGet(req("GET", "/api/me", c))).json();
    expect(me.state).toBe("consent_required");
    // และ API ข้อมูลถูกกั้น
    const res = await onboardingPost(req("POST", "/api/onboarding", c, goodOnboarding()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("consent_required");
  });
});

describe("POST /api/consent", () => {
  it("ไม่ล็อกอิน → 401", async () => {
    const res = await consentPost(req("POST", "/api/consent", undefined, { noticeVersion: PRIVACY_NOTICE_VERSION, locale: "th" }));
    expect(res.status).toBe(401);
  });

  it("บันทึกเวลา เวอร์ชัน และ locale · ส่งซ้ำไม่เกิดแถวซ้ำ", async () => {
    const c = await signUp("consent@example.com");
    const a = await consent(c, "en");
    expect(a.status).toBe(200);
    const b = await consent(c, "th");
    expect(b.status).toBe(200);
    const [u] = await t.db.select().from(user).where(eq(user.email, "consent@example.com"));
    const rows = await t.db.select().from(consentRecord).where(eq(consentRecord.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].noticeVersion).toBe(PRIVACY_NOTICE_VERSION);
    expect(rows[0].locale).toBe("en"); // ครั้งแรกชนะ
    expect(Math.abs(rows[0].acceptedAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect((await a.json()).acceptedAt).toBe((await b.json()).acceptedAt);
  });

  it("เวอร์ชันไม่ตรงปัจจุบัน → 409 notice_version_mismatch · body ผิด → 400", async () => {
    const c = await signUp("consent-bad@example.com");
    const r = await consent(c, "th", "1999-01-01");
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("notice_version_mismatch");
    const r2 = await consentPost(req("POST", "/api/consent", c, { noticeVersion: PRIVACY_NOTICE_VERSION, locale: "fr" }));
    expect(r2.status).toBe(400);
  });

  it("Origin ต่างโฮสต์ → 403 bad_origin", async () => {
    const c = await signUp("consent-origin@example.com");
    const res = await consentPost(req("POST", "/api/consent", c, { noticeVersion: PRIVACY_NOTICE_VERSION, locale: "th" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("bad_origin");
  });
});

describe("POST /api/onboarding", () => {
  it("ไม่ล็อกอิน → 401 · ยังไม่ยินยอม → 403 consent_required", async () => {
    expect((await onboardingPost(req("POST", "/api/onboarding", undefined, goodOnboarding()))).status).toBe(401);
    const c = await signUp("noconsent@example.com");
    const res = await onboardingPost(req("POST", "/api/onboarding", c, goodOnboarding()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("consent_required");
  });

  it("บันทึก profile + place + body_entry (หน่วยมาตรฐานคู่ค่าที่พิมพ์) ใน transaction เดียว", async () => {
    const c = await signUp("ob-ok@example.com");
    await consent(c);
    const body = goodOnboarding();
    const res = await onboardingPost(req("POST", "/api/onboarding", c, body));
    expect(await res.json()).toEqual({ ok: true, replay: false });
    const [u] = await t.db.select().from(user).where(eq(user.email, "ob-ok@example.com"));
    const [p] = await t.db.select().from(profile).where(eq(profile.userId, u.id));
    expect(p.heightInput).toBe(70);
    expect(p.heightM).toBeCloseTo(1.778, 4);
    expect(p.onboardedAt).toBeInstanceOf(Date);
    const [pl] = await t.db.select().from(place).where(eq(place.userId, u.id));
    expect(pl).toMatchObject({ id: body.place.id, name: "Gym" });
    const [be] = await t.db.select().from(bodyEntry).where(eq(bodyEntry.userId, u.id));
    expect(be.id).toBe(body.bodyEntry.id);
    expect(be.weightInput).toBe(165);
    expect(be.weightUnit).toBe("lb");
    expect(be.weightKg).toBeCloseTo(74.8429, 3);
    expect(be.localDate).toBe(body.bodyEntry.localDate);
  });

  it("ส่งซ้ำ id ชุดเดิม = สำเร็จไม่เกิดแถวใหม่ · id ชุดใหม่หลังกรอกแล้ว = 409 already_onboarded", async () => {
    const c = await signUp("ob-replay@example.com");
    await consent(c);
    const body = goodOnboarding();
    await onboardingPost(req("POST", "/api/onboarding", c, body));
    const again = await onboardingPost(req("POST", "/api/onboarding", c, body));
    expect(await again.json()).toEqual({ ok: true, replay: true });
    const [u] = await t.db.select().from(user).where(eq(user.email, "ob-replay@example.com"));
    expect(await t.db.select().from(place).where(eq(place.userId, u.id))).toHaveLength(1);
    expect(await t.db.select().from(bodyEntry).where(eq(bodyEntry.userId, u.id))).toHaveLength(1);
    const other = await onboardingPost(req("POST", "/api/onboarding", c, goodOnboarding()));
    expect(other.status).toBe(409);
    expect((await other.json()).code).toBe("already_onboarded");
  });

  it("ส่งพร้อมกัน 2 คำขอ (id เดียวกัน) → ได้ผู้ชนะ 1 และไม่มีแถวซ้ำ", async () => {
    const c = await signUp("ob-race@example.com");
    await consent(c);
    const body = goodOnboarding();
    const rs = await Promise.all([1, 2, 3].map(() => onboardingPost(req("POST", "/api/onboarding", c, body))));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const [u] = await t.db.select().from(user).where(eq(user.email, "ob-race@example.com"));
    expect(await t.db.select().from(place).where(eq(place.userId, u.id))).toHaveLength(1);
  });

  it.each([
    ["ขาดน้ำหนัก", (b: ReturnType<typeof goodOnboarding>) => { delete (b.bodyEntry as Record<string, unknown>).weight; }, "bodyEntry.weight", "required"],
    ["น้ำหนักต่ำเกิน", (b: ReturnType<typeof goodOnboarding>) => { b.bodyEntry.weight = { value: 10, unit: "kg" }; }, "bodyEntry.weight.value", "out_of_range"],
    ["น้ำหนัก lb เกินช่วง (ตรวจหลังแปลง)", (b: ReturnType<typeof goodOnboarding>) => { b.bodyEntry.weight = { value: 1200, unit: "lb" }; }, "bodyEntry.weight.value", "out_of_range"],
    ["ส่วนสูงเกิน", (b: ReturnType<typeof goodOnboarding>) => { b.profile.height = { value: 400, unit: "cm" }; }, "profile.height.value", "out_of_range"],
    ["ปีเกิดอนาคต", (b: ReturnType<typeof goodOnboarding>) => { b.profile.birthYear = 2999; }, "profile.birthYear", "out_of_range"],
    ["ปีเกิดไม่ใช่จำนวนเต็ม", (b: ReturnType<typeof goodOnboarding>) => { b.profile.birthYear = 1990.5; }, "profile.birthYear", "invalid"],
    ["ชื่อสถานที่ว่าง", (b: ReturnType<typeof goodOnboarding>) => { b.place.name = "   "; }, "place.name", "invalid"],
    ["id ไม่ใช่ uuid v4", (b: ReturnType<typeof goodOnboarding>) => { b.place.id = "not-a-uuid"; }, "place.id", "invalid"],
    ["เป้าหมายซ้ำ", (b: ReturnType<typeof goodOnboarding>) => { b.profile.goals = ["fitter", "fitter"]; }, "profile.goals", "invalid"],
    ["เวลาชั่งห่างปัจจุบันเกิน 2 วัน", (b: ReturnType<typeof goodOnboarding>) => { b.bodyEntry.measuredAt = "2020-01-01T00:00:00.000Z"; }, "bodyEntry.measuredAt", "out_of_range"],
    ["วันที่ท้องถิ่นไม่มีจริง", (b: ReturnType<typeof goodOnboarding>) => { b.bodyEntry.localDate = "2026-02-31"; }, "bodyEntry.localDate", "invalid"],
  ])("ค่าผิด: %s → 400 invalid_input พร้อมรหัสต่อช่อง และไม่บันทึกอะไร", async (_n, mutate, field, code) => {
    const email = `ob-bad-${++ipn}@example.com`;
    const c = await signUp(email);
    await consent(c);
    const body = goodOnboarding();
    mutate(body);
    const res = await onboardingPost(req("POST", "/api/onboarding", c, body));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.code).toBe("invalid_input");
    expect(j.fields[field]).toBe(code);
    const [u] = await t.db.select().from(user).where(eq(user.email, email));
    expect(await t.db.select().from(profile).where(eq(profile.userId, u.id))).toHaveLength(0);
    expect(await t.db.select().from(place).where(eq(place.userId, u.id))).toHaveLength(0);
  });

  it("เกณฑ์ 11: id ของสถานที่ชนกับของผู้ใช้อื่น → 409 และ transaction ย้อนกลับทั้งหมด (profile ไม่เกิด) · ข้อมูลของอีกคนไม่เปลี่ยน", async () => {
    const a = await signUp("owner-a@example.com");
    const b = await signUp("owner-b@example.com");
    await consent(a);
    await consent(b);
    const bodyA = goodOnboarding();
    await onboardingPost(req("POST", "/api/onboarding", a, bodyA));
    const evil = goodOnboarding({ place: { id: bodyA.place.id, name: "stolen" } });
    const res = await onboardingPost(req("POST", "/api/onboarding", b, evil));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("id_conflict");
    const [ub] = await t.db.select().from(user).where(eq(user.email, "owner-b@example.com"));
    expect(await t.db.select().from(profile).where(eq(profile.userId, ub.id))).toHaveLength(0);
    const [pl] = await t.db.select().from(place).where(eq(place.id, bodyA.place.id));
    expect(pl.name).toBe("Gym");
    // B ที่ส่งด้วย id ของ A หลังกรอกจริงแล้ว ก็ยังไม่ถือเป็น replay
    await onboardingPost(req("POST", "/api/onboarding", b, goodOnboarding()));
    const replayLike = await onboardingPost(req("POST", "/api/onboarding", b, goodOnboarding({ place: { id: bodyA.place.id, name: "x" }, bodyEntry: bodyA.bodyEntry })));
    expect(replayLike.status).toBe(409);
  });

  it("เกณฑ์ 11: /api/me ของแต่ละคนเห็นแค่ของตัวเอง", async () => {
    const a = await signUp("iso-a@example.com");
    const b = await signUp("iso-b@example.com");
    await consent(a);
    await onboardingPost(req("POST", "/api/onboarding", a, goodOnboarding()));
    const meA = await (await meGet(req("GET", "/api/me", a))).json();
    const meB = await (await meGet(req("GET", "/api/me", b))).json();
    expect(meA.user.email).toBe("iso-a@example.com");
    expect(meA.state).toBe("ready");
    expect(meB.user.email).toBe("iso-b@example.com");
    expect(meB.state).toBe("consent_required");
    expect(meB.profile).toBeNull();
  });
});

describe("DELETE /api/me", () => {
  it("ไม่ล็อกอิน → 401 · Origin ต่างโฮสต์ → 403", async () => {
    expect((await meDelete(req("DELETE", "/api/me"))).status).toBe(401);
    const c = await signUp("del-origin@example.com");
    const res = await meDelete(req("DELETE", "/api/me", c, undefined, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect((await meGet(req("GET", "/api/me", c))).status).toBe(200); // ยังอยู่
  });

  it("เกณฑ์ 10: ลบแล้วทุกตารางที่มี user_id/owner_user_id เหลือ 0 แถวของคนนั้น + verification + auth_throttle ของอีเมลนั้นหาย · อีกคนไม่กระทบ", async () => {
    const email = "del-all@example.com";
    const c = await signUp(email);
    const keep = await signUp("del-keep@example.com");
    for (const x of [c, keep]) {
      await consent(x);
      await onboardingPost(req("POST", "/api/onboarding", x, goodOnboarding()));
    }
    const [u] = await t.db.select().from(user).where(eq(user.email, email));
    const [k] = await t.db.select().from(user).where(eq(user.email, "del-keep@example.com"));
    // แถว OTP ค้าง + throttle ของอีเมลนี้ + ของอีกคน
    const now = new Date();
    await t.db.insert(verification).values(
      [...otpVerificationIdentifiers(email), ...otpVerificationIdentifiers("del-keep@example.com").slice(0, 1)].map((identifier) => ({
        id: crypto.randomUUID(), identifier, value: "x", expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now,
      })),
    );
    await t.db.insert(schema.authThrottle).values(
      [...otpEmailKeys(email), ...otpEmailKeys("del-keep@example.com")].map((key) => ({ key, windowStartedAt: now, count: 1, expiresAt: new Date(Date.now() + 60_000) })),
    ).onConflictDoNothing();

    const res = await meDelete(req("DELETE", "/api/me", c));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cleared = setCookies(res);
    expect(Object.keys(cleared).some((n) => n.endsWith("session_token"))).toBe(true);
    expect(res.headers.getSetCookie().every((l) => /Max-Age=0/.test(l))).toBe(true);

    // วนทุกตารางใน schema ที่มีคอลัมน์ user_id / owner_user_id (ตารางใหม่ในอนาคตถูกตรวจเอง — ADR 0003 ข้อ 5)
    const tables = Object.values(schema).filter((x) => is(x, PgTable)) as unknown as PgTable[];
    let checked = 0;
    for (const table of tables) {
      const cfg = getTableConfig(table);
      const col = cfg.columns.find((cl) => cl.name === "user_id" || cl.name === "owner_user_id");
      if (!col) continue;
      checked++;
      const [{ n }] = await t.db.select({ n: sql<number>`count(*)::int` }).from(table as unknown as typeof user).where(eq(col as unknown as typeof user.id, u.id));
      expect(n, cfg.name).toBe(0);
    }
    expect(checked).toBeGreaterThanOrEqual(5); // session account consent_record profile place body_entry
    expect(await t.db.select().from(user).where(eq(user.id, u.id))).toHaveLength(0);
    const left = await t.db.select().from(verification);
    expect(left.some((v) => otpVerificationIdentifiers(email).includes(v.identifier))).toBe(false);
    const throttles = await t.db.select().from(schema.authThrottle);
    expect(throttles.some((r) => otpEmailKeys(email).includes(r.key))).toBe(false);

    // อีกคนยังอยู่ครบ รวม verification/throttle ของเขา
    expect(await t.db.select().from(profile).where(eq(profile.userId, k.id))).toHaveLength(1);
    expect(left.some((v) => v.identifier === `sign-in-otp-del-keep@example.com`)).toBe(true);
    expect(throttles.some((r) => otpEmailKeys("del-keep@example.com").includes(r.key))).toBe(true);

    // session เดิมใช้ไม่ได้อีก
    expect((await meGet(req("GET", "/api/me", c))).status).toBe(401);
  });

  it("ไม่ใช้ LIKE: อีเมลที่มี _ ไม่ลบแถวของอีเมลอื่นที่ตรง wildcard", async () => {
    const c = await signUp("del_us@example.com"); // `_` จะจับ "delXus" ถ้าใช้ LIKE
    const now = new Date();
    await t.db.insert(verification).values({
      id: crypto.randomUUID(), identifier: "sign-in-otp-delxus@example.com", value: "x", expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now,
    });
    expect((await meDelete(req("DELETE", "/api/me", c))).status).toBe(200);
    const rows = await t.db.select().from(verification).where(eq(verification.identifier, "sign-in-otp-delxus@example.com"));
    expect(rows).toHaveLength(1);
  });
});

describe("session (เกณฑ์ 6)", () => {
  it("อายุ 90 วัน · ออกจากระบบแล้ว session ใช้ไม่ได้", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t, 1);
    const { session: s } = await otpSignIn(auth, sent, "sess@example.com", inviteCookie(inv.code), "203.0.113.250");
    const [u] = await t.db.select().from(user).where(eq(user.email, "sess@example.com"));
    const [row] = await t.db.select().from(session).where(eq(session.userId, u.id));
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(90, 1);

    expect((await meGet(req("GET", "/api/me", s!))).status).toBe(200);
    const out = await auth.handler(
      new Request(`http://${HOST}/api/auth/sign-out`, {
        method: "POST",
        headers: { cookie: cookieHeader(s!), origin: `http://${HOST}`, "content-type": "application/json", "x-forwarded-for": "203.0.113.250" },
        body: "{}",
      }),
    );
    expect(out.status).toBe(200);
    expect(await t.db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
    expect((await meGet(req("GET", "/api/me", s!))).status).toBe(401);
  });
});
