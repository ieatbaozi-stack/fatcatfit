import { and, eq } from "drizzle-orm";
import { consentRecord } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";

/** ผู้ใช้เคยยินยอมประกาศเวอร์ชันปัจจุบันหรือยัง (ADR 0002 ข้อ 6) — เวอร์ชันเก่าไม่นับ */
export async function hasCurrentConsent(db: AppDb, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: consentRecord.id })
    .from(consentRecord)
    .where(and(eq(consentRecord.userId, userId), eq(consentRecord.noticeVersion, PRIVACY_NOTICE_VERSION)))
    .limit(1);
  return rows.length > 0;
}
