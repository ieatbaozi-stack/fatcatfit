import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { authThrottle, user, verification } from "@/db/schema";
import { call, inviteCookie, makeAuth, newInvite, otpSignIn, type Sent } from "./testing";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

let n = 0;
const ip = () => `100.64.${Math.floor(++n / 250)}.${(n % 250) + 1}`; // IP ใหม่ทุกคำขอ (limiter ต่อ IP ไม่เกี่ยวกับเคสที่ทดสอบ)
const send = (auth: ReturnType<typeof makeAuth>["auth"], email: string, cookies = {}, from = ip()) =>
  call(auth, "/email-otp/send-verification-otp", { body: { email, type: "sign-in" }, cookies, ip: from });
const verifCount = async () => (await t.db.select().from(verification)).length;

describe("เกณฑ์ 2: ไม่มีโค้ดเชิญ → ไม่มีอีเมลถูกส่ง ไม่เกิดแถว", () => {
  it("อีเมลที่ไม่มีบัญชีและไม่มีโค้ด: ตอบเหมือนส่งจริง แต่ไม่ส่งเมล ไม่สร้าง verification ไม่สร้าง user", async () => {
    const { auth, sent } = makeAuth(t.db);
    const before = await verifCount();
    const res = await send(auth, "stranger@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sent).toHaveLength(0);
    expect(await verifCount()).toBe(before);
    expect(await t.db.select().from(user).where(eq(user.email, "stranger@example.com"))).toHaveLength(0);
  });

  it("ตอบเหมือนกันทุกไบต์ (status + body + header สำคัญ) ระหว่างอีเมลที่มีบัญชีกับที่ไม่มี", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await otpSignIn(auth, sent, "exists@example.com", inviteCookie(inv.display), ip());
    sent.length = 0;
    clock.t = new Date(clock.t.getTime() + 120_000);
    const a = await send(auth, "exists@example.com");
    const b = await send(auth, "ghost@example.com");
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
    expect(a.headers.get("content-type")).toBe(b.headers.get("content-type"));
    expect(a.headers.get("set-cookie")).toBe(b.headers.get("set-cookie"));
    expect(sent.map((s) => s.to)).toEqual(["exists@example.com"]); // มีบัญชี = ส่งจริง
  });

  it("มีโค้ดที่ยัง active → ส่งเมลและสมัครได้ · โค้ดหมด/ยกเลิกระหว่างทาง → สมัครไม่ได้", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t, 1);
    const ok = await otpSignIn(auth, sent, "withcode@example.com", inviteCookie(inv.code), ip());
    expect(ok.session).not.toBeNull();
    // โค้ดใช้ครบแล้ว: คนถัดไปไม่ได้เมล
    const before = sent.length;
    await send(auth, "second@example.com", inviteCookie(inv.code));
    expect(sent.length).toBe(before);
    // ยืนยัน OTP ของอีเมลที่ถูกกั้น = INVALID_OTP เหมือนรหัสผิด · ไม่เกิดผู้ใช้
    const v = await call(auth, "/sign-in/email-otp", { body: { email: "second@example.com", otp: "123456" }, cookies: inviteCookie(inv.code), ip: ip() });
    expect(v.status).toBe(400);
    expect(((await v.json()) as { code: string }).code).toBe("INVALID_OTP");
    expect(await t.db.select().from(user).where(eq(user.email, "second@example.com"))).toHaveLength(0);
  });

  it("type ที่ไม่ใช่ sign-in ถูกปฏิเสธ (400) ก่อนทำอะไร", async () => {
    const { auth, sent } = makeAuth(t.db);
    for (const type of ["forget-password", "email-verification", "change-email"]) {
      const res = await call(auth, "/email-otp/send-verification-otp", { body: { email: "x@example.com", type }, ip: ip() });
      expect(res.status).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });

  it("เส้นทางอื่นของปลั๊กอิน/Better Auth ที่ไม่ใช้ ถูกปิด (404)", async () => {
    const { auth, sent } = makeAuth(t.db);
    for (const [path, body] of [
      ["/email-otp/request-password-reset", { email: "x@example.com" }],
      ["/email-otp/verify-email", { email: "x@example.com", otp: "123456" }],
      ["/email-otp/reset-password", { email: "x@example.com", otp: "123456", password: "x" }],
      ["/update-user", { name: "x" }],
      ["/delete-user", {}],
      ["/list-accounts", undefined],
      ["/sign-up/email", { email: "x@example.com", password: "12345678", name: "x" }],
    ] as const) {
      const res = await call(auth, path, { body, method: body ? "POST" : "GET", ip: ip() });
      expect(res.status, path).toBe(404);
    }
    expect(sent).toHaveLength(0);
  });
});

