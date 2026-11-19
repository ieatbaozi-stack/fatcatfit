import type { OtpLocale } from "@/lib/auth/email-port";

// แม่แบบอีเมล OTP — สองภาษา (ไทย + อังกฤษ) ในฉบับเดียว เผื่อผู้ใช้อ่านได้แค่อังกฤษ
// ลำดับ: ภาษาตาม locale ของผู้ใช้ (intro → รหัสตัวใหญ่ แสดงครั้งเดียว → อายุ → ไม่ได้ขอ) → เส้นคั่น → อีกภาษา (อ้างถึงรหัสด้านบน)
// subject สองภาษาในบรรทัดเดียว ไม่มีรหัส · ไม่มีลิงก์ (กันฟิชชิ่ง) · locale ที่ไม่รู้จักถอยไป th
// ข้อความอยู่ที่นี่ ไม่ใช่ messages/** เพราะอีเมลไม่ได้ผ่าน next-intl ของ request

export const OTP_TTL_MINUTES = 10;

export type RenderedEmail = { subject: string; text: string; html: string };

const SUBJECT = "รหัส OTP เข้าสู่ระบบ Fat Cat Fit / Your Fat Cat Fit sign-in code (OTP)";

const COPY = {
  th: {
    intro: "รหัส OTP 6 หลักสำหรับเข้าสู่ระบบของคุณคือ",
    introAbove: "รหัส OTP ของคุณอยู่ด้านบน",
    expiry: `รหัสนี้ใช้ได้ ${OTP_TTL_MINUTES} นาที`,
    ignore: "ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร",
  },
  en: {
    intro: "Your one-time sign-in code (OTP) is",
    introAbove: "Your one-time sign-in code (OTP) is shown above.",
    expiry: `This code is valid for ${OTP_TTL_MINUTES} minutes.`,
    ignore: "If you did not request this, you can ignore this email.",
  },
} as const;

type Lang = keyof typeof COPY;

export function renderOtpEmail(locale: OtpLocale, otp: string): RenderedEmail {
  const first: Lang = locale in COPY ? (locale as Lang) : "th";
  const second: Lang = first === "th" ? "en" : "th";
  const a = COPY[first];
  const b = COPY[second];
  const text =
    `${a.intro}\n\n${otp}\n\n${a.expiry}\n${a.ignore}\n\n` +
    `----------\n\n` +
    `${b.introAbove}\n${b.expiry}\n${b.ignore}\n`;
  const html =
    `<!doctype html><html lang="${first}"><body style="font-family:sans-serif;color:#222">` +
    `<div lang="${first}">` +
    `<p>${a.intro}</p>` +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0">${otp}</p>` +
    `<p>${a.expiry}</p><p style="color:#666">${a.ignore}</p></div>` +
    `<hr style="border:0;border-top:1px solid #ccc;margin:24px 0">` +
    `<div lang="${second}" style="color:#444">` +
    `<p>${b.introAbove}</p><p>${b.expiry}</p><p style="color:#666">${b.ignore}</p></div>` +
    `</body></html>`;
  return { subject: SUBJECT, text, html };
}
