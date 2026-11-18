import { lt, sql } from "drizzle-orm";
import { rateLimit, verification } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { purgeExpiredThrottles } from "./throttle";

// งานล้างรายวัน (ARCHITECTURE ข้อ 4) · ลบเฉพาะแถวที่หมดความหมายแล้ว

/** หน้าต่าง limiter ของ Better Auth ยาวสุด 10 นาที — แถวที่ last_request เก่ากว่า 1 วันไม่มีผลต่อการนับแล้ว */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type CleanupResult = { rateLimit: number; verification: number; authThrottle: number };

export async function runDailyCleanup(db: AppDb, now: Date): Promise<CleanupResult> {
  await db.execute(sql`select 1`); // health check เบาๆ (ADR 0001 ข้อ 8)
  const rl = await db
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, now.getTime() - RATE_LIMIT_RETENTION_MS))
    .returning({ id: rateLimit.id });
  const vf = await db.delete(verification).where(lt(verification.expiresAt, now)).returning({ id: verification.id });
  const th = await purgeExpiredThrottles(db, now);
  return { rateLimit: rl.length, verification: vf.length, authThrottle: th };
}
