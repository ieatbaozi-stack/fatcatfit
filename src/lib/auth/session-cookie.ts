import { getSessionCookie } from "better-auth/cookies";

// ตรวจแค่ "มี cookie session ไหม" (ADR 0006 ข้อ 2) — ไม่ตรวจความถูกต้อง ไม่แตะฐานข้อมูล ไม่ import db
// ใช้ใน layout ของกลุ่ม (app)/(setup) เพื่อ 307 ไป /welcome · ด่านจริงของข้อมูลอยู่ที่ requireUser() ใน API
// getSessionCookie รับทั้งชื่อปกติและชื่อมี prefix __Secure-

export function hasSessionCookie(headers: Headers): boolean {
  return getSessionCookie(headers) !== null;
}
