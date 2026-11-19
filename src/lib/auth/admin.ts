import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appAdmin } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { HttpError } from "@/lib/data/shared/http-error";
import { requireUser, type AuthedUser } from "./server";

// สิทธิ์แอดมิน (ADR 0007 ข้อ 2) · ตรวจจากฐานข้อมูลทุกคำขอ ไม่ cache · ในแอปมีแต่ SELECT ตาราง app_admin
// หน้าจอที่ import ไฟล์นี้ได้: src/app/(admin)/admin/**/page.tsx เท่านั้น

export async function isAdmin(db: AppDb, userId: string): Promise<boolean> {
  const rows = await db.select({ userId: appAdmin.userId }).from(appAdmin).where(eq(appAdmin.userId, userId)).limit(1);
  return rows.length > 0;
}

/** ไม่มี session / หมดอายุ / ไม่ใช่แอดมิน → 404 not_found เหมือนกันทุกกรณี (ไม่บอกว่าเส้นทางนี้มีอยู่) · DB ล่ม → ปล่อยเป็น 500 */
export async function requireAdmin(headers: Headers, db: AppDb = getDb()): Promise<AuthedUser> {
  let u: AuthedUser;
  try {
    u = await requireUser(headers);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw new HttpError(404, "not_found");
    throw e;
  }
  if (!(await isAdmin(db, u.userId))) throw new HttpError(404, "not_found");
  return u;
}
