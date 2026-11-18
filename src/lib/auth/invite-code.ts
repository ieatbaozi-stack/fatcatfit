import { createHash, randomInt } from "node:crypto";

// รูปแบบโค้ดเชิญ (ADR 0002 ข้อ 2): 8 ตัวจากชุดที่ไม่สับสน (ไม่มี I L O 0 1) แสดงเป็น XXXX-XXXX
// ไม่สนตัวพิมพ์/ขีด · เก็บเฉพาะ sha256 ของรูปแบบที่ normalize แล้ว
// ไฟล์นี้ไม่แตะฐานข้อมูล · ห้าม log ค่าโค้ดดิบ

export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

/** ชื่อ cookie ที่พักโค้ดดิบระหว่างเริ่ม flow สมัคร (HttpOnly · Path=/api/auth · 30 นาที) */
export const INVITE_COOKIE = "fcf_invite";
export const INVITE_COOKIE_MAX_AGE_S = 1800;
export const INVITE_COOKIE_PATH = "/api/auth";

/** ตัดขีด/ช่องว่าง แปลงเป็นตัวพิมพ์ใหญ่ · คืน null ถ้ารูปแบบไม่ใช่โค้ดเชิญ (ไม่ต้องไปถามฐานข้อมูล) */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const compact = input.replace(/[\s-]/g, "").toUpperCase();
  if (compact.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of compact) if (!INVITE_ALPHABET.includes(ch)) return null;
  return compact;
}

export function formatInviteCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function hashInviteCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** สร้างโค้ดใหม่ด้วยตัวสุ่มของระบบ (crypto.randomInt ไม่มี modulo bias) · คืนรูป normalized */
export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}
