import "server-only";
import { after } from "next/server";
import { getDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { HttpError } from "@/lib/data/shared/http-error";
import { hasCurrentConsent } from "./consent";
import { createAuth, type Auth } from "./create-auth";
import { sendOtpEmail } from "./mailer";

export { createAuth, type Auth, type AuthDeps } from "./create-auth";

// จุดเข้าฝั่งเซิร์ฟเวอร์ของ auth: getAuth() · requireUser() · requireConsent() (ADR 0002 ข้อ 6)
// ทุก endpoint ข้อมูลของผู้ใช้ต้องเรียก requireUser() แล้วกรองทุก query ด้วย userId ที่ได้

let instance: Auth | undefined;

function parseCap(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function runInBackground(p: Promise<unknown>): void {
  try {
    after(p);
  } catch {
    // นอก request scope (ไม่ควรเกิดในแอป) — ปล่อยให้ทำงานต่อโดยไม่รอ
    void p;
  }
}

export function getAuth(): Auth {
  if (!instance) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    instance = createAuth(getDb(), {
      sendOtpEmail,
      otpDailyCap: parseCap(process.env.OTP_DAILY_CAP),
      runInBackground,
      baseURL: process.env.BETTER_AUTH_URL,
      // ยังไม่มี OAuth client → ไม่เปิด Google (ปุ่มฝั่ง UI ได้ provider ไม่พบ ไม่ใช่ crash)
      google: clientId && clientSecret ? { clientId, clientSecret } : null,
    });
  }
  return instance;
}

export type AuthedUser = { userId: string; email: string; name: string };

/** ผู้ใช้จาก cookie session — ไม่มี/หมดอายุ/ถูกเพิกถอน → HttpError 401 unauthenticated */
export async function requireUser(headers: Headers): Promise<AuthedUser> {
  const session = await getAuth().api.getSession({ headers });
  if (!session?.user) throw new HttpError(401, "unauthenticated");
  return { userId: session.user.id, email: session.user.email, name: session.user.name };
}

/** ยังไม่ยินยอมประกาศเวอร์ชันปัจจุบัน → HttpError 403 consent_required */
export async function requireConsent(userId: string, db: AppDb = getDb()): Promise<void> {
  if (!(await hasCurrentConsent(db, userId))) throw new HttpError(403, "consent_required");
}
