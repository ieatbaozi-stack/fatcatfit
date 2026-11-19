import "server-only";
import { getDb } from "@/db/client";
import { selectOne } from "@/db/sql-helpers";

/** เพดานเวลารวมของการตรวจ — ต้องน้อยกว่า 5 วิ (contract R1 เกณฑ์ 15) แม้ driver ไม่ยอมล้ม */
export const HEALTH_TIMEOUT_MS = 4500;

/** query ฐานข้อมูล 1 ครั้ง · คืน true เมื่อใช้ได้ ไม่โยน error (ไม่ปล่อยข้อความ error ออกไป) */
export async function isDatabaseHealthy(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), HEALTH_TIMEOUT_MS);
    });
    await Promise.race([getDb().execute(selectOne), timeout]);
    return true;
  } catch {
    // ไม่ log error object เพราะอาจมี connection string
    console.error("health: database check failed");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
