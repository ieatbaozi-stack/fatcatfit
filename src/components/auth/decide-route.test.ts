import { describe, expect, it } from "vitest";
import { decideRoute, type Decision, type Hint, type MeResult, type ScreenKind } from "./decide-route";

const ok = (state: "consent_required" | "onboarding_required" | "ready"): MeResult => ({ status: "ok", state });
const KINDS: ScreenKind[] = ["public", "setup", "app"];

// ตารางข้อ 3 ของ ADR 0006 ทุกช่อง (kind × ผล /api/me) ตอนออนไลน์
describe("decideRoute · ออนไลน์", () => {
  it("401: public อยู่ + ล้าง hint · setup/app ไป /welcome + ล้าง hint", () => {
    expect(decideRoute("public", "online", { status: "unauthorized" }, null)).toEqual({ action: "stay", hint: "clear" });
    for (const kind of ["setup", "app"] as const) {
      expect(decideRoute(kind, "online", { status: "unauthorized" }, "ready", "/consent")).toEqual({
        action: "go",
        to: "/welcome",
        hint: "clear",
      });
    }
  });

  it("consent_required: public/app ไป /consent · setup อยู่ถ้าเป็น /consent ไม่งั้นไป /consent", () => {
    expect(decideRoute("public", "online", ok("consent_required"), null)).toEqual({ action: "go", to: "/consent" });
    expect(decideRoute("app", "online", ok("consent_required"), "ready")).toEqual({ action: "go", to: "/consent" });
    expect(decideRoute("setup", "online", ok("consent_required"), null, "/consent")).toEqual({ action: "stay" });
    expect(decideRoute("setup", "online", ok("consent_required"), null, "/onboarding")).toEqual({
      action: "go",
      to: "/consent",
    });
  });

  it("onboarding_required: public/app ไป /onboarding · setup อยู่ถ้าเป็น /onboarding ไม่งั้นไป /onboarding", () => {
    expect(decideRoute("public", "online", ok("onboarding_required"), null)).toEqual({ action: "go", to: "/onboarding" });
    expect(decideRoute("app", "online", ok("onboarding_required"), null)).toEqual({ action: "go", to: "/onboarding" });
    expect(decideRoute("setup", "online", ok("onboarding_required"), null, "/onboarding")).toEqual({ action: "stay" });
    expect(decideRoute("setup", "online", ok("onboarding_required"), null, "/consent")).toEqual({
      action: "go",
      to: "/onboarding",
    });
  });

  it("ready: public/setup ไป / + ตั้ง hint · app อยู่ + ตั้ง hint", () => {
    expect(decideRoute("public", "online", ok("ready"), null)).toEqual({ action: "go", to: "/", hint: "set" });
    expect(decideRoute("setup", "online", ok("ready"), null, "/consent")).toEqual({ action: "go", to: "/", hint: "set" });
    expect(decideRoute("app", "online", ok("ready"), null)).toEqual({ action: "stay", hint: "set" });
  });

  it("5xx / ตอบไม่ได้: public อยู่ · setup จอผิดพลาด · app: hint ready อยู่ ไม่มี hint จอผิดพลาด", () => {
    const err: MeResult = { status: "error" };
    expect(decideRoute("public", "online", err, null)).toEqual({ action: "stay" });
    expect(decideRoute("public", "online", err, "ready")).toEqual({ action: "stay" });
    expect(decideRoute("setup", "online", err, null, "/consent")).toEqual({ action: "error" });
    expect(decideRoute("setup", "online", err, "ready", "/onboarding")).toEqual({ action: "error" });
    expect(decideRoute("app", "online", err, "ready")).toEqual({ action: "stay" });
    expect(decideRoute("app", "online", err, null)).toEqual({ action: "error" });
  });

  it("ยังไม่ตอบ: อยู่ ไม่แตะ hint ทุก kind", () => {
    for (const kind of KINDS) {
      for (const hint of [null, "ready"] as Hint[]) {
        expect(decideRoute(kind, "online", { status: "pending" }, hint, "/consent")).toEqual({ action: "stay" });
      }
    }
  });
});

describe("decideRoute · ออฟไลน์", () => {
  const results: MeResult[] = [
    { status: "pending" },
    { status: "unauthorized" },
    { status: "error" },
    ok("consent_required"),
    ok("onboarding_required"),
    ok("ready"),
  ];

  it("public: อยู่ แสดงสถานะออฟไลน์ ไม่ว่าผลอะไร", () => {
    for (const me of results) {
      for (const hint of [null, "ready"] as Hint[]) {
        expect(decideRoute("public", "offline", me, hint)).toEqual({ action: "stay", offline: true });
      }
    }
  });

  it("setup: อยู่ (ปุ่มส่งปิด) ไม่ว่าผลอะไร", () => {
    for (const me of results) {
      expect(decideRoute("setup", "offline", me, null, "/onboarding")).toEqual({ action: "stay", offline: true });
    }
  });

  it("app: hint ready → แสดงหน้า · ไม่มี hint → จอยินดีต้อนรับแบบออฟไลน์ในที่เดิม", () => {
    for (const me of results) {
      expect(decideRoute("app", "offline", me, "ready")).toEqual({ action: "stay", offline: true });
      expect(decideRoute("app", "offline", me, null)).toEqual({ action: "offline-welcome" });
    }
  });

  it("ออฟไลน์ไม่เคยสั่งเปลี่ยนหน้าหรือแตะ hint", () => {
    const all: Decision[] = [];
    for (const kind of KINDS) {
      for (const me of results) {
        for (const hint of [null, "ready"] as Hint[]) all.push(decideRoute(kind, "offline", me, hint, "/consent"));
      }
    }
    expect(all.some((d) => d.action === "go")).toBe(false);
    expect(all.some((d) => "hint" in d)).toBe(false);
  });
});
