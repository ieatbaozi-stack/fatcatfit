import { defineConfig } from "@playwright/test";

// E2E ของ qa-test (PROCESS.md เกต "E2E มือถือ")
// - เครื่องนักพัฒนา (Windows) ไม่มี Chromium ของ Playwright → ใช้ Chrome ที่ติดตั้งในเครื่อง (channel "chrome")
// - CI (Linux) ติดตั้ง Chromium ด้วย `npx playwright install --with-deps chromium` → ไม่ระบุ channel
// - เปลี่ยนได้ด้วย E2E_CHANNEL (เช่น msedge) · ตั้งเป็นค่าว่างเพื่อใช้ Chromium ของ Playwright
// เซิร์ฟเวอร์: build แล้ว next start (service worker ลงทะเบียนเฉพาะ production) ที่พอร์ต E2E_PORT (ค่าเริ่ม 3110)
// E2E_SKIP_BUILD=1 ข้ามการ build เมื่อเพิ่ง build ไปแล้ว

const PORT = Number(process.env.E2E_PORT ?? 3110);
const BASE_URL = `http://localhost:${PORT}`;
const channel = process.env.E2E_CHANNEL !== undefined ? process.env.E2E_CHANNEL || undefined : process.env.CI ? undefined : "chrome";
const startCmd = `npx next start -p ${PORT}`;

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
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? startCmd : `npm run build && ${startCmd}`,
    url: `${BASE_URL}/manifest.webmanifest`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
