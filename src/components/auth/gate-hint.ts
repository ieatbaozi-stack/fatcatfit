// hint ใน localStorage (ไม่ใช่ข้อมูลส่วนตัว ไม่ใช่สิทธิ์) — ADR 0006 ข้อ 3
// ช่วง A: อ่าน/เขียนตรงที่นี่ · ช่วง B: ให้ไฟล์นี้เรียกต่อ `src/pwa/auth-hint.ts` (pwa-offline) แทน — เปลี่ยนเฉพาะตัวไฟล์นี้
import type { Hint, HintOp } from "./decide-route";

export const AUTH_HINT_KEY = "fcf:auth";
export const KNOWN_DEVICE_KEY = "fcf:known-device";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // โหมดส่วนตัว / ถูกบล็อก
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // เขียนไม่ได้ = ไม่มี hint (ปลอดภัย: ออฟไลน์จะได้จอยินดีต้อนรับ)
  }
}

export function getAuthHint(): Hint {
  return read(AUTH_HINT_KEY) === "ready" ? "ready" : null;
}

export function applyHintOp(op: HintOp | undefined): void {
  if (op === "set") {
    write(AUTH_HINT_KEY, "ready");
    write(KNOWN_DEVICE_KEY, "1");
  } else if (op === "clear") {
    write(AUTH_HINT_KEY, null);
  }
}

/** เครื่องนี้เคยเข้าสู่ระบบสำเร็จ → ซ่อนช่องโค้ดเชิญบนจอยินดีต้อนรับ (UX E1 ข้อ 4) */
export function isKnownDevice(): boolean {
  return read(KNOWN_DEVICE_KEY) === "1";
}
