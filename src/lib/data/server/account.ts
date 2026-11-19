import "server-only";
import { eq, inArray } from "drizzle-orm";
import { authThrottle, user, verification } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { adminInviteKey, otpEmailKeys, otpVerificationIdentifiers } from "@/lib/auth/throttle";

// DELETE /api/me — ลบบัญชีและข้อมูลทั้งหมดใน transaction เดียว (ADR 0002 ข้อ 7 · ADR 0003 ข้อ 5)
// ลบแถว verification/auth_throttle ที่ผูกกับอีเมลด้วย key ตรงตัว (ห้าม LIKE) แล้วลบ user → ตารางลูกหายด้วย cascade

export async function deleteAccount(db: AppDb, userId: string, email: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(verification).where(inArray(verification.identifier, otpVerificationIdentifiers(email)));
    await tx.delete(authThrottle).where(inArray(authThrottle.key, otpEmailKeys(email)));
    await tx.delete(authThrottle).where(eq(authThrottle.key, adminInviteKey(userId)));
    await tx.delete(user).where(eq(user.id, userId));
  });
}
