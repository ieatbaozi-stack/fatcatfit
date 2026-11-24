// ชื่อฐาน IndexedDB ของคิวออฟไลน์ + ผู้ใช้ปัจจุบันของเครื่อง (ADR 0004 ข้อ 2, 8) — ที่เดียว
// src/lib/offline เปิด/เขียนฐาน · ไฟล์นี้ให้ชื่อ และลบฐานตอนออกจากระบบ (reset-device.ts) โดยไม่ต้องพึ่งโค้ดแอป
// user id ไม่ใช่ข้อมูลสุขภาพ: เก็บใน localStorage เพื่อเปิดฐานที่ถูกต้องตอนเปิดแอปแบบออฟไลน์ (ถาม /api/me ไม่ได้)

/** ฐานต่อผู้ใช้ `fcf:v1:<user_id>` */
export const OFFLINE_DB_PREFIX = "fcf:v1:";
export const offlineDbName = (userId: string) => `${OFFLINE_DB_PREFIX}${userId}`;

/** user id ของคนที่ใช้คิวในเครื่องนี้ล่าสุด · ล้างตอนออกจากระบบ/ลบบัญชี */
export const OFFLINE_USER_KEY = "fcf:offline-user";

const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getOfflineUserId(): string | null {
  try {
    const v = ls()?.getItem(OFFLINE_USER_KEY) ?? null;
    return v && USER_ID.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setOfflineUserId(userId: string): void {
  if (!USER_ID.test(userId)) return;
  try {
    ls()?.setItem(OFFLINE_USER_KEY, userId);
  } catch {
    // เต็ม/ถูกบล็อก — เปิดแอปออฟไลน์ครั้งหน้าจะไม่รู้ว่าใคร (ได้จอเหมือนไม่มีคิว จนกว่าออนไลน์)
  }
}

export function clearOfflineUserId(): void {
  try {
    ls()?.removeItem(OFFLINE_USER_KEY);
  } catch {
    // ถูกบล็อก
  }
}

/**
 * ลบฐานของผู้ใช้ทั้งก้อน · ไม่โยน error
 * แท็บที่เปิดฐานค้าง (รวมแท็บนี้) ปิดตัวเองเมื่อได้ versionchange (idb-store.ts) · ยังถูกบล็อก → ไม่รอเกิน timeoutMs
 * (คำขอลบยังค้างในเบราว์เซอร์ และสำเร็จเมื่อแท็บนั้นปิด)
 */
export async function deleteOfflineDb(userId: string, opts: { idb?: IDBFactory; timeoutMs?: number } = {}): Promise<boolean> {
  const idb = opts.idb ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
  if (!idb) return false;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), opts.timeoutMs ?? 2000);
    try {
      const r = idb.deleteDatabase(offlineDbName(userId));
      r.onsuccess = () => {
        clearTimeout(timer);
        resolve(true);
      };
      r.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

/**
 * ขอให้เบราว์เซอร์ไม่ล้างข้อมูลในเครื่องเอง (ของแถม ไม่พึ่ง — research 2026-11-24-r3-ios-pwa ข้อ 2:
 * iOS มี persist() แต่อนุมัติตามฮิวริสติก ไม่การันตี) · คืนผล true/false · ไม่มี API/ล้ม = false
 */
export async function requestPersistentStorage(nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator): Promise<boolean> {
  try {
    const sm = nav?.storage;
    if (!sm || typeof sm.persist !== "function") return false;
    if (typeof sm.persisted === "function" && (await sm.persisted())) return true;
    return await sm.persist();
  } catch {
    return false;
  }
}
