// พอร์ตการส่งอีเมล OTP ที่ auth ต้องการ — ตัวส่งจริงอยู่ที่ src/lib/email (ops-release) ต่อสายใน ./mailer.ts
// auth ไม่รู้จัก SMTP/แม่แบบ · เทสต์ส่งตัวปลอมเข้า createAuth

export type OtpLocale = "th" | "en";

export type SendOtpEmail = (args: {
  /** อีเมลผู้รับ (ตัวพิมพ์เล็กแล้ว) */
  to: string;
  /** รหัส 6 หลัก — ห้าม log */
  otp: string;
  locale: OtpLocale;
}) => Promise<void>;
