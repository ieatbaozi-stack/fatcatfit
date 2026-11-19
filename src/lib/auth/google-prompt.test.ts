import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { call, makeAuth } from "./testing";

// v0.2.1: แอปที่ติดตั้งบนมือถือต้องให้ผู้ใช้เลือกบัญชี Google เองทุกครั้ง (ไม่ให้ Google เลือกบัญชีที่ล็อกอินไว้ให้อัตโนมัติ)

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

async function googleAuthUrl() {
  const { auth } = makeAuth(t.db);
  const res = await call(auth, "/sign-in/social", { body: { provider: "google", callbackURL: "/" }, ip: "198.51.100.200" });
  expect(res.status).toBe(200);
  const json = (await res.json()) as { url: string };
  return new URL(json.url);
}

describe("Google OAuth URL", () => {
  it("ส่ง prompt=select_account ให้ Google", async () => {
    const url = await googleAuthUrl();
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("scope ยังเป็น openid email profile เท่าเดิม", async () => {
    const url = await googleAuthUrl();
    expect(url.searchParams.get("scope")?.split(/[ +]/).sort()).toEqual(["email", "openid", "profile"]);
  });
});
