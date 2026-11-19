import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { account, authThrottle, session, user, verification } from "@/db/schema";
import { safeLog } from "./create-auth";
import { INVITE_COOKIE } from "./invite-code";
import { call, inviteCookie, makeAuth, newInvite, otpSignIn, setCookies } from "./testing";
import { clientIp, normalizeEmail, otpEmailKey } from "./throttle";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

let n = 0;
const ip = () => `100.65.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
const hour = 3_600_000;

async function snapshot(res: Response) {
  return { status: res.status, body: await res.text(), type: res.headers.get("content-type"), cookie: res.headers.get("set-cookie") };
}

describe("H1: ตรวจอีเมลก่อนส่ง OTP ด้วยกติกาเดียวกับปลั๊กอิน", () => {
  it("normalizeEmail: ตัวพิมพ์เล็กอย่างเดียว ไม่ตัดช่องว่าง", () => {
    expect(normalizeEmail("  A@Example.COM ")).toBe("  a@example.com ");
  });

  it("อีเมลหลายรูป (ช่องว่าง/tab/ตัวพิมพ์ใหญ่/รูปแบบผิด): บัญชีที่มี กับที่ไม่มี ได้ status + body ตรงกันทุกคู่", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await otpSignIn(auth, sent, "known@example.com", inviteCookie(inv.code), ip());
    const forms = (local: string) => [
      `${local}@example.com`,
      ` ${local}@example.com`,
      `${local}@example.com `,
      `\t${local}@example.com`,
      `${local}@example.com\n`,
      `${local.toUpperCase()}@Example.COM`,
      `${local}@example`,
      `${local} @example.com`,
      `${local}@@example.com`,
      "",
      local,
    ];
    for (let i = 0; i < forms("known").length; i++) {
      clock.t = new Date(clock.t.getTime() + 25 * hour);
      const withAccount = await snapshot(await call(auth, "/email-otp/send-verification-otp", { body: { email: forms("known")[i], type: "sign-in" }, ip: ip() }));
      clock.t = new Date(clock.t.getTime() + 25 * hour);
      const without = await snapshot(await call(auth, "/email-otp/send-verification-otp", { body: { email: forms("ghost")[i], type: "sign-in" }, ip: ip() }));
      expect(withAccount, `form #${i}`).toEqual(without);
      // รูปแบบที่ไม่ถูกต้อง = 400 INVALID_EMAIL เหมือนปลั๊กอิน · รูปแบบที่ถูกต้อง = 200
      const valid = i === 0 || i === 5;
      expect(withAccount.status, `form #${i}`).toBe(valid ? 200 : 400);
      if (!valid) expect((JSON.parse(withAccount.body) as { code: string }).code).toBe("INVALID_EMAIL");
    }
  });

  it("ตัวนับต่ออีเมลใช้ค่าที่ normalize แบบเดียวกัน: ตัวพิมพ์ต่างกันนับรวมเป็นอีเมลเดียว", async () => {
    const { auth } = makeAuth(t.db);
    await call(auth, "/email-otp/send-verification-otp", { body: { email: "Same@Example.com", type: "sign-in" }, ip: ip() });
    const again = await call(auth, "/email-otp/send-verification-otp", { body: { email: "SAME@example.COM", type: "sign-in" }, ip: ip() });
    expect(again.status).toBe(429);
    const rows = await t.db.select().from(authThrottle).where(eq(authThrottle.key, otpEmailKey("same@example.com", "gap")));
    expect(rows).toHaveLength(1);
  });
});

