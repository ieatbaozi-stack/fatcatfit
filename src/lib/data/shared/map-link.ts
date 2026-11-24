// ตัวตรวจลิงก์ Google Maps (CR3 D1 · ผลวิจัย docs/research/2026-11-24-cr3-google-maps-links.md)
// ฟังก์ชันเดียว ใช้ร่วมไคลเอนต์ (ฟอร์ม/ปุ่มเปิดแผนที่) กับเซิร์ฟเวอร์ (ตัดสินจริง) — เซิร์ฟเวอร์ไม่เปิด/ขยายลิงก์

export const MAP_URL_MAX = 500;

/** รูปที่รับ: https เท่านั้น · host ตรงเป๊ะ (ไม่รับโดเมนประเทศ/ซับโดเมนอื่น) · เส้นทางตามที่กำหนดต่อ host */
const ALLOWED: ReadonlyArray<{ host: string; path: (p: string) => boolean }> = [
  { host: "maps.app.goo.gl", path: (p) => p.length > 1 },
  { host: "www.google.com", path: (p) => p === "/maps" || p.startsWith("/maps/") },
  { host: "google.com", path: (p) => p === "/maps" || p.startsWith("/maps/") },
  { host: "maps.google.com", path: () => true },
  { host: "goo.gl", path: (p) => p.startsWith("/maps/") },
];

/**
 * คืนลิงก์ที่ตัดช่องว่างหัวท้ายแล้วถ้าเป็นลิงก์ Google Maps ที่รับได้ ไม่งั้นคืน null
 * (เก็บข้อความตามที่ผู้ใช้วาง ไม่แปลงรูป)
 */
export function normalizeMapUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (s.length < 1 || s.length > MAP_URL_MAX) return null;
  // ห้ามช่องว่าง/อักขระควบคุมกลางลิงก์ (new URL() ตัดแท็บ/ขึ้นบรรทัดใหม่ทิ้งเงียบๆ)
  if (/[\s\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port !== "" && u.port !== "443") return null;
  const rule = ALLOWED.find((a) => a.host === u.hostname);
  if (!rule || !rule.path(u.pathname)) return null;
  return s;
}

export const isValidMapUrl = (input: unknown): boolean => normalizeMapUrl(input) !== null;
