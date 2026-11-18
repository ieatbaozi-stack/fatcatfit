import type { OtpLocale } from "@/lib/auth/email-port";

// แม่แบบอีเมล OTP — มีแค่รหัส + อายุ + ข้อความ "ไม่ได้ขอ ไม่ต้องทำอะไร" · ไม่มีลิงก์ (กันฟิชชิ่ง)
// ข้อความอยู่ที่นี่ ไม่ใช่ messages/** เพราะอีเมลไม่ได้ผ่าน next-intl ของ request

export const OTP_TTL_MINUTES = 10;

export type RenderedEmail = { subject: string; text: string; html: string };

const COPY = {
  th: {
    subject: "รหัสเข้าสู่ระบบ Fat Cat Fit",
    intro: "รหัสเข้าสู่ระบบของคุณคือ",
    expiry: `รหัสนี้ใช้ได้ ${OTP_TTL_MINUTES} นาที`,
    ignore: "ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร",
  },
  en: {
    subject: "Your Fat Cat Fit sign-in code",
    intro: "Your sign-in code is",
    expiry: `This code is valid for ${OTP_TTL_MINUTES} minutes.`,
    ignore: "If you did not request this, you can ignore this email.",
  },
} as const;

export function renderOtpEmail(locale: OtpLocale, otp: string): RenderedEmail {
  const c = COPY[locale] ?? COPY.th;
  const lang = locale in COPY ? locale : "th";
  const text = `${c.intro}\n\n${otp}\n\n${c.expiry}\n${c.ignore}\n`;
  const html =
    `<!doctype html><html lang="${lang}"><body style="font-family:sans-serif;color:#222">` +
    `<p>${c.intro}</p>` +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0">${otp}</p>` +
    `<p>${c.expiry}</p><p style="color:#666">${c.ignore}</p></body></html>`;
  return { subject: c.subject, text, html };
}
