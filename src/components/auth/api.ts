// ตัวเรียก API ฝั่งไคลเอนต์ของ flow บัญชี (R1) — ไม่มี React · แปลงคำตอบเป็นผลที่ UI แยกแยะได้
// ไม่เขียน query เอง: ทุกอย่างผ่าน /api/** ที่ Platform ทำไว้ · fetch ล้ม (โยน error) = "network"

import type { MeState } from "./decide-route";

export type MeData = {
  state: MeState;
  noticeVersion: string;
  user: { id: string; email: string; name: string };
  consent: { accepted: boolean; acceptedAt: string | null };
  profile: null | { locale: "th" | "en"; weightUnit: string; lengthUnit: string; distanceUnit: string };
};

type Fetcher = typeof fetch;

const JSON_HEADERS = { "Content-Type": "application/json" };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** วินาทีที่ต้องรอจาก header X-Retry-After (ไม่มี/ผิดรูป → 60) */
export function retryAfterSeconds(res: Pick<Response, "headers">): number {
  const raw = res.headers.get("X-Retry-After") ?? res.headers.get("Retry-After");
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function post(f: Fetcher, url: string, body: unknown): Promise<Response> {
  return f(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body), credentials: "same-origin" });
}

export type MeFetch =
  | { status: "ok"; me: MeData }
  | { status: "unauthorized" }
  | { status: "error" }
  | { status: "network" };

export async function fetchMe(f: Fetcher = fetch): Promise<MeFetch> {
  try {
    const res = await f("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return { status: "unauthorized" };
    if (!res.ok) return { status: "error" };
    const body = (await readJson(res)) as Partial<MeData>;
    if (body.state !== "consent_required" && body.state !== "onboarding_required" && body.state !== "ready") {
      return { status: "error" };
    }
    return { status: "ok", me: body as MeData };
  } catch {
    return { status: "network" };
  }
}

export type InviteCheck =
  | { result: "ok" }
  | { result: "invalid" }
  | { result: "rate_limited"; retryAfterS: number }
  | { result: "error" }
  | { result: "network" };

export async function checkInviteCode(code: string, f: Fetcher = fetch): Promise<InviteCheck> {
  try {
    const res = await post(f, "/api/invite/check", { code });
    if (res.status === 429) return { result: "rate_limited", retryAfterS: retryAfterSeconds(res) };
    if (!res.ok) return { result: "error" };
    const body = await readJson(res);
    return body.result === "ok" ? { result: "ok" } : { result: "invalid" };
  } catch {
    return { result: "network" };
  }
}

export type GoogleStart = { ok: true; url: string } | { ok: false; reason: "error" | "network" };

/** ขอ URL ของ Google จาก Better Auth (ผู้เรียกเป็นคน location.assign เอง) */
export async function startGoogleSignIn(f: Fetcher = fetch): Promise<GoogleStart> {
  try {
    const res = await post(f, "/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/welcome",
      disableRedirect: true,
    });
    if (!res.ok) return { ok: false, reason: "error" };
    const body = await readJson(res);
    return typeof body.url === "string" && body.url ? { ok: true, url: body.url } : { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type OtpSend =
  | { ok: true }
  | { ok: false; reason: "rate_limited"; retryAfterS: number }
  | { ok: false; reason: "email_unavailable" | "invalid_email" | "error" | "network" };

export async function sendOtp(email: string, f: Fetcher = fetch): Promise<OtpSend> {
  try {
    const res = await post(f, "/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: false, reason: "rate_limited", retryAfterS: retryAfterSeconds(res) };
    const body = await readJson(res);
    if (body.code === "email_unavailable" || res.status === 503) return { ok: false, reason: "email_unavailable" };
    if (body.code === "INVALID_EMAIL") return { ok: false, reason: "invalid_email" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type OtpVerify =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_otp" | "expired" | "too_many_attempts" | "invite_required" | "error" | "network";
    }
  | { ok: false; reason: "rate_limited"; retryAfterS: number };

export async function verifyOtp(email: string, otp: string, f: Fetcher = fetch): Promise<OtpVerify> {
  try {
    const res = await post(f, "/api/auth/sign-in/email-otp", { email, otp });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: false, reason: "rate_limited", retryAfterS: retryAfterSeconds(res) };
    const code = String((await readJson(res)).code ?? "");
    if (code === "INVALID_OTP") return { ok: false, reason: "invalid_otp" };
    if (code === "OTP_EXPIRED") return { ok: false, reason: "expired" };
    if (code === "TOO_MANY_ATTEMPTS") return { ok: false, reason: "too_many_attempts" };
    if (code.toLowerCase() === "invite_required") return { ok: false, reason: "invite_required" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type Simple = { ok: true } | { ok: false; reason: "unauthorized" | "error" | "network" };

export async function postConsent(
  noticeVersion: string,
  locale: "th" | "en",
  f: Fetcher = fetch,
): Promise<Simple | { ok: false; reason: "version_mismatch" }> {
  try {
    const res = await post(f, "/api/consent", { noticeVersion, locale });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, reason: "unauthorized" };
    if (res.status === 409) return { ok: false, reason: "version_mismatch" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type OnboardingSubmit =
  | { ok: true }
  | { ok: false; reason: "invalid"; fields: Record<string, string> }
  | { ok: false; reason: "consent_required" | "unauthorized" | "already_onboarded" | "error" | "network" };

export async function postOnboarding(payload: unknown, f: Fetcher = fetch): Promise<OnboardingSubmit> {
  try {
    const res = await post(f, "/api/onboarding", payload);
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, reason: "unauthorized" };
    const body = await readJson(res);
    if (res.status === 400 && body.code === "invalid_input") {
      const raw = body.fields;
      const fields: Record<string, string> = {};
      if (typeof raw === "object" && raw !== null) {
        for (const [k, v] of Object.entries(raw)) if (typeof v === "string") fields[k] = v;
      }
      return { ok: false, reason: "invalid", fields };
    }
    if (res.status === 403) return { ok: false, reason: "consent_required" };
    if (res.status === 409) return { ok: false, reason: "already_onboarded" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function signOutRequest(f: Fetcher = fetch): Promise<Simple> {
  try {
    const res = await post(f, "/api/auth/sign-out", {});
    return res.ok ? { ok: true } : { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function deleteAccountRequest(f: Fetcher = fetch): Promise<Simple> {
  try {
    const res = await f("/api/me", { method: "DELETE", credentials: "same-origin" });
    if (res.ok) return { ok: true };
    return { ok: false, reason: res.status === 401 ? "unauthorized" : "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
