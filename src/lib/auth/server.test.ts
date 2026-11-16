import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { createAuth } from "./server";
import { user } from "@/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("Better Auth บน schema ของเรา (S2)", () => {
  let t: TestDb;
  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("สร้างผู้ใช้/session ผ่าน adapter ได้ และ id เป็น uuid", async () => {
    const auth = createAuth(t.db);
    const ctx = await auth.$context;
    const u = await ctx.internalAdapter.createUser(
      { email: "a@example.com", name: "A", emailVerified: true },
      { method: "email-otp" },
    );
    expect(u.id).toMatch(UUID);
    const s = await ctx.internalAdapter.createSession(u.id, false);
    expect(s.token).toBeTruthy();
    const rows = await t.db.select().from(user);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(UUID);
  });

  it("เขียน/อ่าน rate limit จากฐานข้อมูลได้", async () => {
    const auth = createAuth(t.db);
    const ctx = await auth.$context;
    await ctx.adapter.create({
      model: "rateLimit",
      data: { key: "ip|/sign-in", count: 1, lastRequest: Date.now() },
    });
    const found = await ctx.adapter.findOne<{ count: number; lastRequest: number }>({
      model: "rateLimit",
      where: [{ field: "key", value: "ip|/sign-in" }],
    });
    expect(found?.count).toBe(1);
    expect(typeof found?.lastRequest).toBe("number");
  });
});
