// ค่าตั้งของจอเข้าสู่ระบบ — จุดเดียว

/**
 * ซ่อนปุ่ม Google ในแอปที่ติดตั้งบน iPhone/iPad (UX E1 ข้อ 5 · ADR 0002 ทางถอยข้อ 3)
 * ปิดไว้ก่อน — เปิด (true) เฉพาะเมื่อผลทดสอบเครื่องจริง R1 บอกว่า Google ใช้ไม่ได้ในแอปที่ติดตั้ง
 */
export const HIDE_GOOGLE_ON_IOS_STANDALONE = false;

/** ปุ่ม Google แสดงเมื่อไม่เข้าเงื่อนไขซ่อน (iOS **และ** standalone เท่านั้น — Safari แท็บและ Android ยังมี) */
export function shouldShowGoogle(flag: boolean, isIos: boolean, standalone: boolean): boolean {
  return !(flag && isIos && standalone);
}

/** อ่านจากเบราว์เซอร์ (เรียกฝั่งไคลเอนต์หลัง hydrate เท่านั้น) */
export function detectIosStandalone(): { isIos: boolean; standalone: boolean } {
  const ua = navigator.userAgent;
  // iPadOS 13+ แจ้งตัวเป็น Mac แต่มีจอสัมผัส
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { isIos, standalone };
}
