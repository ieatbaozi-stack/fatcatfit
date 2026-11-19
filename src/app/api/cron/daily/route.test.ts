import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { authThrottle, rateLimit, verification } from "@/db/schema";

let t: TestDb;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));

import { GET } from "./route";

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
afterEach(() => vi.unstubAllEnvs());

const req = (auth?: string) => new Request("http://localhost:3000/api/cron/daily", { headers: auth ? { authorization: auth } : {} });
const day = 86_400_000;

describe("GET /api/cron/daily", () => {
  it("ไม่มี/ผิด secret → 401 no-store · ไม่ตรง → 401", async () => {
    vi.stubEnv("CRON_SECRET", "s3cretvalue-1234567-abcdefghijklmnop");
    for (const a of [undefined, "Bearer wrong", "s3cretvalue-1234567-abcdefghijklmnop", "Bearer s3cretvalue-1234567-abcdefghijklmnopq"]) {
      const res = await GET(req(a));
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("CRON_SECRET ไม่ได้ตั้ง/ว่าง/สั้นกว่า 32 → 500 + log ข้อความคงที่ (ไม่ log ค่า) แม้ header ตรง", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const v of ["", "z".repeat(31)]) {
      vi.stubEnv("CRON_SECRET", v);
      const res = await GET(req(`Bearer ${v}`));
      expect(res.status).toBe(500);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    vi.stubEnv("CRON_SECRET", "x".repeat(31));
    expect((await GET(req())).status).toBe(500);
    vi.unstubAllEnvs();
    expect((await GET(req())).status).toBe(500);
    for (const c of err.mock.calls) expect(c).toEqual(["[cron:daily] CRON_SECRET missing or too short"]);
    expect(err).toHaveBeenCalledTimes(4);
    vi.stubEnv("CRON_SECRET", "y".repeat(32));
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    err.mockRestore();
  });

  it("401 แล้วไม่ลบอะไร", async () => {
    vi.stubEnv("CRON_SECRET", "s3cretvalue-1234567-abcdefghijklmnop");
    await t.db.insert(rateLimit).values({ id: crypto.randomUUID(), key: "old-401", count: 1, lastRequest: Date.now() - 5 * day });
    await GET(req("Bearer nope"));
    expect((await t.db.select().from(rateLimit)).some((r) => r.key === "old-401")).toBe(true);
  });

  it("ลบเฉพาะแถวหมดอายุ · ไม่แตะแถวที่ยังใช้งาน · log เฉพาะจำนวน", async () => {
    vi.stubEnv("CRON_SECRET", "s3cretvalue-1234567-abcdefghijklmnop");
    const now = Date.now();
    const id = () => crypto.randomUUID();
    await t.db.insert(rateLimit).values([
      { id: id(), key: "203.0.113.9/old", count: 3, lastRequest: now - 2 * day },
      { id: id(), key: "203.0.113.9/new", count: 3, lastRequest: now - 60_000 },
    ]);
    await t.db.insert(verification).values([
      { id: id(), identifier: "sign-in-otp-old@example.com", value: "h:0", expiresAt: new Date(now - 1000), createdAt: new Date(), updatedAt: new Date() },
      { id: id(), identifier: "sign-in-otp-live@example.com", value: "h:0", expiresAt: new Date(now + 600_000), createdAt: new Date(), updatedAt: new Date() },
    ]);
    await t.db.insert(authThrottle).values([
      { key: "k-old", windowStartedAt: new Date(now - 2 * day), count: 1, expiresAt: new Date(now - day) },
      { key: "k-live", windowStartedAt: new Date(now), count: 1, expiresAt: new Date(now + 60_000) },
    ]);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await GET(req("Bearer s3cretvalue-1234567-abcdefghijklmnop"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.deleted.rateLimit).toBeGreaterThanOrEqual(1);
    const rl = (await t.db.select().from(rateLimit)).map((r) => r.key);
    expect(rl).toContain("203.0.113.9/new");
    expect(rl).not.toContain("203.0.113.9/old");
    expect((await t.db.select().from(verification)).map((r) => r.identifier)).toEqual(["sign-in-otp-live@example.com"]);
    expect((await t.db.select().from(authThrottle)).map((r) => r.key)).toEqual(["k-live"]);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toMatch(/rate_limit=\d+/);
    expect(logged).not.toMatch(/example\.com|203\.0\.113|k-old/);
    info.mockRestore();
  });
});
