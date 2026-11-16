import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/db/testing/pglite";

let t: TestDb;
let broken = false;

vi.mock("@/db/client", () => ({
  getDb: () => {
    if (broken) {
      return {
        execute: () => Promise.reject(new Error("connect ECONNREFUSED postgres://user:secret@host/db")),
      };
    }
    return t.db;
  },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    broken = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("200 { ok: true } เมื่อฐานข้อมูลใช้ได้", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("503 เมื่อฐานข้อมูลใช้ไม่ได้ และไม่เปิดเผยข้อความ error / connection string", async () => {
    broken = true;
    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false });
    expect(text).not.toMatch(/secret|postgres|ECONNREFUSED/);
    // และไม่ log ข้อความ error ดิบ
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toMatch(/secret|postgres:\/\//);
  });
});