describe("เกณฑ์ 4: OTP และ rate limit", () => {
  it("OTP 6 หลัก หมดอายุ 10 นาที เก็บเป็น hash", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await send(auth, "otpcfg@example.com", inviteCookie(inv.code));
    expect(sent.at(-1)?.otp).toMatch(/^\d{6}$/);
    const [row] = await t.db.select().from(verification).where(eq(verification.identifier, "sign-in-otp-otpcfg@example.com"));
    expect(Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 1000)).toBe(600);
    expect(row.value).not.toContain(sent.at(-1)!.otp); // hashed
  });

  it("OTP หมดอายุแล้วใช้ไม่ได้", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await send(auth, "expire@example.com", inviteCookie(inv.code));
    await t.db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verification.identifier, "sign-in-otp-expire@example.com"));
    const res = await call(auth, "/sign-in/email-otp", { body: { email: "expire@example.com", otp: sent.at(-1)!.otp }, cookies: inviteCookie(inv.code), ip: ip() });
    expect(res.status).toBe(400);
    expect(await t.db.select().from(user).where(eq(user.email, "expire@example.com"))).toHaveLength(0);
  });

  it("ผิดเกิน 5 ครั้ง → รหัสนั้นใช้ไม่ได้อีก แม้ใส่ถูก ต้องขอใหม่", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await send(auth, "attempts@example.com", inviteCookie(inv.code));
    const good = sent.at(-1)!.otp;
    const wrong = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await call(auth, "/sign-in/email-otp", { body: { email: "attempts@example.com", otp: wrong }, cookies: inviteCookie(inv.code), ip: ip() });
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
    const r = await call(auth, "/sign-in/email-otp", { body: { email: "attempts@example.com", otp: good }, cookies: inviteCookie(inv.code), ip: ip() });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await t.db.select().from(user).where(eq(user.email, "attempts@example.com"))).toHaveLength(0);
  });

  it("ต่อ IP: ขอส่ง OTP เกิน 5 ครั้ง/10 นาที → 429 + X-Retry-After", async () => {
    const { auth } = makeAuth(t.db);
    const sameIp = "198.51.100.200";
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await send(auth, `ipl${i}@example.com`, {}, sameIp);
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(Number(last!.headers.get("x-retry-after"))).toBeGreaterThan(0);
  });

  it("ต่อ IP: ยืนยัน OTP เกิน 10 ครั้ง/10 นาที → 429", async () => {
    const { auth } = makeAuth(t.db);
    const sameIp = "198.51.100.201";
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await call(auth, "/sign-in/email-otp", { body: { email: "nobody@example.com", otp: "123456" }, ip: sameIp });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("ต่ออีเมล: ห่างกัน ≥ 60 วิ (429 + เวลารอ) — นับทุกคำขอ แม้อีเมลไม่มีบัญชี", async () => {
    const { auth, clock } = makeAuth(t.db);
    expect((await send(auth, "gap@example.com")).status).toBe(200);
    clock.t = new Date(clock.t.getTime() + 20_000);
    const r = await send(auth, "gap@example.com");
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("x-retry-after"))).toBe(40);
    // อีเมลอื่นไม่โดน · ครบ 60 วิแล้วผ่าน
    expect((await send(auth, "gap-other@example.com")).status).toBe(200);
    clock.t = new Date(clock.t.getTime() + 41_000);
    expect((await send(auth, "gap@example.com")).status).toBe(200);
  });

  it("ต่ออีเมล: ไม่เกิน 5 ครั้ง/ชม. และ 10 ครั้ง/วัน", async () => {
    const { auth, clock } = makeAuth(t.db);
    const codes: number[] = [];
    // ห่าง 12 นาที: ชม.แรก 5 ครั้ง ครั้งที่ 6 (ที่ +60 นาที) เป็นหน้าต่างใหม่
    for (let i = 0; i < 12; i++) {
      codes.push((await send(auth, "quota@example.com")).status);
      clock.t = new Date(clock.t.getTime() + 721_000);
    }
    // คำขอที่ 1–5 ผ่าน · 6–10 ผ่าน (ชม.ใหม่) · 11–12 ติดเพดานรายวัน
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);

    // เพดานรายชั่วโมง: ถี่กว่า 12 นาที (ห่าง 61 วิ) 5 ครั้งแล้วครั้งที่ 6 ติด
    const hourly: number[] = [];
    for (let i = 0; i < 6; i++) {
      hourly.push((await send(auth, "hourly@example.com")).status);
      clock.t = new Date(clock.t.getTime() + 61_000);
    }
    expect(hourly).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("กดขอซ้ำเร็วๆ ไม่เผาโควตารายชั่วโมง (ขั้น gap ปฏิเสธก่อน)", async () => {
    const { auth, clock } = makeAuth(t.db);
    for (let i = 0; i < 20; i++) await send(auth, "spam@example.com");
    const rows = await t.db.select().from(authThrottle).where(like(authThrottle.key, "otp-email:%"));
    const hour = rows.filter((r) => r.key.endsWith(":hour"));
    expect(hour.length).toBeGreaterThan(0);
    // ทุก key ของอีเมลนี้นับ: gap ถูกกดซ้ำ 20 ครั้ง · hour/day นับแค่ 1
    clock.t = new Date(clock.t.getTime() + 61_000);
    expect((await send(auth, "spam@example.com")).status).toBe(200);
  });

  it("key ของ throttle ไม่มีอีเมลหรือ IP ดิบ", async () => {
    const rows = await t.db.select().from(authThrottle);
    const dump = JSON.stringify(rows);
    expect(dump).not.toMatch(/@example\.com/);
    expect(dump).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });

  it("เกินเพดานรายวัน (OTP_DAILY_CAP) → 503 email_unavailable ทุกคน", async () => {
    const { auth, sent, clock } = makeAuth(t.db, { otpDailyCap: 2 });
    clock.t = new Date("2027-03-01T10:00:00.000Z"); // วันที่ยังไม่มีตัวนับจากเทสต์อื่นในฐานข้อมูลเดียวกัน
    const inv = await newInvite(t.db, clock.t, 10);
    for (const e of ["cap1@example.com", "cap2@example.com"]) {
      expect((await send(auth, e, inviteCookie(inv.code))).status).toBe(200);
    }
    expect(sent).toHaveLength(2);
    const r = await send(auth, "cap3@example.com", inviteCookie(inv.code));
    expect(r.status).toBe(503);
    expect(((await r.json()) as { code: string }).code).toBe("email_unavailable");
    // อีเมลไม่มีบัญชี/ไม่มีโค้ดก็ได้ 503 เหมือนกัน (ไม่บอกอะไรเกี่ยวกับอีเมลนั้น)
    expect((await send(auth, "cap4@example.com")).status).toBe(503);
    expect(sent).toHaveLength(2);
    // วันถัดไป (UTC) นับใหม่
    clock.t = new Date(clock.t.getTime() + 86_400_000);
    expect((await send(auth, "cap5@example.com", inviteCookie(inv.code))).status).toBe(200);
  });
});

