// hint สถานะบัญชีในเครื่อง (ADR 0006 ข้อ 3) — frontend อ่าน/ตั้ง/ล้างผ่านฟังก์ชันในไฟล์นี้เท่านั้น
// - ไม่ใช่สิทธิ์และไม่ใช่ข้อมูลส่วนตัว: ใช้ตัดสินว่าตอนออฟไลน์จะแสดงหน้าแอปหรือจอยินดีต้อนรับ · ด่านจริงอยู่ที่ API
// - localStorage อาจใช้ไม่ได้ (โหมดส่วนตัว, ถูกบล็อก, SSR) หรือถูกล้างโดยเบราว์เซอร์ → ทุกครั้งครอบ try/catch
//   อ่านไม่ได้ = ถือว่าไม่มี hint (ปลอดภัย: ออฟไลน์ได้จอยินดีต้อนรับ ออนไลน์ AuthGate ถาม /api/me ตามปกติ)
// R3 อาจย้ายไป IndexedDB `fcf:device` โดยคง signature เดิม

/** `"ready"` = ล็อกอินครบ (ยินยอม + แบบสอบถาม) ล่าสุดที่ /api/me ตอบ */
export const AUTH_HINT_KEY = "fcf:auth";
/** เครื่องนี้เคยล็อกอินสำเร็จ — ซ่อนช่องโค้ดเชิญ (UX E1 ข้อ 4) · ล้างเฉพาะตอนลบบัญชี */
export const KNOWN_DEVICE_KEY = "fcf:known-device";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // เข้าถึง localStorage แล้วโยน (เช่น Safari บล็อก storage)
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // เต็ม/ถูกบล็อก — ไม่มี hint ก็ทำงานได้
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // ถูกบล็อก — ไม่มีอะไรให้ล้าง
  }
}

export function getAuthHint(): "ready" | null {
  return read(AUTH_HINT_KEY) === "ready" ? "ready" : null;
}

export function setAuthHint(value: "ready"): void {
  if (value !== "ready") return;
  write(AUTH_HINT_KEY, value);
}

export function clearAuthHint(): void {
  remove(AUTH_HINT_KEY);
}

export function isKnownDevice(): boolean {
  return read(KNOWN_DEVICE_KEY) === "1";
}

export function markKnownDevice(): void {
  write(KNOWN_DEVICE_KEY, "1");
}

export function clearKnownDevice(): void {
  remove(KNOWN_DEVICE_KEY);
}