describe("M1: ยืนยัน OTP ผิดตอบเหมือนกันทั้งอีเมลที่มี OTP จริงและที่ไม่มี", () => {
  it("เดาผิด 7 ครั้ง: คำตอบทุกครั้งตรงกันและไม่สร้างแถว verification ให้อีเมลที่ไม่มีบัญชี", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await otpSignIn(auth, sent, "m1@example.com", inviteCookie(inv.code), ip());
    clock.t = new Date(clock.t.getTime() + 2 * hour);
    await call(auth, "/email-otp/send-verification-otp", { body: { email: "m1@example.com", type: "sign-in" }, ip: ip() });
    const good = sent.at(-1)!.otp;
    const wrong = good === "000000" ? "111111" : "000000";
    const before = (await t.db.select().from(verification)).length;
    for (let i = 0; i < 7; i++) {
      const a = await snapshot(await call(auth, "/sign-in/email-otp", { body: { email: "m1@example.com", otp: wrong }, ip: ip() }));
      const b = await snapshot(await call(auth, "/sign-in/email-otp", { body: { email: "nobody-m1@example.com", otp: wrong }, ip: ip() }));
      expect(a, `attempt ${i + 1}`).toEqual(b);
      expect(a.status).toBe(400);
      expect((JSON.parse(a.body) as { code: string }).code).toBe("INVALID_OTP");
    }
    const rows = await t.db.select().from(verification);
    expect(rows.some((r) => r.identifier.includes("nobody-m1"))).toBe(false);
    expect(rows.length).toBeLessThanOrEqual(before);
    expect(await t.db.select().from(user).where(eq(user.email, "nobody-m1@example.com"))).toHaveLength(0);
  });

  it("OTP หมดอายุ: ตอบเหมือนอีเมลที่ไม่มี OTP (INVALID_OTP)", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await otpSignIn(auth, sent, "m1exp@example.com", inviteCookie(inv.code), ip());
    clock.t = new Date(clock.t.getTime() + 2 * hour);
    await call(auth, "/email-otp/send-verification-otp", { body: { email: "m1exp@example.com", type: "sign-in" }, ip: ip() });
    await t.db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) });
    const a = await snapshot(await call(auth, "/sign-in/email-otp", { body: { email: "m1exp@example.com", otp: "123456" }, ip: ip() }));
    const b = await snapshot(await call(auth, "/sign-in/email-otp", { body: { email: "nobody-exp@example.com", otp: "123456" }, ip: ip() }));
    expect(a).toEqual(b);
    expect(a.status).toBe(400);
  });

  it("รหัสถูกยังเข้าได้ตามปกติ", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    const { session: s } = await otpSignIn(auth, sent, "m1ok@example.com", inviteCookie(inv.code), ip());
    expect(s).not.toBeNull();
  });
});

