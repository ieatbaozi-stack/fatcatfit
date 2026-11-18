import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { inviteCode, user } from "@/db/schema";
import { checkInvite } from "./invite-check";
import { formatInviteCode, generateInviteCode, hashInviteCode, normalizeInviteCode } from "./invite-code";
import { consumeInvite, createInvite, listInvites, revokeInvite } from "./invite-store";
import { call, inviteCookie, makeAuth, newInvite } from "./testing";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const NOW = new Date("2026-11-18T10:00:00.000Z");
let ipn = 0;
const check = (code: unknown, now = NOW, ip?: string) =>
  checkInvite(
    t.db,
    new Request("http://localhost:3000/api/invite/check", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip ?? `192.0.2.${++ipn}` },
      body: JSON.stringify({ code }),
    }),
    now,
  );

describe("รูปแบบโค้ดเชิญ", () => {
  it("normalize ไม่สนตัวพิมพ์/ขีด/ช่องว่าง และปฏิเสธตัวอักษรนอกชุด", () => {
    expect(normalizeInviteCode("abcd-2345")).toBe("ABCD2345");
    expect(normalizeInviteCode(" ABCD 2345 ")).toBe("ABCD2345");
    expect(normalizeInviteCode("ABCD-234")).toBeNull();
    expect(normalizeInviteCode("ABCD-234I")).toBeNull(); // I ไม่อยู่ในชุด
    expect(normalizeInviteCode("ABCD-2340")).toBeNull(); // 0 ไม่อยู่ในชุด
    expect(normalizeInviteCode(12345678)).toBeNull();
    expect(formatInviteCode("ABCD2345")).toBe("ABCD-2345");
  });
  it("generate ได้ 8 ตัวจากชุดที่ถูกต้อง", () => {
    for (let i = 0; i < 50; i++) expect(normalizeInviteCode(generateInviteCode())).not.toBeNull();
  });
});

describe("เกณฑ์ 3: โค้ดเชิญ", () => {
  it("เก็บเฉพาะ hash — ไม่มีโค้ดดิบในฐานข้อมูล", async () => {
    const inv = await createInvite(t.db, { label: "hash-test", maxUses: 1, days: 1 }, NOW);
    const [row] = await t.db.select().from(inviteCode).where(eq(inviteCode.id, inv.id));
    expect(row.codeHash).toBe(hashInviteCode(inv.code));
    expect(JSON.stringify(row)).not.toContain(inv.code);
  });

  it("ผิด/หมดอายุ/ใช้ครบ/ถูกยกเลิก ตอบเหมือนกันทุกไบต์ (invalid) และไม่ตั้ง cookie", async () => {
    const expired = await createInvite(t.db, { label: "exp", maxUses: 1, days: 1 }, new Date(NOW.getTime() - 3 * 86_400_000));
    const full = await createInvite(t.db, { label: "full", maxUses: 1, days: 1 }, NOW);
    await consumeInvite(t.db, full.code, NOW);
    const revoked = await createInvite(t.db, { label: "rev", maxUses: 1, days: 1 }, NOW);
    await revokeInvite(t.db, { id: revoked.id }, NOW);

    const bodies: string[] = [];
    for (const code of ["ZZZZ-ZZZZ", "bad", expired.display, full.display, revoked.display, null]) {
      const res = await check(code);
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toBeNull();
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({ result: "invalid" });
  });

  it("โค้ดที่ใช้ได้ → ok + cookie fcf_invite (HttpOnly, SameSite=Lax, Path=/api/auth, 30 นาที) และไม่ใช้สิทธิ์", async () => {
    const inv = await createInvite(t.db, { label: "ok", maxUses: 2, days: 1 }, NOW);
    const res = await check(inv.display);
    expect(await res.json()).toEqual({ result: "ok" });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`fcf_invite=${inv.code}`);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/Max-Age=1800/);
    expect(cookie).not.toMatch(/Secure/); // http ในเทสต์
    const [row] = await t.db.select().from(inviteCode).where(eq(inviteCode.id, inv.id));
    expect(row.usesCount).toBe(0);
  });

  it("ติด Secure เมื่อมาทาง https (x-forwarded-proto)", async () => {
    const inv = await createInvite(t.db, { label: "sec", maxUses: 1, days: 1 }, NOW);
    const res = await checkInvite(
      t.db,
      new Request("http://localhost:3000/api/invite/check", {
        method: "POST",
        headers: { "x-forwarded-proto": "https", "x-forwarded-for": "192.0.2.250" },
        body: JSON.stringify({ code: inv.display }),
      }),
      NOW,
    );
    expect(res.headers.get("set-cookie")).toMatch(/Secure/);
  });

  it("ใช้พร้อมกันเกิน max_uses ไม่ได้ (atomic)", async () => {
    const inv = await createInvite(t.db, { label: "race", maxUses: 3, days: 1 }, NOW);
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeInvite(t.db, inv.code, NOW)));
    expect(results.filter(Boolean)).toHaveLength(3);
    const [row] = await t.db.select().from(inviteCode).where(eq(inviteCode.id, inv.id));
    expect(row.usesCount).toBe(3);
  });

  it("สมัครพร้อมกันหลายคนด้วยโค้ดที่เหลือ 1 สิทธิ์ → ได้บัญชีเดียว", async () => {
    const { auth } = makeAuth(t.db);
    const inv = await newInvite(t.db, NOW, 1);
    const tok = (e: string) => JSON.stringify({ user: { email: e, name: "G", emailVerified: true }, data: { sub: e } });
    const res = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        call(auth, "/sign-in/social", {
          ip: `198.18.0.${i + 1}`,
          cookies: inviteCookie(inv.code),
          body: { provider: "google", idToken: { token: tok(`race${i}@example.com`) } },
        }),
      ),
    );
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    const users = await t.db.select().from(user).where(eq(user.inviteCodeId, inv.id));
    expect(users).toHaveLength(1);
  });

  it("list/revoke: สถานะคำนวณจากคอลัมน์", async () => {
    const inv = await createInvite(t.db, { label: "list-me", maxUses: 1, days: 1 }, NOW);
    expect((await listInvites(t.db, NOW)).find((r) => r.id === inv.id)?.status).toBe("active");
    expect(await revokeInvite(t.db, { normalizedCode: inv.code }, NOW)).toBe(1);
    expect(await revokeInvite(t.db, { normalizedCode: inv.code }, NOW)).toBe(0);
    expect((await listInvites(t.db, NOW)).find((r) => r.id === inv.id)?.status).toBe("revoked");
  });

  it("เกณฑ์ 4 (invite/check): เกิน 10 ครั้ง/10 นาที ต่อ IP → 429 + X-Retry-After", async () => {
    const ip = "192.0.2.200";
    for (let i = 0; i < 10; i++) expect((await check("ZZZZ-ZZZZ", NOW, ip)).status).toBe(200);
    const res = await check("ZZZZ-ZZZZ", NOW, ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect(Number(res.headers.get("x-retry-after"))).toBeLessThanOrEqual(600);
    // IP อื่นไม่ถูกจำกัด · หมดหน้าต่างแล้วใช้ได้อีก
    expect((await check("ZZZZ-ZZZZ", NOW, "192.0.2.201")).status).toBe(200);
    expect((await check("ZZZZ-ZZZZ", new Date(NOW.getTime() + 601_000), ip)).status).toBe(200);
  });
});
