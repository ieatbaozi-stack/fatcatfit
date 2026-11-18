// ช่วยเรื่องช่องโค้ดเชิญฝั่งไคลเอนต์ (ไม่มี React) — รูปแบบเดียวกับ src/lib/auth/invite-code.ts ของ platform
// (คัดลอกชุดตัวอักษรมา เพราะไฟล์นั้น import node:crypto ใช้ในเบราว์เซอร์ไม่ได้) · เซิร์ฟเวอร์ตัดสินจริงเสมอ

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

/** ตัวพิมพ์ใหญ่ ตัดขีด/ช่องว่าง/ตัวที่ไม่ใช่ชุดตัวอักษร · ไม่เกิน 8 ตัว */
export function compactInvite(input: string): string {
  let out = "";
  for (const ch of input.toUpperCase()) {
    if (ALPHABET.includes(ch)) out += ch;
    if (out.length === LENGTH) break;
  }
  return out;
}

/** แสดงเป็น XXXX-XXXX ระหว่างพิมพ์ */
export function formatInviteInput(input: string): string {
  const c = compactInvite(input);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function isInviteShapeValid(input: string): boolean {
  return compactInvite(input).length === LENGTH;
}

/**
 * อ่านโค้ดจาก fragment `#invite=XXXX-XXXX` (ADR 0006: fragment ไม่ไปถึงเซิร์ฟเวอร์/log)
 * คืน null ถ้าไม่มี · ไม่ตรวจว่าโค้ดใช้ได้ (ตรวจตอนกดปุ่ม)
 */
export function readInviteFromHash(hash: string): string | null {
  const m = /^#invite=([^&]*)/.exec(hash);
  if (!m) return null;
  let raw = m[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // ใช้ค่าดิบ
  }
  const formatted = formatInviteInput(raw);
  return formatted === "" ? null : formatted;
}

/** ข้อความ error จาก ?error= ของ callback Google → กลุ่มที่ UI รู้จัก */
export function classifyCallbackError(code: string | null): "invite_required" | "generic" | null {
  if (!code) return null;
  return code.toLowerCase() === "invite_required" ? "invite_required" : "generic";
}
