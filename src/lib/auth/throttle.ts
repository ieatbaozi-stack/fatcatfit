import { createHash } from "node:crypto";
import { normalizeIP } from "@better-auth/core/utils/ip";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { authThrottle } from "@/db/schema";
import { plusOne } from "@/db/sql-helpers";
import type { AppDb } from "@/db/types";

// ตัวนับของเราเอง (ADR 0002 ข้อ 3) สำหรับสิ่งที่ limiter ของ Better Auth ทำไม่ได้: ต่ออีเมล · ทั้งระบบ · /api/invite/check
// หน้าต่างแบบคงที่ (นับจากคำขอแรกของหน้าต่าง) · ทุกขั้นเป็นคำสั่ง SQL เดียวที่ atomic · key เป็น hash ไม่เก็บอีเมล/IP ดิบ

export type ThrottleRule = { windowS: number; max: number };
export type ThrottleResult = { allowed: true } | { allowed: false; retryAfterS: number };

export const OTP_EMAIL_RULES = {
  gap: { windowS: 60, max: 1 }, // ห่างกัน ≥ 60 วิ
  hour: { windowS: 3600, max: 5 }, // ≤ 5 ครั้ง/ชม.
  day: { windowS: 86400, max: 10 }, // ≤ 10 ครั้ง/วัน
} as const satisfies Record<string, ThrottleRule>;

export const INVITE_IP_RULE: ThrottleRule = { windowS: 600, max: 10 };

/** ออกโค้ดเชิญจากหน้าแอดมิน (ADR 0007 ข้อ 3): 20 ครั้ง/วัน ต่อแอดมิน */
export const ADMIN_INVITE_RULE: ThrottleRule = { windowS: 86400, max: 20 };

export const OTP_EMAIL_RULE_NAMES = Object.keys(OTP_EMAIL_RULES) as (keyof typeof OTP_EMAIL_RULES)[];

/** ตัวระบุ OTP ของปลั๊กอิน email-otp: "<type>-otp-<email ตัวพิมพ์เล็ก>" (plugins/email-otp/utils.mjs) */
export const OTP_TYPES = ["sign-in", "email-verification", "forget-password", "change-email"] as const;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** กติกาเดียวกับปลั๊กอิน email-otp เป๊ะ: ตัวพิมพ์เล็กอย่างเดียว ไม่ตัดช่องว่าง (รูปแบบผิดถูกปฏิเสธก่อนถึงตัวนับ) */
export function normalizeEmail(email: string): string {
  return String(email).toLowerCase();
}

export function otpEmailKey(email: string, rule: keyof typeof OTP_EMAIL_RULES): string {
  return `otp-email:${sha256Hex(normalizeEmail(email))}:${rule}`;
}

/** key ทั้งหมดของอีเมลหนึ่ง (ใช้ตอนลบบัญชี — ระบุตรงตัว ไม่ใช้ LIKE) */
export function otpEmailKeys(email: string): string[] {
  return OTP_EMAIL_RULE_NAMES.map((r) => otpEmailKey(email, r));
}

/** ตัวระบุแถว verification ของอีเมลหนึ่ง (ระบุตรงตัวทุก type — ห้าม LIKE เพราะ `_` ในอีเมลเป็น wildcard) */
export function otpVerificationIdentifiers(email: string): string[] {
  const e = normalizeEmail(email);
  return OTP_TYPES.map((t) => `${t}-otp-${e}`);
}

export function otpDayKey(now: Date): string {
  return `otp-day:${now.toISOString().slice(0, 10)}`;
}

export function inviteIpKey(ip: string | null): string {
  return `invite-ip:${sha256Hex(ip ?? "unknown")}`;
}

export function adminInviteKey(userId: string): string {
  return `admin-invite:${sha256Hex(userId)}`;
}

/**
 * IP ของไคลเอนต์จาก x-forwarded-for — กติกาเดียวกับ Better Auth: เชื่อเฉพาะค่าเดียว
 * (Vercel เขียนทับ header นี้ด้วย IP สาธารณะของไคลเอนต์ — ADR 0002 ข้อ 3) · ไม่ได้ค่าที่เชื่อได้ → null (รวมเป็นถังเดียว)
 */
export function clientIp(headers: Headers): string | null {
  const raw = headers.get("x-forwarded-for");
  if (!raw) return null;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 1) return null;
  const ip = parts[0];
  if (ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  // IPv6 รวมเป็นบล็อก /64 (ผู้ใช้หนึ่งรายได้ทั้งบล็อก — ไม่ให้เปลี่ยนที่อยู่เลี่ยงตัวนับ)
  return normalizeIP(ip, { ipv6Subnet: 64 });
}

