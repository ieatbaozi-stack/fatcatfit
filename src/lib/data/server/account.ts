import "server-only";
import { eq, inArray } from "drizzle-orm";
import { authThrottle, inviteCode, user, verification } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { adminInviteKey, otpEmailKeys, otpVerificationIdentifiers } from "@/lib/auth/throttle";

// DELETE /api/me — ลบบัญชีและข้อมูลทั้งหมดใน transaction เดียว (ADR 0002 ข้อ 7 · ADR 0003 ข้อ 5)
// ลบแถว verification/auth_throttle ที่ผูกกับอีเมลด้วย key ตรงตัว (ห้าม LIKE) แล้วลบ user → ตารางลูกหายด้วย cascade

// ป้ายของโค้ดเชิญอาจระบุตัวคนที่สมัคร (เช่น ชื่อเพื่อน) → ล้างเป็นค่ากลางเมื่อบัญชีนั้นถูกลบ (boss ตัดสิน 2026-11-20)
// ล้างทุกโค้ดที่บัญชีใช้สมัคร รวมโค้ดหลายสิทธิ์ (maxUses > 1) · ไม่แตะโค้ดอื่น
export const DELETED_INVITE_LABEL = "—";

export async function deleteAccount(db: AppDb, userId: string, email: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(verification).where(inArray(verification.identifier, otpVerificationIdentifiers(email)));
    await tx.delete(authThrottle).where(inArray(authThrottle.key, otpEmailKeys(email)));
    await tx.delete(authThrottle).where(eq(authThrottle.key, adminInviteKey(userId)));
    const [u] = await tx.select({ inviteCodeId: user.inviteCodeId }).from(user).where(eq(user.id, userId)).limit(1);
    if (u?.inviteCodeId) await tx.update(inviteCode).set({ label: DELETED_INVITE_LABEL }).where(eq(inviteCode.id, u.inviteCodeId));
    await tx.delete(user).where(eq(user.id, userId));
  });
}
