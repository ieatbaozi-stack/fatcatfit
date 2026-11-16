// ค่าที่หน้าเว็บกับ service worker ใช้ร่วมกัน

/** URL ของ service worker (สร้างโดย src/app/serwist/[path]/route.ts) */
export const SW_URL = "/serwist/sw.js";

/** scope ของ service worker — ทั้งแอป */
export const SW_SCOPE = "/";

/**
 * หน้าเว็บส่งข้อความนี้ให้ SW ที่รออยู่ตอนเปิดแอป เพื่อให้รุ่นใหม่ activate ก่อนผู้ใช้เริ่มจด
 * ต้องตรงกับที่ Serwist ฟังเมื่อ `skipWaiting: false` (node_modules/serwist/src/Serwist.ts)
 */
export const SKIP_WAITING_MESSAGE = "SKIP_WAITING";

/** หน้าเว็บแจ้งภาษาปัจจุบันของหน้า (`<html lang>`) ให้ SW: `{ type, lang }` — SW ล้าง/ดึงหน้าที่ cache ภาษาอื่นใหม่ */
export const PAGE_LANG_MESSAGE = "FCF_PAGE_LANG";