/**
 * นับ 1 ครั้งของ key แล้วตัดสิน · นับทุกคำขอรวมถึงที่ถูกปฏิเสธ แต่หน้าต่างไม่ขยายเมื่อถูกปฏิเสธ
 * (หมดหน้าต่างแล้วเริ่มใหม่) · เงื่อนไขแข่งกันจัดการด้วยคำสั่งเดียวต่อขั้น
 */
export async function hitThrottle(db: AppDb, key: string, rule: ThrottleRule, now: Date): Promise<ThrottleResult> {
  const expiresAt = new Date(now.getTime() + rule.windowS * 1000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const inserted = await db
      .insert(authThrottle)
      .values({ key, windowStartedAt: now, count: 1, expiresAt })
      .onConflictDoNothing()
      .returning({ count: authThrottle.count, expiresAt: authThrottle.expiresAt });
    let row = inserted[0];
    if (!row) {
      // หน้าต่างเก่าหมดอายุแล้ว → เริ่มหน้าต่างใหม่ (แค่คำขอเดียวที่ชนะ เพราะเงื่อนไข expires_at <= now)
      const reset = await db
        .update(authThrottle)
        .set({ windowStartedAt: now, count: 1, expiresAt })
        .where(and(eq(authThrottle.key, key), lte(authThrottle.expiresAt, now)))
        .returning({ count: authThrottle.count, expiresAt: authThrottle.expiresAt });
      row = reset[0];
    }
    if (!row) {
      const bumped = await db
        .update(authThrottle)
        .set({ count: plusOne(authThrottle.count) })
        .where(and(eq(authThrottle.key, key), gt(authThrottle.expiresAt, now)))
        .returning({ count: authThrottle.count, expiresAt: authThrottle.expiresAt });
      row = bumped[0];
    }
    if (!row) continue; // แถวถูกลบ/หมดอายุระหว่างทาง (cron) — ลองใหม่
    if (row.count <= rule.max) return { allowed: true };
    return { allowed: false, retryAfterS: Math.max(1, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000)) };
  }
  // ลองซ้ำไม่สำเร็จ (ไม่ควรเกิด) — ปิดทางไว้ก่อน
  return { allowed: false, retryAfterS: rule.windowS };
}

/** อ่านตัวนับของหน้าต่างปัจจุบันโดยไม่นับเพิ่ม (0 ถ้าไม่มี/หมดอายุ) */
export async function peekThrottle(db: AppDb, key: string, now: Date): Promise<number> {
  const rows = await db
    .select({ count: authThrottle.count })
    .from(authThrottle)
    .where(and(eq(authThrottle.key, key), gt(authThrottle.expiresAt, now)))
    .limit(1);
  return rows[0]?.count ?? 0;
}

/** ขอส่ง OTP ต่ออีเมล: ตรวจ gap → hour → day ตามลำดับ · ขั้นที่ปฏิเสธแล้วไม่นับขั้นถัดไป (กดขอซ้ำเร็วๆ ไม่เผาโควตารายชั่วโมง) */
export async function hitOtpEmailThrottle(db: AppDb, email: string, now: Date): Promise<ThrottleResult> {
  for (const name of OTP_EMAIL_RULE_NAMES) {
    const res = await hitThrottle(db, otpEmailKey(email, name), OTP_EMAIL_RULES[name], now);
    if (!res.allowed) return res;
  }
  return { allowed: true };
}

/** นับเมล OTP ที่ส่งจริงของวันนี้ (UTC) — เรียกก่อนส่งทุกครั้ง · ไม่ใช่ตัวตัดสิน (ตัวตัดสินคือ peek ก่อนหน้า) */
export async function countOtpSent(db: AppDb, now: Date): Promise<void> {
  // หน้าต่าง 2 วัน (ให้ cron ล้างทีหลัง) แต่ key แยกรายวันอยู่แล้ว · max สูงมาก = ไม่ปฏิเสธ
  await hitThrottle(db, otpDayKey(now), { windowS: 2 * 86400, max: Number.MAX_SAFE_INTEGER }, now);
}

export async function otpSentToday(db: AppDb, now: Date): Promise<number> {
  return peekThrottle(db, otpDayKey(now), now);
}

export async function deleteThrottleKeys(db: AppDb, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await db.delete(authThrottle).where(inArray(authThrottle.key, keys));
}

/** ล้างแถวหมดอายุ (cron รายวัน) — คืนจำนวนที่ลบ */
export async function purgeExpiredThrottles(db: AppDb, now: Date): Promise<number> {
  const rows = await db.delete(authThrottle).where(lte(authThrottle.expiresAt, now)).returning({ key: authThrottle.key });
  return rows.length;
}
