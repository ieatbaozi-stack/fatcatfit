import "server-only";
import { getDb } from "@/db/client";
import { selectOne } from "@/db/sql-helpers";

/** query ฐานข้อมูล 1 ครั้ง · คืน true เมื่อใช้ได้ ไม่โยน error (ไม่ปล่อยข้อความ error ออกไป) */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await getDb().execute(selectOne);
    return true;
  } catch {
    // ไม่ log error object เพราะอาจมี connection string
    console.error("health: database check failed");
    return false;
  }
}
