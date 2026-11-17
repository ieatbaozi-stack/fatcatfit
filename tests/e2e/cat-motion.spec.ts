// CR1 smoke test (qa-test): แมวขยับจริงบนจอมือถือ และหยุดนิ่งเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว
// เกณฑ์ใน CR1_CAT_MOTION_CONTRACT.md: ข้อ 5 (reduced motion นิ่ง) · ข้อ 6/7 (ไม่ซ้อนเฟรม · โหมดมืดเส้นล้วน) · ภาพเปลี่ยนตามเวลา
//
// ยังไม่มี playwright.config.ts (ไม่มี webServer) — ไฟล์นี้จึงเปิดเซิร์ฟเวอร์เอง:
//   E2E_BASE_URL=http://127.0.0.1:3000  ใช้เซิร์ฟเวอร์ที่เปิดไว้แล้ว (เช่น next start หลัง build)
//   ไม่ตั้ง                              เปิด `next dev` ชั่วคราวที่พอร์ต E2E_PORT (ค่าเริ่มต้น 3123) แล้วปิดเมื่อจบ
//   E2E_CHANNEL=chrome|msedge           ใช้เบราว์เซอร์ที่ติดตั้งในเครื่องแทน Chromium ของ Playwright
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3123);
const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
let server: ChildProcess | undefined;

test.describe.configure({ mode: "serial" });
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  channel: process.env.E2E_CHANNEL || undefined,
});

test.beforeAll(async () => {
  test.setTimeout(180_000);
  if (!process.env.E2E_BASE_URL) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
      stdio: "ignore",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
  }
  // รอจนหน้าแรกตอบ (next dev คอมไพล์ครั้งแรกช้า)
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(`${BASE}/me`)).ok) return;
    } catch {
      // ยังไม่พร้อม
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server at ${BASE} did not start`);
});

test.afterAll(() => {
  if (!server?.pid) return;
  // next dev มี process ลูก — ปิดทั้งต้นไม้
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill("SIGTERM");
});

type Locale = "th" | "en";
type Scheme = "light" | "dark";

async function open(page: Page, path: string, opts: { locale?: Locale; scheme?: Scheme; reduce?: boolean } = {}) {
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: opts.locale ?? "th", url: BASE }]);
  await page.emulateMedia({ colorScheme: opts.scheme ?? "light", reducedMotion: opts.reduce ? "reduce" : "no-preference" });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  return errors;
}

/** สำหรับแมวขยับทุกตัวในหน้า: ชั้นไหนที่มองเห็นอยู่ (-1 = ภาพนิ่ง, 0..4 = เฟรม) */
function visibleLayers(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("svg[data-pose]")]
      .filter((svg) => svg.querySelector(".fcf-cat-frame"))
      .map((svg) => {
        const layers = [...svg.querySelectorAll(":scope > g")];
        return layers
          .map((g, i) => (getComputedStyle(g).visibility === "visible" ? i - 1 : null))
          .filter((i): i is number => i !== null);
      })
  );
}

async function sampleFrames(page: Page, ms: number, every = 35) {
  const seen: number[][][] = [];
  for (let t = 0; t < ms; t += every) {
    seen.push(await visibleLayers(page));
    await page.waitForTimeout(every);
  }
  return seen;
}

test("cat on /me plays real frames: the picture changes over time, one layer at a time", async ({ page }) => {
  const errors = await open(page, "/me");
  const cat = page.locator('svg[data-pose="standing"]').first();
  await expect(cat).toBeVisible();
  await expect(cat.locator(".fcf-cat-frame")).toHaveCount(5);

  // ภาพเปลี่ยนจริง: จับภาพตัวแมว 8 ครั้งห่างกันไม่ตรงรอบ 0.7 วิ ต้องได้ภาพต่างกันอย่างน้อย 3 แบบ
  const shots = new Set<string>();
  for (let i = 0; i < 8; i++) {
    shots.add((await cat.screenshot({ animations: "allow" })).toString("base64"));
    await page.waitForTimeout(90);
  }
  expect(shots.size).toBeGreaterThanOrEqual(3);

  // ทุกจังหวะเห็นแค่ 1 เฟรม (ไม่ซ้อน) ภาพนิ่งซ่อน และวนครบ 5 เฟรม
  const seen = await sampleFrames(page, 1500);
  const all = new Set<number>();
  for (const sample of seen) {
    for (const layers of sample) {
      expect(layers.length).toBeLessThanOrEqual(1);
      layers.forEach((l) => all.add(l));
    }
  }
  expect([...all].sort()).toEqual([0, 1, 2, 3, 4]);
  expect(errors).toEqual([]);
});

test("prefers-reduced-motion: reduce keeps the cat still on the still layer", async ({ page }) => {
  const errors = await open(page, "/me", { reduce: true });
  const cat = page.locator('svg[data-pose="standing"]').first();
  await expect(cat).toBeVisible();

  const seen = await sampleFrames(page, 1000, 100);
  for (const sample of seen) for (const layers of sample) expect(layers).toEqual([-1]);

  const first = (await cat.screenshot({ animations: "allow" })).toString("base64");
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(160);
    expect((await cat.screenshot({ animations: "allow" })).toString("base64")).toBe(first);
  }
  expect(errors).toEqual([]);
});

for (const path of ["/", "/me", "/styleguide"]) {
  for (const scheme of ["light", "dark"] as const) {
    for (const locale of ["th", "en"] as const) {
      test(`${path} ${scheme} ${locale}: moving cats never stack frames, dark mode is line-only`, async ({ page }) => {
        const errors = await open(page, path, { scheme, locale });
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        const moving = await page.locator("svg[data-pose]:has(.fcf-cat-frame)").count();
        expect(moving).toBeGreaterThanOrEqual(path === "/styleguide" ? 5 : 1);

        for (const sample of await sampleFrames(page, 800, 60)) {
          expect(sample).toHaveLength(moving);
          for (const layers of sample) expect(layers).toHaveLength(1);
        }

        if (scheme === "dark") {
          // โหมดมืด: ทุกสีของแมว (ตัว หู อกขาว) = สีกระดาน ไม่มีส้ม ในทุกชั้น
          const fills = await page.evaluate(() => {
            const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
            const probe = document.createElement("div");
            probe.style.color = paper;
            document.body.append(probe);
            const paperRgb = getComputedStyle(probe).color;
            probe.remove();
            const bad = new Set<string>();
            for (const el of document.querySelectorAll('svg[data-pose] [fill^="var(--cat"]')) {
              const f = getComputedStyle(el).fill;
              if (f !== paperRgb) bad.add(f);
            }
            return [...bad];
          });
          expect(fills).toEqual([]);
        }
        expect(errors).toEqual([]);
      });
    }
  }
}
