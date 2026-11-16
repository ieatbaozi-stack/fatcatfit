import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// ไฟล์ชั่วคราวจาก platform (R0 ขั้น 1) — ops-release เป็นเจ้าของ (security headers ฯลฯ)
const nextConfig: NextConfig = {};

// pwa-offline (S5 ทางเลือก A): withSerwist เพิ่ม esbuild/esbuild-wasm ใน serverExternalPackages
// ให้ route src/app/serwist/[path] ใช้ esbuild สร้าง service worker ตอน build ได้
export default withSerwist(nextConfig);
