import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { account, inviteCode, user } from "@/db/schema";
import { call, inviteCookie, makeAuth, newInvite, otpSignIn } from "./testing";

// Spike A1–A3 ของ R1 — เก็บเป็นเทสต์ถาวรกันถดถอยเมื่ออัป better-auth

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

// getUserInfo ของ mock อ่านจาก idToken ทั้งก้อน
const googleToken = (email: string) => JSON.stringify({ user: { email, name: "G", emailVerified: true }, data: { sub: "sub-" + email } });
let n = 0;
const nextIp = () => `198.51.100.${++n}`; // /sign-in/social จำกัด 3 ครั้ง/10 วิ ต่อ IP — ใช้ IP แยกต่อคำขอ
const googleSignIn = (auth: ReturnType<typeof makeAuth>["auth"], email: string, cookies = {}) =>
  call(auth, "/sign-in/social", { cookies, ip: nextIp(), body: { provider: "google", idToken: { token: googleToken(email) } } });

describe("A1 ctx.getCookie ใน databaseHooks.user.create.before", () => {
  it("OTP: อ่าน cookie ได้ · ตั้ง invite_code_id ผ่าน return { data } ได้ · ใช้สิทธิ์ 1 ครั้ง", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t, 3);
    const { session } = await otpSignIn(auth, sent, "a1-otp@example.com", inviteCookie(inv.display));
    expect(session).not.toBeNull();
    const [u] = await t.db.select().from(user).where(eq(user.email, "a1-otp@example.com"));
    expect(u.inviteCodeId).toBe(inv.id);
    const [c] = await t.db.select().from(inviteCode).where(eq(inviteCode.id, inv.id));
    expect(c.usesCount).toBe(1);
  });

  it("Google (id token): อ่าน cookie ได้ในเส้นทาง OAuth", async () => {
    const { auth, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t, 3);
    const res = await googleSignIn(auth, "a1-g@example.com", inviteCookie(inv.display));
    expect(res.status).toBe(200);
    const [u] = await t.db.select().from(user).where(eq(user.email, "a1-g@example.com"));
    expect(u.inviteCodeId).toBe(inv.id);
  });

  it("ไม่มี cookie → ปฏิเสธ invite_required และไม่เกิดแถว user", async () => {
    const { auth } = makeAuth(t.db);
    const res = await googleSignIn(auth, "a1-nocookie@example.com");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("invite_required");
    expect(await t.db.select().from(user).where(eq(user.email, "a1-nocookie@example.com"))).toHaveLength(0);
  });

  it("ctx เป็น null เมื่อเรียกนอก endpoint (internalAdapter ตรงๆ) → ปฏิเสธเสมอ", async () => {
    const { auth } = makeAuth(t.db);
    const ctx = await auth.$context;
    await expect(
      ctx.internalAdapter.createUser({ email: "a1-null@example.com", name: "x", emailVerified: true }, { method: "email-otp" }),
    ).rejects.toMatchObject({ body: { code: "invite_required" } });
    expect(await t.db.select().from(user).where(eq(user.email, "a1-null@example.com"))).toHaveLength(0);
  });
});

describe("A2 Google กับ OTP อีเมลเดียวกันได้บัญชีเดียว", () => {
  it("สมัครด้วย Google แล้วเข้าด้วย OTP (ไม่ต้องมีโค้ด)", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await googleSignIn(auth, "a2-gfirst@example.com", inviteCookie(inv.display));
    const { session } = await otpSignIn(auth, sent, "a2-gfirst@example.com", {}, "203.0.113.20");
    expect(session).not.toBeNull();
    expect(await t.db.select().from(user).where(eq(user.email, "a2-gfirst@example.com"))).toHaveLength(1);
  });

  it("สมัครด้วย OTP แล้วเข้าด้วย Google (ผูกเข้าบัญชีเดิม ไม่สร้างใหม่)", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await otpSignIn(auth, sent, "a2-ofirst@example.com", inviteCookie(inv.display), "203.0.113.21");
    const res = await googleSignIn(auth, "a2-ofirst@example.com");
    expect(res.status).toBe(200);
    const rows = await t.db.select().from(user).where(eq(user.email, "a2-ofirst@example.com"));
    expect(rows).toHaveLength(1);
    const accs = await t.db.select().from(account).where(eq(account.userId, rows[0].id));
    expect(accs.map((a) => a.providerId)).toEqual(["google"]);
  });
});

describe("A3 ไม่เก็บ token ของ Google ในตาราง account", () => {
  it("access/refresh/id token เป็น null ทั้งตอนสมัครและตอนเข้าซ้ำ", async () => {
    const { auth, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    const body = {
      provider: "google",
      idToken: { token: googleToken("a3@example.com"), accessToken: "AT-secret", refreshToken: "RT-secret" },
    };
    await call(auth, "/sign-in/social", { cookies: inviteCookie(inv.display), ip: nextIp(), body });
    await call(auth, "/sign-in/social", { ip: nextIp(), body });
    const [u] = await t.db.select().from(user).where(eq(user.email, "a3@example.com"));
    const [a] = await t.db.select().from(account).where(eq(account.userId, u.id));
    expect(a.accessToken).toBeNull();
    expect(a.refreshToken).toBeNull();
    expect(a.idToken).toBeNull();
  });
});
