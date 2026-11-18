import type { AppDb } from "@/db/types";
import { createAuth, type Auth, type AuthDeps } from "./create-auth";
import { INVITE_COOKIE } from "./invite-code";
import { createInvite } from "./invite-store";

// ตัวช่วยเทสต์เท่านั้น (ห้าม import จากโค้ดแอป) — auth จริงบน PGlite + ตัวส่งเมลปลอมที่เก็บ OTP ไว้ให้อ่าน

export const TEST_SECRET = "test-secret-test-secret-test-secret-123";
export const TEST_BASE = "http://localhost:3000";

export type Sent = { to: string; otp: string; locale: string };

export function makeAuth(db: AppDb, extra: Partial<AuthDeps> = {}) {
  process.env.BETTER_AUTH_SECRET = TEST_SECRET;
  const sent: Sent[] = [];
  const clock = { t: new Date("2026-11-18T10:00:00.000Z") };
  const auth: Auth = createAuth(db, {
    sendOtpEmail: async (m) => {
      sent.push(m);
    },
    now: () => clock.t,
    baseURL: TEST_BASE,
    google: {
      clientId: "test-client",
      clientSecret: "test-secret",
      verifyIdToken: async () => true,
      getUserInfo: async (tok: { idToken?: string }) => { return JSON.parse(tok.idToken ?? "{}"); },
    },
    ...extra,
  });
  return { auth, sent, clock };
}

export type Call = { cookies?: Record<string, string>; ip?: string; body?: unknown; method?: string; headers?: Record<string, string | null> };

export function call(auth: Auth, path: string, c: Call = {}) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: TEST_BASE,
    "x-forwarded-for": c.ip ?? "203.0.113.7",
  });
  for (const [k, v] of Object.entries(c.headers ?? {})) {
    if (v === null) headers.delete(k);
    else headers.set(k, v);
  }
  if (c.cookies) headers.set("cookie", Object.entries(c.cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  return auth.handler(
    new Request(`${TEST_BASE}/api/auth${path}`, {
      method: c.method ?? (c.body === undefined ? "GET" : "POST"),
      headers,
      body: c.body === undefined ? undefined : JSON.stringify(c.body),
    }),
  );
}

export function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    out[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return out;
}

export async function newInvite(db: AppDb, now: Date, maxUses = 5) {
  return createInvite(db, { label: "test", maxUses, days: 7 }, now);
}

export const inviteCookie = (code: string) => ({ [INVITE_COOKIE]: code });

/** สมัคร/เข้าด้วย OTP ครบ flow · คืน cookie session (null ถ้าไม่มีเมลถูกส่ง) */
export async function otpSignIn(
  auth: Auth,
  sent: Sent[],
  email: string,
  cookies: Record<string, string> = {},
  ip = "203.0.113.7",
) {
  const before = sent.length;
  const r1 = await call(auth, "/email-otp/send-verification-otp", { body: { email, type: "sign-in" }, cookies, ip });
  if (r1.status !== 200 || sent.length === before) return { res: r1, session: null as Record<string, string> | null };
  const otp = sent[sent.length - 1].otp;
  const res = await call(auth, "/sign-in/email-otp", { body: { email, otp }, cookies, ip });
  const sc = setCookies(res);
  const name = Object.keys(sc).find((k) => k.endsWith("session_token"));
  return { res, session: name ? { [name]: sc[name] } : null };
}
