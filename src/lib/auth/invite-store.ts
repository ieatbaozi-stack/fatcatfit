import { and, asc, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { inviteCode } from "@/db/schema";
import { plusOne } from "@/db/sql-helpers";
import type { AppDb } from "@/db/types";
import { formatInviteCode, generateInviteCode, hashInviteCode } from "./invite-code";

// การเข้าถึงตาราง invite_code (ADR 0002 ข้อ 2) · ไม่ log โค้ดดิบ · โค้ดดิบอยู่ในหน่วยความจำเท่านั้น

export type InviteStatus = "active" | "exhausted" | "expired" | "revoked";

export function inviteStatus(
  row: { maxUses: number; usesCount: number; expiresAt: Date; revokedAt: Date | null },
  now: Date,
): InviteStatus {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt <= now) return "expired";
  if (row.usesCount >= row.maxUses) return "exhausted";
  return "active";
}

/** ตรวจโดยไม่ใช้สิทธิ์ — true เมื่อโค้ด active (ใช้ที่ /api/invite/check และจุดกั้นก่อนส่ง OTP) */
export async function isInviteActive(db: AppDb, normalizedCode: string, now: Date): Promise<boolean> {
  const rows = await db
    .select({ id: inviteCode.id })
    .from(inviteCode)
    .where(
      and(
        eq(inviteCode.codeHash, hashInviteCode(normalizedCode)),
        isNull(inviteCode.revokedAt),
        gt(inviteCode.expiresAt, now),
        lt(inviteCode.usesCount, inviteCode.maxUses),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * ใช้ 1 สิทธิ์แบบ atomic (คำสั่งเดียว) — คืน id ของโค้ดเมื่อสำเร็จ · null = ใช้ไม่ได้ (ผิด/หมดอายุ/ครบ/ถูกยกเลิก ไม่แยกเหตุผล)
 * หลายคำขอพร้อมกันเกิน max_uses ไม่ได้ เพราะเงื่อนไข uses_count < max_uses ตรวจในคำสั่ง UPDATE เดียวกัน
 */
export async function consumeInvite(db: AppDb, normalizedCode: string, now: Date): Promise<string | null> {
  const rows = await db
    .update(inviteCode)
    .set({ usesCount: plusOne(inviteCode.usesCount) })
    .where(
      and(
        eq(inviteCode.codeHash, hashInviteCode(normalizedCode)),
        isNull(inviteCode.revokedAt),
        gt(inviteCode.expiresAt, now),
        lt(inviteCode.usesCount, inviteCode.maxUses),
      ),
    )
    .returning({ id: inviteCode.id });
  return rows[0]?.id ?? null;
}

export type CreatedInvite = { id: string; code: string; display: string; expiresAt: Date; maxUses: number; label: string };

/** สร้างโค้ดใหม่ — คืนโค้ดดิบ "ครั้งเดียว" (ไม่มีทางอ่านย้อนหลัง) */
export async function createInvite(
  db: AppDb,
  input: { label: string; maxUses: number; days: number },
  now: Date,
): Promise<CreatedInvite> {
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1) throw new Error("maxUses must be an integer >= 1");
  if (!Number.isFinite(input.days) || input.days <= 0) throw new Error("days must be > 0");
  const expiresAt = new Date(now.getTime() + input.days * 86_400_000);
  // ชนกันแทบเป็นไปไม่ได้ (31^8) แต่ UNIQUE กันไว้ — ลองใหม่ได้
  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode();
    const id = crypto.randomUUID();
    const inserted = await db
      .insert(inviteCode)
      .values({ id, codeHash: hashInviteCode(code), label: input.label, maxUses: input.maxUses, usesCount: 0, expiresAt, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: inviteCode.id });
    if (inserted.length > 0) {
      return { id, code, display: formatInviteCode(code), expiresAt, maxUses: input.maxUses, label: input.label };
    }
  }
  throw new Error("could not generate a unique invite code");
}

export type InviteListRow = {
  id: string;
  label: string;
  status: InviteStatus;
  usesCount: number;
  maxUses: number;
  expiresAt: Date;
  createdAt: Date;
};

/** ค่าเริ่มต้น = created_at ASC ไม่จำกัด (สคริปต์ npm run invite) · หน้าแอดมินใช้ { order: "newest", limit: 200 } */
export async function listInvites(
  db: AppDb,
  now: Date,
  opts: { order?: "oldest" | "newest"; limit?: number } = {},
): Promise<InviteListRow[]> {
  const q = db
    .select()
    .from(inviteCode)
    .orderBy(...(opts.order === "newest" ? [desc(inviteCode.createdAt), desc(inviteCode.id)] : [asc(inviteCode.createdAt)]));
  const rows = await (opts.limit === undefined ? q : q.limit(opts.limit));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    status: inviteStatus(r, now),
    usesCount: r.usesCount,
    maxUses: r.maxUses,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

/** ยกเลิกด้วย id หรือด้วยโค้ดดิบ (normalized) · คืนจำนวนแถวที่ยกเลิก (0 = ไม่พบหรือยกเลิกไปแล้ว) */
export async function revokeInvite(
  db: AppDb,
  by: { id: string } | { normalizedCode: string },
  now: Date,
): Promise<number> {
  const target = "id" in by ? eq(inviteCode.id, by.id) : eq(inviteCode.codeHash, hashInviteCode(by.normalizedCode));
  const rows = await db
    .update(inviteCode)
    .set({ revokedAt: now })
    .where(and(target, isNull(inviteCode.revokedAt)))
    .returning({ id: inviteCode.id });
  return rows.length;
}

/**
 * เพิกถอนด้วย id สำหรับ API แอดมิน (ADR 0007) · คำสั่งเดียว: เฉพาะที่ยังไม่ถูกเพิกถอนและยังไม่หมดอายุ
 * (exhausted ที่ยังไม่หมดอายุ → revoked) · 0 แถว → มี id = unchanged · ไม่มี = not_found
 */
export async function revokeInviteById(db: AppDb, id: string, now: Date): Promise<"revoked" | "unchanged" | "not_found"> {
  const rows = await db
    .update(inviteCode)
    .set({ revokedAt: now })
    .where(and(eq(inviteCode.id, id), isNull(inviteCode.revokedAt), gt(inviteCode.expiresAt, now)))
    .returning({ id: inviteCode.id });
  if (rows.length > 0) return "revoked";
  const exists = await db.select({ id: inviteCode.id }).from(inviteCode).where(eq(inviteCode.id, id)).limit(1);
  return exists.length > 0 ? "unchanged" : "not_found";
}
