import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { inviteCode } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { assertSameOrigin } from "./http";
import { createInvite, listInvites, revokeInviteById } from "./invite-store";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe("listInvites ตัวเลือก", () => {
  it("ค่าเริ่มต้น = created_at ASC ไม่จำกัด · newest = DESC + limit", async () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 5; i++) await createInvite(t.db, { label: `L${i}`, maxUses: 1, days: 1 }, new Date(base.getTime() + i * 1000));
    const now = new Date(base.getTime() + 10_000);
    expect((await listInvites(t.db, now)).map((r) => r.label)).toEqual(["L0", "L1", "L2", "L3", "L4"]);
    expect((await listInvites(t.db, now, { order: "newest", limit: 2 })).map((r) => r.label)).toEqual(["L4", "L3"]);
  });
});

describe("revokeInviteById", () => {
  it("revoked / unchanged / not_found และไม่แตะแถวที่หมดอายุ", async () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    const a = await createInvite(t.db, { label: "a", maxUses: 1, days: 1 }, now);
    expect(await revokeInviteById(t.db, a.id, now)).toBe("revoked");
    expect(await revokeInviteById(t.db, a.id, now)).toBe("unchanged");
    expect(await revokeInviteById(t.db, crypto.randomUUID(), now)).toBe("not_found");
    const later = new Date(now.getTime() + 2 * 86_400_000);
    const b = await createInvite(t.db, { label: "b", maxUses: 1, days: 1 }, now);
    expect(await revokeInviteById(t.db, b.id, later)).toBe("unchanged");
    expect((await t.db.select().from(inviteCode).where(eq(inviteCode.id, b.id)))[0].revokedAt).toBeNull();
  });
});

describe("assertSameOrigin requireOrigin", () => {
  const mk = (h: Record<string, string>) => new Request("http://localhost:3000/x", { method: "POST", headers: { host: "localhost:3000", ...h } });
  it("ค่าเริ่ม false: ไม่มี Origin ผ่าน · true: ไม่มี Origin → 403", () => {
    expect(() => assertSameOrigin(mk({}))).not.toThrow();
    expect(() => assertSameOrigin(mk({}), { requireOrigin: false })).not.toThrow();
    expect(() => assertSameOrigin(mk({}), { requireOrigin: true })).toThrow(/bad_origin/);
    expect(() => assertSameOrigin(mk({ origin: "http://localhost:3000" }), { requireOrigin: true })).not.toThrow();
  });
});
