// ไฟล์ชั่วคราวจาก platform (R0 ขั้น 1) — ops-release เป็นเจ้าของ จะเพิ่มกฎขอบเขตโมดูลตาม ARCHITECTURE ข้อ 3
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**", ".claude/**", "docs/**", "assets/**", "playwright-report/**", "test-results/**"]),
]);
