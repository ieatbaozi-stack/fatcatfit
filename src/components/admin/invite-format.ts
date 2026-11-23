// ฟังก์ชันล้วนของหน้าออกโค้ดเชิญ: ลิงก์ · วันเวลา · เวลารอ (UX 11.4, 11.7)

import { ADMIN_INVITE_MAX_USES_MAX } from "@/lib/data/shared/admin-invite";

/** ลิงก์เชิญ = origin ของหน้าที่เปิดอยู่ + /welcome#invite=โค้ด (เหมือนที่ /welcome อ่านอยู่แล้ว) */
export function buildInviteLink(origin: string, code: string): string {
  return `${origin}/welcome#invite=${code}`;
}

/** วัน + เดือนย่อ + ชั่วโมง:นาที 24 ชม. ตามเวลาเครื่อง · ปีแสดงเฉพาะเมื่อไม่ใช่ปีปัจจุบัน · th ใช้ ค.ศ. */
export function formatInviteDate(iso: string, locale: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tag = locale === "th" ? "th-TH-u-ca-gregory" : "en";
  return new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export type WaitParts = { kind: "hoursMinutes"; h: number; m: number } | { kind: "minutes"; m: number } | { kind: "underMinute" };

/** วินาทีที่เหลือ → ส่วนที่ใช้เลือกข้อความ ("h ชม. m นาที" / "m นาที" / "ไม่ถึงนาที") · ปัดนาทีขึ้น */
export function splitWait(seconds: number): WaitParts {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return { kind: "underMinute" };
  const totalMin = Math.ceil(s / 60);
  if (totalMin < 60) return { kind: "minutes", m: totalMin };
  return { kind: "hoursMinutes", h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

/** ค่าจำนวนคนที่ผู้ใช้พิมพ์ → ดึงเข้าช่วง 1..10 (ว่าง/ไม่ใช่ตัวเลข = ไม่มีค่า) */
export function clampUses(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.min(ADMIN_INVITE_MAX_USES_MAX, Math.max(1, Math.round(n)));
}

/** ตัดช่องว่างหัวท้ายแล้วนับเป็นอักขระ (ตรงกับ zod ฝั่งเซิร์ฟเวอร์) */
export function labelLength(label: string): number {
  return [...label.trim()].length;
}
