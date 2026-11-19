import { describe, expect, it, vi } from "vitest";
import {
  checkInviteCode,
  deleteAccountRequest,
  fetchMe,
  postConsent,
  postOnboarding,
  retryAfterSeconds,
  sendOtp,
  startGoogleSignIn,
  verifyOtp,
} from "./api";

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
const down = vi.fn(async () => {
  throw new TypeError("fetch failed");
});

describe("fetchMe", () => {
  it("แยก 401 / 5xx / ล้มเหลวของเครือข่าย / สำเร็จ", async () => {
    expect(await fetchMe(reply(401))).toEqual({ status: "unauthorized" });
    expect(await fetchMe(reply(500))).toEqual({ status: "error" });
    expect(await fetchMe(reply(200, { state: "weird" }))).toEqual({ status: "error" });
    expect(await fetchMe(down)).toEqual({ status: "network" });
    const ok = await fetchMe(reply(200, { state: "ready", user: { email: "a@example.com" } }));
    expect(ok.status === "ok" && ok.me.state).toBe("ready");
  });
  it("ไม่ใช้ cache", async () => {
    const f = reply(401);
    await fetchMe(f);
    expect(f).toHaveBeenCalledWith("/api/me", expect.objectContaining({ cache: "no-store" }));
  });
});

describe("retryAfterSeconds", () => {
  it("อ่าน X-Retry-After · ผิดรูป/ไม่มี = 60", () => {
    expect(retryAfterSeconds(new Response("", { headers: { "X-Retry-After": "299" } }))).toBe(299);
    expect(retryAfterSeconds(new Response("", { headers: { "X-Retry-After": "x" } }))).toBe(60);
    expect(retryAfterSeconds(new Response(""))).toBe(60);
  });
});

describe("checkInviteCode", () => {
  it("ส่งโค้ดใน body ไม่ใช่ URL และแปลผล", async () => {
    const f = reply(200, { result: "ok" });
    expect(await checkInviteCode("MEWP-4823", f)).toEqual({ result: "ok" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/invite/check");
    expect(url).not.toContain("MEWP");
    expect(init.body).toBe(JSON.stringify({ code: "MEWP-4823" }));
    expect(await checkInviteCode("x", reply(200, { result: "invalid" }))).toEqual({ result: "invalid" });
    expect(await checkInviteCode("x", reply(429, {}, { "X-Retry-After": "120" }))).toEqual({ result: "rate_limited", retryAfterS: 120 });
    expect(await checkInviteCode("x", reply(500))).toEqual({ result: "error" });
    expect(await checkInviteCode("x", down)).toEqual({ result: "network" });
  });
});

describe("startGoogleSignIn", () => {
  it("ส่ง callbackURL / errorCallbackURL ตาม ADR 0006 และคืน url", async () => {
    const f = reply(200, { url: "https://accounts.example/auth", redirect: false });
    expect(await startGoogleSignIn(f)).toEqual({ ok: true, url: "https://accounts.example/auth" });
    const body = JSON.parse(((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string));
    expect(body).toMatchObject({ provider: "google", callbackURL: "/", errorCallbackURL: "/welcome" });
    expect(await startGoogleSignIn(reply(404))).toEqual({ ok: false, reason: "error" });
    expect(await startGoogleSignIn(down)).toEqual({ ok: false, reason: "network" });
  });
});

describe("sendOtp / verifyOtp", () => {
  it("sendOtp: ok · 429 + เวลารอ · email_unavailable · อีเมลผิด", async () => {
    expect(await sendOtp("a@example.com", reply(200, { success: true }))).toEqual({ ok: true });
    expect(await sendOtp("a@example.com", reply(429, {}, { "X-Retry-After": "55" }))).toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterS: 55,
    });
    expect(await sendOtp("a@example.com", reply(503, { code: "email_unavailable" }))).toEqual({ ok: false, reason: "email_unavailable" });
    expect(await sendOtp("x", reply(400, { code: "INVALID_EMAIL" }))).toEqual({ ok: false, reason: "invalid_email" });
    expect(await sendOtp("a@example.com", down)).toEqual({ ok: false, reason: "network" });
  });
  it("sendOtp ส่ง type sign-in", async () => {
    const f = reply(200);
    await sendOtp("a@example.com", f);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe(JSON.stringify({ email: "a@example.com", type: "sign-in" }));
  });
  it("verifyOtp: แยกรหัสผิด หมดอายุ ผิดเกิน invite_required", async () => {
    expect(await verifyOtp("a@example.com", "123456", reply(200, { token: "t" }))).toEqual({ ok: true });
    expect(await verifyOtp("a", "1", reply(400, { code: "INVALID_OTP" }))).toEqual({ ok: false, reason: "invalid_otp" });
    // เซิร์ฟเวอร์ตอบ INVALID_OTP ทุกกรณีรหัสไม่ผ่าน · code เก่าที่ไม่รู้จักถือเป็น error ทั่วไป
    expect(await verifyOtp("a", "1", reply(400, { code: "OTP_EXPIRED" }))).toEqual({ ok: false, reason: "error" });
    expect(await verifyOtp("a", "1", reply(403, { code: "invite_required" }))).toEqual({ ok: false, reason: "invite_required" });
    expect(await verifyOtp("a", "1", reply(500))).toEqual({ ok: false, reason: "error" });
  });
});

describe("postConsent / postOnboarding / deleteAccount", () => {
  it("postConsent: 409 = version_mismatch", async () => {
    expect(await postConsent("v", "th", reply(200, { ok: true }))).toEqual({ ok: true });
    expect(await postConsent("v", "th", reply(409, { code: "notice_version_mismatch" }))).toEqual({ ok: false, reason: "version_mismatch" });
    expect(await postConsent("v", "th", reply(401))).toEqual({ ok: false, reason: "unauthorized" });
  });
  it("postOnboarding: 400 + fields · 403 · 409 · เครือข่าย", async () => {
    expect(await postOnboarding({}, reply(400, { code: "invalid_input", fields: { "profile.birthYear": "required" } }))).toEqual({
      ok: false,
      reason: "invalid",
      fields: { "profile.birthYear": "required" },
    });
    expect(await postOnboarding({}, reply(403, { code: "consent_required" }))).toEqual({ ok: false, reason: "consent_required" });
    expect(await postOnboarding({}, reply(409, { code: "already_onboarded" }))).toEqual({ ok: false, reason: "already_onboarded" });
    expect(await postOnboarding({}, down)).toEqual({ ok: false, reason: "network" });
  });
  it("deleteAccountRequest ใช้ DELETE /api/me", async () => {
    const f = reply(200, { ok: true });
    expect(await deleteAccountRequest(f)).toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "DELETE" }));
    expect(await deleteAccountRequest(reply(500))).toEqual({ ok: false, reason: "error" });
  });
});
