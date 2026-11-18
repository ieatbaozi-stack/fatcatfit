import type { SendOtpEmail } from "./email-port";

// จุดต่อสายกับชั้นส่งอีเมลของ ops-release (src/lib/email) — ยังไม่มีชั้นนั้นในขั้นนี้
// เมื่อ ops-release ส่งมอบ ให้แทนไส้ในด้วย: import { sendOtpEmail as send } from "@/lib/email"; แล้ว export const sendOtpEmail = send;
export const sendOtpEmail: SendOtpEmail = async () => {
  throw new Error("email transport is not wired yet (src/lib/auth/mailer.ts)");
};
