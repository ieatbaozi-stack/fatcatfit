import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// เจ้าของ: ops-release · บทบาทอื่นที่ต้องแก้ไฟล์นี้ (next-intl, service worker) ให้เพิ่มนอกบล็อก "security headers" ด้านล่าง
// เพื่อให้ Lead รวมได้ง่าย: ครอบ export ด้วย plugin ท้ายไฟล์ หรือเพิ่ม key ใน nextConfig

// next-intl (frontend, S4): request config แบบไม่มี locale ใน URL
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

// ---- security headers (เริ่ม) ---------------------------------------------
// CSP แบบไม่ใช้ nonce: ใช้ 'unsafe-inline' กับ script/style เพื่อให้หน้ายังเป็น static render ได้
// (nonce ต้อง render ทุก request แบบ dynamic — เอกสาร Next: https://nextjs.org/docs/app/guides/content-security-policy)
// ส่วนที่ยังเปิดอยู่และเหตุผล: docs/OPERATIONS.md หัวข้อ "Security headers และ CSP"
export function buildCsp(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // upgrade-insecure-requests ทำให้ http://localhost ตอน dev พัง จึงใช้เฉพาะ production
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function buildSecurityHeaders(isDev: boolean): Array<{ key: string; value: string }> {
  const headers = [
    { key: "Content-Security-Policy", value: buildCsp(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=()" },
    // popup ของ OAuth ต้องส่งข้อมูลกลับได้ จึงใช้ allow-popups แทน same-origin
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
  // HSTS ใส่เฉพาะ production (เบราว์เซอร์เมินบน http อยู่แล้ว) · ไม่ใส่ preload โดยตั้งใจ (ถอนออกจากรายการ preload ยาก)
  if (!isDev) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return headers;
}
// ---- security headers (จบ) -------------------------------------------------

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders(process.env.NODE_ENV === "development") }];
  },
};

export default withNextIntl(nextConfig);
