// ตัวแปลง HintOp ของตารางตัดสิน → ฟังก์ชันของ `@/pwa/auth-hint` (เจ้าของ localStorage `fcf:auth` / `fcf:known-device`)
import { clearAuthHint, getAuthHint as readAuthHint, isKnownDevice as readKnownDevice, markKnownDevice, setAuthHint } from "@/pwa/auth-hint";
import type { Hint, HintOp } from "./decide-route";

export function getAuthHint(): Hint {
  return readAuthHint();
}

export function applyHintOp(op: HintOp | undefined): void {
  if (op === "set") {
    setAuthHint("ready");
    markKnownDevice();
  } else if (op === "clear") {
    clearAuthHint();
  }
}

/** เครื่องนี้เคยเข้าสู่ระบบสำเร็จ → ซ่อนช่องโค้ดเชิญบนจอยินดีต้อนรับ (UX E1 ข้อ 4) */
export function isKnownDevice(): boolean {
  return readKnownDevice();
}
