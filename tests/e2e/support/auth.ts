import { randomUUID } from "node:crypto";
import { E2E_CTRL_PORT } from "./ports";
import { expect, request as pwRequest, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

// ตัวช่วยบัญชีของ E2E — ผ่านด่านจริงทุกขั้น (โค้ดเชิญ → OTP จากเมลที่แอปส่งจริง → ยินยอม → แบบสอบถาม)
// ไม่ปลอม session ไม่เขียนตาราง auth เอง · ใช้อีเมล @example.com เท่านั้น
// IP: แต่ละผู้ใช้ทดสอบใช้ x-forwarded-for ของตัวเอง (เหมือนคนละเครื่อง) — rate limit ต่อ IP ของแอปจึงไม่ชนกันข้ามเทสต์

export const CTRL = `http://127.0.0.1:${E2E_CTRL_PORT}`;

export async function ctrl<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CTRL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`ctrl ${path}: ${json.error ?? res.status}`);
  return json;
}

/** แถวจากฐานข้อมูลทดสอบ (อ่านอย่างเดียวในเทสต์ — ใช้ตรวจผล ไม่ใช้สร้างสถานะ) */
export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  return (await ctrl<{ rows: T[] }>("/sql", { sql: query, params })).rows;
}

/** จำนวนแถวที่เหลือของบัญชี: ทุกตารางที่มี user_id หรือ owner_user_id (key "<ตาราง>.owner_user_id") + user + verification/auth_throttle ของอีเมล */
export async function residue(userId: string, email: string): Promise<Record<string, number>> {
  return ctrl(`/residue?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`);
}

export async function userIdOf(email: string): Promise<string | null> {
  const rows = await sql<{ id: string }>(`select id from "user" where lower(email) = lower($1)`, [email]);
  return rows[0]?.id ?? null;
}

/** ออกโค้ดเชิญด้วยฟังก์ชันเดียวกับ scripts/invite.ts · revoke = ยกเลิกทันที · คืนรูปที่คนเห็น XXXX-XXXX */
export async function newInvite(opts: { maxUses?: number; days?: number; revoke?: boolean } = {}): Promise<string> {
  return (await ctrl<{ display: string }>("/invite", opts)).display;
}

export type Mail = { to: string[]; subject: string; text: string; at: number };

export async function mailsTo(email: string): Promise<Mail[]> {
  return ctrl<Mail[]>(`/mail?to=${encodeURIComponent(email.toLowerCase())}`);
}

/** รอเมล OTP ฉบับใหม่ (ส่งหลัง since) แล้วคืนรหัส 6 หลักจากเนื้อเมล */
export async function waitForOtp(email: string, since: number): Promise<{ otp: string; mail: Mail }> {
  let found: Mail | undefined;
  await expect
    .poll(
      async () => {
        found = (await mailsTo(email)).filter((m) => m.at >= since).at(-1);
        return Boolean(found);
      },
      { timeout: 15_000, message: `no OTP mail to ${email}` },
    )
    .toBe(true);
  const otp = /\b(\d{6})\b/.exec(found!.text)?.[1];
  if (!otp) throw new Error("OTP mail without a 6-digit code");
  return { otp, mail: found! };
}

let seq = 0;
export function uniqueEmail(tag: string): string {
  seq += 1;
  return `e2e-${tag}-${process.pid}-${Date.now().toString(36)}-${seq}@example.com`;
}

export function randomIp(): string {
  const b = () => 1 + Math.floor(Math.random() * 254);
  return `10.${b()}.${b()}.${b()}`;
}

/** ข้อมูลแบบสอบถามที่ถูกต้อง (หน่วยเมตริก) */
export function onboardingPayload(locale: "th" | "en" = "th") {
  const now = new Date();
  return {
    profile: {
      locale,
      weightUnit: "kg",
      lengthUnit: "cm",
      distanceUnit: "km",
      birthYear: 1995,
      height: { value: 170, unit: "cm" },
      goals: ["fitter"],
      experience: "some",
    },
    place: { id: randomUUID(), name: "Home" },
    bodyEntry: {
      id: randomUUID(),
      weight: { value: 70, unit: "kg" },
      measuredAt: now.toISOString(),
      localDate: now.toISOString().slice(0, 10),
    },
  };
}

export type Stage = "signed_in" | "consented" | "ready";

export type TestUser = {
  email: string;
  ip: string;
  api: APIRequestContext;
  cookies: Awaited<ReturnType<APIRequestContext["storageState"]>>["cookies"];
};

/** สมัครผ่าน API จริงจนถึงขั้นที่ขอ · คืน cookie session สำหรับใส่ใน browser context */
export async function signUp(baseURL: string, opts: { stage?: Stage; locale?: "th" | "en"; email?: string; code?: string } = {}): Promise<TestUser> {
  const stage = opts.stage ?? "ready";
  const locale = opts.locale ?? "th";
  const email = opts.email ?? uniqueEmail("user");
  const ip = randomIp();
  const api = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip, origin: baseURL } });
  const code = opts.code ?? (await newInvite());
  const check = await api.post("/api/invite/check", { data: { code } });
  expect(check.status(), "invite check").toBe(200);
  expect(await check.json()).toEqual({ result: "ok" });
  const since = Date.now();
  const send = await api.post("/api/auth/email-otp/send-verification-otp", { data: { email, type: "sign-in" } });
  expect(send.status(), `send otp: ${await send.text()}`).toBe(200);
  const { otp } = await waitForOtp(email, since);
  const signIn = await api.post("/api/auth/sign-in/email-otp", { data: { email, otp } });
  expect(signIn.status(), `sign in: ${await signIn.text()}`).toBe(200);
  if (stage !== "signed_in") {
    const me = await (await api.get("/api/me")).json();
    const c = await api.post("/api/consent", { data: { noticeVersion: me.noticeVersion, locale } });
    expect(c.status(), "consent").toBe(200);
  }
  if (stage === "ready") {
    const o = await api.post("/api/onboarding", { data: onboardingPayload(locale) });
    expect(o.status(), `onboarding: ${await o.text()}`).toBe(200);
  }
  const { cookies } = await api.storageState();
  return { email, ip, api, cookies: cookies.filter((c) => c.name.includes("session")) };
}

/** ใส่ session ของผู้ใช้ทดสอบลงใน browser context (+ IP เดียวกัน) */
export async function applySession(context: BrowserContext, u: TestUser) {
  await context.addCookies(u.cookies);
  await context.setExtraHTTPHeaders({ "x-forwarded-for": u.ip });
}

/** กรอกหน้า /welcome ผ่าน UI ด้วยอีเมล + OTP (ใส่โค้ดเชิญถ้ามี) — จบที่หลังกรอกรหัส */
export async function signInViaUi(page: Page, email: string, opts: { invite?: string; locale?: "th" | "en" } = {}) {
  const { msg } = await import("../helpers");
  const l = opts.locale ?? "th";
  await page.goto("/welcome");
  if (opts.invite !== undefined) await page.getByLabel(msg(l, "welcome.invite.label")).fill(opts.invite);
  await page.getByRole("button", { name: msg(l, "welcome.useEmail") }).click();
  await page.getByLabel(msg(l, "welcome.email.label")).fill(email);
  const since = Date.now();
  await page.getByRole("button", { name: msg(l, "welcome.email.send") }).click();
  const { otp } = await waitForOtp(email, since);
  await page.getByLabel(msg(l, "otp.label")).fill(otp);
  return otp;
}
