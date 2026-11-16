import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// ไฟล์ชั่วคราวจาก platform (R0 ขั้น 1) — ops-release เป็นเจ้าของ (security headers ฯลฯ)
// frontend แก้เฉพาะส่วนที่ next-intl ต้องใช้ (S4): ปลั๊กอินชี้ไปที่ request config แบบไม่มี locale ใน URL
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