describe("ภาษาของอีเมล OTP", () => {
  it("ไม่มี profile → ใช้ cookie NEXT_LOCALE · ค่าแปลก → th", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t, 10);
    await send(auth, "loc-en@example.com", { ...inviteCookie(inv.code), NEXT_LOCALE: "en" });
    await send(auth, "loc-x@example.com", { ...inviteCookie(inv.code), NEXT_LOCALE: "fr" });
    await send(auth, "loc-none@example.com", inviteCookie(inv.code));
    const loc = (to: string) => (sent as Sent[]).find((s) => s.to === to)?.locale;
    expect(loc("loc-en@example.com")).toBe("en");
    expect(loc("loc-x@example.com")).toBe("th");
    expect(loc("loc-none@example.com")).toBe("th");
  });
});

describe("เกณฑ์ 12: ไม่มีอีเมลดิบ/OTP/โค้ดเชิญใน log", () => {
  it("ทั้ง flow (ส่ง · กั้น · ยืนยัน · 429 · ผิด) ไม่เขียนค่าเหล่านี้ลง console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    try {
      const { auth, sent, clock } = makeAuth(t.db);
      const inv = await newInvite(t.db, clock.t);
      const email = "logcheck@example.com";
      await send(auth, "ghost-log@example.com"); // ถูกกั้น
      const { session } = await otpSignIn(auth, sent, email, inviteCookie(inv.code), "198.51.100.77");
      expect(session).not.toBeNull();
      await send(auth, email, {}, "198.51.100.78"); // 429 (gap)
      await call(auth, "/sign-in/email-otp", { body: { email, otp: "000000" }, ip: ip() }); // รหัสผิด
      const output = spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" "))).join(" | ");
      for (const secret of [email, "ghost-log@example.com", sent[0].otp, inv.code, inv.display]) {
        expect(output).not.toContain(secret);
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
