// pwa-offline — สร้าง /serwist/sw.js จาก src/pwa/sw.ts ด้วย @serwist/turbopack (S5 ทางเลือก A)
// route นี้ถูก prerender ตอน build (force-static) จึงไม่รัน esbuild ตอนผู้ใช้เรียก
import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/pwa/sw.ts",
  // Windows ใช้ esbuild แบบ native เป็นค่าเริ่มต้นอยู่แล้ว ตั้งให้ตรงกันทุกเครื่อง (CI/Vercel เป็น Linux)
  useNativeEsbuild: true,
  // classic script (ไม่ใช่ module worker) เพื่อให้ register แบบปกติได้บนทุกเบราว์เซอร์ที่รองรับ
  esbuildOptions: { format: "iife" },
});
