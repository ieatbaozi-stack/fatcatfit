// ตารางตัดสินของ AuthGate (ADR 0006 ข้อ 3) — ฟังก์ชันบริสุทธิ์ ไม่แตะเบราว์เซอร์/เครือข่าย
// รับสถานะเครือข่ายและ hint เป็นพารามิเตอร์ (ช่วง B ต่อกับ useOnline / auth-hint)

/** ชนิดของจอ: public = /welcome · setup = /consent /onboarding · app = หน้าในแอป */
export type ScreenKind = "public" | "setup" | "app";
export type Net = "online" | "offline";
export type MeState = "consent_required" | "onboarding_required" | "ready";

/** ผลของ GET /api/me ที่ย่อแล้ว: pending = ยังไม่ตอบ · unauthorized = 401 · error = 5xx/ตอบไม่ได้ทั้งที่ออนไลน์ */
export type MeResult =
  | { status: "pending" }
  | { status: "unauthorized" }
  | { status: "error" }
  | { status: "ok"; state: MeState };

/** hint ใน localStorage `fcf:auth` (ไม่ใช่สิทธิ์ ใช้แค่ตัดสินตอนออฟไลน์) */
export type Hint = "ready" | null;

export type HintOp = "set" | "clear";

export type Decision =
  /** อยู่จอเดิม · offline = ให้แสดงสถานะออฟไลน์ (ปุ่มปิด / แถบ) */
  | { action: "stay"; offline?: boolean; hint?: HintOp }
  /** router.replace(to) — ใช้เฉพาะตอนออนไลน์และได้ผลชี้ขาด */
  | { action: "go"; to: string; hint?: HintOp }
  /** จอผิดพลาดทั้งจอ (#23) + ลองใหม่ */
  | { action: "error" }
  /** แสดงจอยินดีต้อนรับแบบออฟไลน์แทนเนื้อหาในที่เดิม (ไม่เปลี่ยน URL) */
  | { action: "offline-welcome" };

export const SETUP_PATHS = { consent: "/consent", onboarding: "/onboarding" } as const;

/**
 * @param here path ปัจจุบัน — ใช้เฉพาะ kind "setup" (อยู่ถ้าเป็นจอของสถานะนั้น ไม่งั้นไป)
 */
export function decideRoute(kind: ScreenKind, net: Net, me: MeResult, hint: Hint, here = ""): Decision {
  // ออฟไลน์: ไม่เปลี่ยนหน้าเด็ดขาด (กัน redirect วน — ADR 0006 ข้อ 3)
  if (net === "offline") {
    if (kind === "app" && hint !== "ready") return { action: "offline-welcome" };
    return { action: "stay", offline: true };
  }

  if (me.status === "pending") return { action: "stay" };

  if (me.status === "error") {
    if (kind === "public") return { action: "stay" };
    if (kind === "setup") return { action: "error" };
    return hint === "ready" ? { action: "stay" } : { action: "error" };
  }

  if (me.status === "unauthorized") {
    return kind === "public" ? { action: "stay", hint: "clear" } : { action: "go", to: "/welcome", hint: "clear" };
  }

  switch (me.state) {
    case "consent_required":
      return kind === "setup" && here === SETUP_PATHS.consent
        ? { action: "stay" }
        : { action: "go", to: SETUP_PATHS.consent };
    case "onboarding_required":
      return kind === "setup" && here === SETUP_PATHS.onboarding
        ? { action: "stay" }
        : { action: "go", to: SETUP_PATHS.onboarding };
    case "ready":
      return kind === "app" ? { action: "stay", hint: "set" } : { action: "go", to: "/", hint: "set" };
  }
}
