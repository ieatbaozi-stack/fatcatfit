import "server-only";
import nodemailer from "nodemailer";
import type { SendOtpEmail } from "@/lib/auth/email-port";
import { renderOtpEmail } from "./templates";

// ชั้นส่งอีเมล (ADR 0002 ข้อ 4) · เลือกด้วย EMAIL_TRANSPORT: smtp | log
// สลับผู้ส่งเป็นโดเมนของเรา = แก้ env (EMAIL_FROM + SMTP_*) อย่างเดียว
// ค่าไม่ครบ → ผิดพลาดตอน "ส่ง" ไม่ใช่ตอน import/build

export type EmailMessage = { to: string; subject: string; text: string; html: string };
type Env = Record<string, string | undefined>;

export class EmailConfigError extends Error {}

function transportName(env: Env): "smtp" | "log" {
  const v = env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (v === "smtp" || v === "log") return v;
  if (v) throw new EmailConfigError(`EMAIL_TRANSPORT must be "smtp" or "log"`);
  // ไม่ตั้ง: dev/test ใช้ log · production ต้องตั้งเอง (กันลืมตั้งแล้วเงียบ)
  if (env.NODE_ENV === "production") throw new EmailConfigError("EMAIL_TRANSPORT is not set");
  return "log";
}

function need(env: Env, names: string[]): Record<string, string> {
  const missing = names.filter((n) => !env[n]?.trim());
  if (missing.length) throw new EmailConfigError(`missing env: ${missing.join(", ")}`);
  return Object.fromEntries(names.map((n) => [n, env[n]!.trim()]));
}

async function sendSmtp(msg: EmailMessage, env: Env): Promise<void> {
  const v = need(env, ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]);
  const port = Number(v.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) throw new EmailConfigError("SMTP_PORT must be a number");
  const transporter = nodemailer.createTransport({
    host: v.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL · 587 = STARTTLS
    auth: { user: v.SMTP_USER, pass: v.SMTP_PASS },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transporter.sendMail({ from: v.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  } finally {
    transporter.close();
  }
}

function sendLog(msg: EmailMessage, env: Env, otp?: string): void {
  // production: ไม่ log รหัสและไม่ log อีเมล · เฉพาะนอก production (dev/test) ที่แสดงรหัสเพื่อทดสอบ
  if (env.NODE_ENV === "production") {
    console.info("[email:log] message not sent (EMAIL_TRANSPORT=log)");
    return;
  }
  console.info(`[email:log] to=${msg.to} subject=${msg.subject}${otp ? ` otp=${otp}` : ""}`);
}

/** ส่งอีเมลตาม EMAIL_TRANSPORT (ส่ง env เข้ามาได้เพื่อเทสต์) · otp ใช้แสดงใน log นอก production เท่านั้น */
export async function sendEmail(msg: EmailMessage, env: Env = process.env, otp?: string): Promise<void> {
  const t = transportName(env);
  if (t === "smtp") await sendSmtp(msg, env);
  else sendLog(msg, env, otp);
}

export const sendOtpEmail: SendOtpEmail = async ({ to, otp, locale }) => {
  const rendered = renderOtpEmail(locale, otp);
  try {
    await sendEmail({ to, ...rendered }, process.env, otp);
  } catch (err) {
    // log เฉพาะชนิดความผิดพลาด ไม่ log อีเมล/รหัส/ข้อความจากเซิร์ฟเวอร์ SMTP (อาจมีที่อยู่ผู้รับ)
    const why = err instanceof EmailConfigError ? err.message : ((err as { code?: string })?.code ?? "unknown");
    console.error(`[email] send failed: ${why}`);
    throw err;
  }
};
