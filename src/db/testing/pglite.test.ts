import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "./pglite";
import { user, session } from "../schema";

describe("S1: PGlite + Drizzle + migration จริง", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("migration ครบทุกตารางของ Better Auth", async () => {
    const res = await t.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const names = res.rows.map((r) => (r as { table_name: string }).table_name);
    expect(names).toEqual(
      expect.arrayContaining(["user", "session", "account", "verification", "rate_limit"]),
    );
  });

  it("insert/select ผ่าน Drizzle และ cascade ลบ session เมื่อลบ user", async () => {
    const now = new Date();
    const uid = crypto.randomUUID();
    await t.db.insert(user).values({
      id: uid,
      name: "Test",
      email: "a@example.com",
      createdAt: now,
      updatedAt: now,
    });
    await t.db.insert(session).values({
      id: crypto.randomUUID(),
      userId: uid,
      token: "tok",
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const [u] = await t.db.select().from(user);
    expect(u.createdAt.getTime()).toBe(now.getTime());
    await t.db.delete(user);
    expect(await t.db.select().from(session)).toHaveLength(0);
  });
});
