import "server-only";
import { and, eq } from "drizzle-orm";
import { consentRecord } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { HttpError } from "@/lib/data/shared/http-error";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";

// POST /api/consent — บันทึกการยินยอมประกาศเวอร์ชันปัจจุบัน (ส่งซ้ำได้ ไม่เกิดแถวซ้ำ: UNIQUE(user_id, notice_version))

export async function recordConsent(
  db: AppDb,
  userId: string,
  input: { noticeVersion: string; locale: "th" | "en" },
  now: Date,
): Promise<{ noticeVersion: string; acceptedAt: string }> {
  // ผู้ใช้ต้องยินยอมเวอร์ชันที่ตัวเองเห็นจริง — หน้าเก่าที่ค้างในแคชส่งเวอร์ชันเก่า → ให้โหลดใหม่
  if (input.noticeVersion !== PRIVACY_NOTICE_VERSION) {
    throw new HttpError(409, "notice_version_mismatch", { current: PRIVACY_NOTICE_VERSION });
  }
  await db
    .insert(consentRecord)
    .values({ id: crypto.randomUUID(), userId, noticeVersion: PRIVACY_NOTICE_VERSION, acceptedAt: now, locale: input.locale })
    .onConflictDoNothing();
  const [row] = await db
    .select({ acceptedAt: consentRecord.acceptedAt })
    .from(consentRecord)
    .where(and(eq(consentRecord.userId, userId), eq(consentRecord.noticeVersion, PRIVACY_NOTICE_VERSION)))
    .limit(1);
  return { noticeVersion: PRIVACY_NOTICE_VERSION, acceptedAt: row.acceptedAt.toISOString() };
}
