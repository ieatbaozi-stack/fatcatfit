import { defineConfig } from "@playwright/test";
import { E2E_CTRL_PORT, E2E_PG_PORT, E2E_SMTP_PORT } from "./tests/e2e/support/ports";

// E2E ของ qa-test (PROCESS.md เกต "E2E มือถือ")
// - เครื่องนักพัฒนา (Windows) ไม่มี Chromium ของ Playwright → ใช้ Chrome ที่ติดตั้งในเครื่อง (channel "chrome")
// - CI (Linux) ติดตั้ง Chromium ด้วย `npx playwright install --with-deps chromium` → ไม่ระบุ channel
// - เปลี่ยนได้ด้วย E2E_CHANNEL (เช่น msedge) · ตั้งเป็นค่าว่างเพื่อใช้ Chromium ของ Playwright
// เซิร์ฟเวอร์ (R1): 2 ตัว เริ่มตามลำดับ
//   1. tests/e2e/support/backend.ts — Postgres ในหน่วยความจำ (PGlite + migration จริง) · SMTP ปลอมที่เก็บเมล OTP · HTTP ควบคุม
//      ไม่ต่อ Neon ไม่ส่งเมลจริง ไม่มีความลับ (CI ไม่ต้องมี secret) · ฟังเฉพาะ 127.0.0.1
//   2. build แล้ว next start (service worker ลงทะเบียนเฉพาะ production) ที่พอร์ต E2E_PORT (ค่าเริ่ม 3110)
//      แอปส่งเมลด้วย EMAIL_TRANSPORT=smtp ไปที่ SMTP ปลอม → เทสต์อ่านรหัสจากเมลเหมือนผู้ใช้ (ไม่ข้ามด่าน OTP)
// E2E_SKIP_BUILD=1 ข้ามการ build เมื่อเพิ่ง build ไปแล้ว

const PORT = Number(process.env.E2E_PORT ?? 3110);
const BASE_URL = `http://localhost:${PORT}`;
const PG_PORT = E2E_PG_PORT;
const SMTP_PORT = E2E_SMTP_PORT;
const CTRL_PORT = E2E_CTRL_PORT;
const channel = process.env.E2E_CHANNEL !== undefined ? process.env.E2E_CHANNEL || undefined : process.env.CI ? undefined : "chrome";
const startCmd = `npx next start -p ${PORT}`;
const baseEnv = process.env as Record<string, string>;

// ค่าทดสอบล้วน (ไม่ใช่ความลับ) — ฐานข้อมูลและ SMTP อยู่ในโปรเซสของเทสต์เท่านั้น
const APP_ENV: Record<string, string> = {
  DATABASE_URL: `postgresql://e2e:e2e@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`,
  BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-000",
  BETTER_AUTH_URL: BASE_URL,
  EMAIL_TRANSPORT: "smtp",
  EMAIL_FROM: "Fat Cat Fit <noreply@example.com>",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(SMTP_PORT),
  SMTP_USER: "e2e",
  SMTP_PASS: "e2e",
  PRIVACY_CONTROLLER_NAME: "Example Controller",
  PRIVACY_CONTACT_EMAIL: "privacy@example.com",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    channel,
    locale: "th-TH",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: [
    {
      command: "npx tsx tests/e2e/support/backend.ts",
      url: `http://127.0.0.1:${CTRL_PORT}/ready`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: baseEnv,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: process.env.E2E_SKIP_BUILD ? startCmd : `npm run build && ${startCmd}`,
      url: `${BASE_URL}/manifest.webmanifest`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: { ...baseEnv, ...APP_ENV },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
