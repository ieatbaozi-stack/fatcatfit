import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { createInvite } from "@/lib/auth/invite-store";

let t: TestDb;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));
import { POST } from "./route";

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/invite/check", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/invite/check (route)", () => {
  it("ok + ตั้ง cookie · no-store", async () => {
    const inv = await createInvite(t.db, { label: "r", maxUses: 1, days: 1 }, new Date());
    const res = await post({ code: inv.display });
    expect(await res.json()).toEqual({ result: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toContain("fcf_invite=");
  });
  it("body ไม่ใช่ JSON / ใหญ่เกิน / Origin ผิด → 400 / 413 / 403", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ code: "x".repeat(20_000) })).status).toBe(413);
    const bad = await post({ code: "ABCD-2345" }, { origin: "https://evil.example", host: "localhost:3000" });
    expect(bad.status).toBe(403);
  });
  it("ไม่มี code ใน URL/query ใดๆ — รับเฉพาะ body", async () => {
    const inv = await createInvite(t.db, { label: "q", maxUses: 1, days: 1 }, new Date());
    const res = await POST(new Request(`http://localhost:3000/api/invite/check?code=${inv.display}`, { method: "POST", body: "{}" }));
    expect(await res.json()).toEqual({ result: "invalid" });
  });
});
