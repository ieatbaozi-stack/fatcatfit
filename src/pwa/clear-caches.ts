// ล้าง cache ที่ผูกกับผู้ใช้ตอนออกจากระบบ/ลบบัญชี (ADR 0004 ข้อ 8)
// ลบ: HTML ของหน้าที่ cache ไว้ + ทุก cache ที่ขึ้นต้น `user-` · คงไว้: asset ที่มี hash และ precache
// R1 เรียกจาก flow ออกจากระบบ (ฐาน IndexedDB ของผู้ใช้ล้างใน src/lib/offline)
import { isUserScopedCache } from "./strategy";

type CacheStorageLike = Pick<CacheStorage, "keys" | "delete">;

/** คืนรายชื่อ cache ที่ลบ · เบราว์เซอร์ไม่มี Cache Storage → ไม่ทำอะไร */
export async function clearUserCaches(storage: CacheStorageLike | undefined = globalThis.caches): Promise<string[]> {
  if (!storage) return [];
  const names = (await storage.keys()).filter(isUserScopedCache);
  await Promise.all(names.map((name) => storage.delete(name)));
  return names;
}