describe("M2 + L9: ไม่มีอีเมลผู้รับใน log เมื่อส่งเมลล้มเหลว", () => {
  it("ตัวส่งโยน error ที่มี rejected/response/อีเมลในข้อความ → ไม่มีอีเมลใน console ทุกช่องทาง", async () => {
    const victim = "victim-send@example.com";
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    try {
      let calls = 0;
      const { auth, clock } = makeAuth(t.db, {
        sendOtpEmail: async () => {
          calls++;
          throw Object.assign(new Error(`550 mailbox ${victim} unavailable`), {
            code: "EENVELOPE",
            rejected: [victim],
            response: `550 ${victim}`,
            command: "RCPT TO",
          });
        },
      });
      const inv = await newInvite(t.db, clock.t);
      const res = await call(auth, "/email-otp/send-verification-otp", { body: { email: victim, type: "sign-in" }, cookies: inviteCookie(inv.code), ip: ip() });
      expect(calls).toBe(1);
      expect(await res.text()).not.toContain(victim);
      const output = spies.flatMap((s) => s.mock.calls.map((c) => c.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))).join(" | ");
      expect(output).not.toContain(victim);
      expect(output).not.toContain(inv.code);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it("safeLog: log เฉพาะข้อความ ไม่ log object และตัดสิ่งที่เป็นอีเมล", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      (safeLog as (l: "error", m: string, ...a: unknown[]) => void)("error", "failed for who@example.com", { email: "who@example.com" }, new Error("x who@example.com"));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]).toHaveLength(1);
      expect(String(spy.mock.calls[0][0])).not.toContain("who@example.com");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("M3: ลดข้อมูลที่เก็บ", () => {
  it("สมัครด้วย OTP: session ไม่เก็บ IP/User-Agent · user ไม่รับ name/image จาก body", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    const email = "m3otp@example.com";
    const cookies = inviteCookie(inv.code);
    const from = "198.51.100.200";
    await call(auth, "/email-otp/send-verification-otp", { body: { email, type: "sign-in" }, cookies, ip: from, headers: { "user-agent": "TestAgent/1.0" } });
    const res = await call(auth, "/sign-in/email-otp", {
      body: { email, otp: sent.at(-1)!.otp, name: "Injected Name", image: "https://example.com/p.png" },
      cookies,
      ip: from,
      headers: { "user-agent": "TestAgent/1.0" },
    });
    expect(res.status).toBe(200);
    const [u] = await t.db.select().from(user).where(eq(user.email, email));
    expect(u.name).toBe("");
    expect(u.image).toBeNull();
    const [s] = await t.db.select().from(session).where(eq(session.userId, u.id));
    expect(s.ipAddress).toBeNull();
    expect(s.userAgent).toBeNull();
  });

  it("สมัครด้วย Google: เก็บชื่อ ไม่เก็บรูป · session ไม่เก็บ IP/UA · account ไม่มี token", async () => {
    const { auth, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    const tok = JSON.stringify({ user: { id: "g-m3", email: "m3g@example.com", name: "Gina", image: "https://example.com/g.png", emailVerified: true }, data: { sub: "g-m3" } });
    const res = await call(auth, "/sign-in/social", {
      body: { provider: "google", idToken: { token: tok, accessToken: "at", refreshToken: "rt" } },
      cookies: inviteCookie(inv.code),
      ip: ip(),
      headers: { "user-agent": "TestAgent/1.0" },
    });
    expect(res.status).toBe(200);
    const [u] = await t.db.select().from(user).where(eq(user.email, "m3g@example.com"));
    expect(u.name).toBe("Gina");
    expect(u.image).toBeNull();
    const [s] = await t.db.select().from(session).where(eq(session.userId, u.id));
    expect(s.ipAddress).toBeNull();
    expect(s.userAgent).toBeNull();
    const [a] = await t.db.select().from(account).where(eq(account.userId, u.id));
    expect(a.accessToken).toBeNull();
    expect(a.refreshToken).toBeNull();
    expect(a.idToken).toBeNull();
  });

  it("ล็อกอินซ้ำ: session ใหม่ก็ไม่เก็บ IP/UA · limiter ต่อ IP ยังทำงาน (ไม่ปิด IP tracking)", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    await otpSignIn(auth, sent, "m3again@example.com", inviteCookie(inv.code), ip());
    clock.t = new Date(clock.t.getTime() + 2 * hour);
    const { session: s2 } = await otpSignIn(auth, sent, "m3again@example.com", {}, ip());
    expect(s2).not.toBeNull();
    const [u] = await t.db.select().from(user).where(eq(user.email, "m3again@example.com"));
    const rows = await t.db.select().from(session).where(eq(session.userId, u.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ipAddress === null && r.userAgent === null)).toBe(true);
    const same = "198.51.100.231";
    let last = 0;
    for (let i = 0; i < 7; i++) {
      last = (await call(auth, "/email-otp/send-verification-otp", { body: { email: `lim${i}@example.com`, type: "sign-in" }, ip: same })).status;
    }
    expect(last).toBe(429);
  });
});

describe("L3: IPv6 รวมเป็น /64 ก่อน hash", () => {
  const h = (v: string) => new Headers({ "x-forwarded-for": v });
  it("ที่อยู่ในบล็อก /64 เดียวกันได้ค่าเดียวกัน · คนละบล็อกต่างกัน · IPv4 เหมือนเดิม", () => {
    expect(clientIp(h("2001:db8:1:2:aaaa:bbbb:cccc:dddd"))).toBe(clientIp(h("2001:db8:1:2:1::9")));
    expect(clientIp(h("2001:db8:1:2::1"))).not.toBe(clientIp(h("2001:db8:1:3::1")));
    expect(clientIp(h("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(h("1.2.3.4, 5.6.7.8"))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("L4: ล้าง cookie โค้ดเชิญหลังสมัครสำเร็จ", () => {
  const cleared = (res: Response) => res.headers.getSetCookie().find((l) => l.startsWith(`${INVITE_COOKIE}=`));
  const expectCleared = (line: string | undefined) => {
    expect(line).toBeDefined();
    expect(line).toMatch(/Max-Age=0/i);
    expect(line).toMatch(/Path=\/api\/auth/i);
    expect(line).toMatch(/HttpOnly/i);
  };

  it("OTP: สมัครสำเร็จ → Set-Cookie ลบ fcf_invite", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    const cookies = inviteCookie(inv.code);
    const email = "l4otp@example.com";
    await call(auth, "/email-otp/send-verification-otp", { body: { email, type: "sign-in" }, cookies, ip: ip() });
    const res = await call(auth, "/sign-in/email-otp", { body: { email, otp: sent.at(-1)!.otp }, cookies, ip: ip() });
    expect(res.status).toBe(200);
    expectCleared(cleared(res));
  });

  it("OTP ผิด: ยังไม่ล้าง (ผู้ใช้ยังต้องลองใหม่)", async () => {
    const { auth, sent, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    const cookies = inviteCookie(inv.code);
    await call(auth, "/email-otp/send-verification-otp", { body: { email: "l4bad@example.com", type: "sign-in" }, cookies, ip: ip() });
    const good = sent.at(-1)!.otp;
    const res = await call(auth, "/sign-in/email-otp", { body: { email: "l4bad@example.com", otp: good === "000000" ? "111111" : "000000" }, cookies, ip: ip() });
    expect(res.status).toBe(400);
    expect(cleared(res)).toBeUndefined();
  });

  it("Google: สมัครสำเร็จ → Set-Cookie ลบ fcf_invite", async () => {
    const { auth, clock } = makeAuth(t.db);
    const inv = await newInvite(t.db, clock.t);
    const tok = JSON.stringify({ user: { id: "g-l4", email: "l4g@example.com", name: "G", emailVerified: true }, data: { sub: "g-l4" } });
    const res = await call(auth, "/sign-in/social", { body: { provider: "google", idToken: { token: tok } }, cookies: inviteCookie(inv.code), ip: ip() });
    expect(res.status).toBe(200);
    expect(Object.keys(setCookies(res)).some((k) => k.endsWith("session_token"))).toBe(true);
    expectCleared(cleared(res));
  });
});

describe("L8: ตรวจ Origin ของ Better Auth (เปิดในเทสต์ด้วย enforceOrigin)", () => {
  const evil = { origin: "https://evil.example.org" };
  it("Origin ต่างโฮสต์ → 403 บน sign-out, sign-in/email-otp, send-verification-otp (เมื่อมี cookie)", async () => {
    const { auth } = makeAuth(t.db, { enforceOrigin: true });
    const cookies = { "better-auth.session_token": "x" };
    for (const [path, body] of [
      ["/sign-out", {}],
      ["/sign-in/email-otp", { email: "a@example.com", otp: "123456" }],
      ["/email-otp/send-verification-otp", { email: "a@example.com", type: "sign-in" }],
    ] as const) {
      const res = await call(auth, path, { body, cookies, headers: evil, ip: ip() });
      expect(res.status, path).toBe(403);
    }
  });

  it("Origin ต่างโฮสต์พร้อม cookie โค้ดเชิญ (cookie ใดๆ ก็ตาม) ถูกปฏิเสธบน sign-in/email-otp และ send-verification-otp · ไม่ส่งเมล", async () => {
    const { auth, sent } = makeAuth(t.db, { enforceOrigin: true });
    const cookies = inviteCookie("ABCD-EFGH");
    for (const [path, body] of [
      ["/sign-in/email-otp", { email: "a@example.com", otp: "123456" }],
      ["/email-otp/send-verification-otp", { email: "a@example.com", type: "sign-in" }],
    ] as const) {
      const res = await call(auth, path, { body, cookies, headers: evil, ip: ip() });
      expect(res.status, path).toBe(403);
    }
    expect(sent).toHaveLength(0);
  });

  it("Origin เดียวกันผ่านตามปกติ", async () => {
    const { auth, sent, clock } = makeAuth(t.db, { enforceOrigin: true });
    const inv = await newInvite(t.db, clock.t);
    const { session: s } = await otpSignIn(auth, sent, "l8ok@example.com", inviteCookie(inv.code), ip());
    expect(s).not.toBeNull();
  });
});
