// qa-test: ตรวจ "รุ่นใหม่ถึงผู้ใช้ภายในการเปิดครั้งที่สอง" + "ออฟไลน์หลังอัปเดต" กับแอปจริงที่รวมแล้ว
// (เทียบเท่า src/pwa/e2e/s5-offline-check.ts เฟส update แต่ไม่มี proxy: หน้าจริง next-intl จริง CSP จริง)
// ต้อง build สองครั้ง จึงไม่อยู่ใน `npm run test:e2e` — รันเองตามลำดับ:
//
//   npm run build
//   npx tsx tests/e2e/update-check.ts before     # เปิดออนไลน์: /, /history, /me ถูก cache เป็นรุ่น A
//   npm run build                                 # จำลอง deploy รุ่น B
//   npx tsx tests/e2e/update-check.ts after      # เปิดครั้งที่ 1 และ 2 หลัง deploy → ออฟไลน์ → เปิดหน้าที่ cache ไว้ตั้งแต่รุ่น A
//
// พอร์ต 3112 · โปรไฟล์เบราว์เซอร์ใน os.tmpdir() · E2E_CHANNEL เหมือน playwright.config.ts (ค่าเริ่ม chrome)
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// พอร์ตเปลี่ยนได้ด้วย E2E_PORT (ตัวแปรเดียวกับ playwright.config.ts · ค่าเริ่มของสคริปต์นี้ 3112)
const PORT = Number(process.env.E2E_PORT ?? 3112);
const ORIGIN = `http://localhost:${PORT}`;
const PROFILE = path.join(os.tmpdir(), "fcf-qa-update-profile");
const STATE = path.join(os.tmpdir(), "fcf-qa-update-state.json");
const channel = process.env.E2E_CHANNEL !== undefined ? process.env.E2E_CHANNEL || undefined : "chrome";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const buildId = () => fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();

async function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    stdio: "ignore",
    env: { ...process.env, NODE_ENV: "production" },
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${ORIGIN}/manifest.webmanifest`)).ok) return child;
    } catch {
      // ยังไม่ขึ้น
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error("server did not start");
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const done = new Promise((r) => child.once("exit", r));
  child.kill();
  await done;
}

const open = () => chromium.launchPersistentContext(PROFILE, { headless: true, channel, viewport: { width: 390, height: 844 } });
const firstPage = async (ctx: BrowserContext) => ctx.pages()[0] ?? (await ctx.newPage());

/** buildId ที่ Next ฝังใน HTML ของหน้า */
async function pageBuildId(page: Page) {
  return (await page.content()).match(/\\?"b\\?":\\?"([A-Za-z0-9_-]{10,})\\?"/)?.[1] ?? null;
}

async function waitFor(page: Page, want: "controller" | "waiting" | "settled") {
  return page.evaluate(async (w) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (w === "controller" && navigator.serviceWorker.controller) return true;
      if (w === "waiting" && reg?.waiting) return true;
      if (w === "settled" && reg?.active && !reg.waiting && !reg.installing) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }, want);
}

async function cachedPages(page: Page) {
  return page.evaluate(async () => {
    const c = await caches.open("fcf-pages-v1");
    return (await c.keys()).map((r) => new URL(r.url).pathname).sort();
  });
}

async function before() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = await startServer();
  const ctx = await open();
  try {
    const page = await firstPage(ctx);
    await page.goto(ORIGIN + "/");
    check("before: SW controls the page", await waitFor(page, "controller"));
    for (const p of ["/history", "/me"]) await page.goto(ORIGIN + p);
    await page.waitForTimeout(1500);
    const pages = await cachedPages(page);
    check("before: /, /history, /me cached", ["/", "/history", "/me"].every((p) => pages.includes(p)), pages.join(","));
    // /progress ไม่เคยเปิด — ต้องถูกเก็บตั้งแต่ติดตั้ง (QA M1)
    check("before: /progress cached without visiting", pages.includes("/progress"), pages.join(","));
  } finally {
    await ctx.close();
    await stopServer(server);
  }
  fs.writeFileSync(STATE, JSON.stringify({ buildId: buildId() }));
}

async function after() {
  const prev = (JSON.parse(fs.readFileSync(STATE, "utf8")) as { buildId: string }).buildId;
  const next = buildId();
  check("new build has a new BUILD_ID", prev !== next, `${prev} → ${next}`);
  const server = await startServer();
  let ctx = await open();
  try {
    // เปิดครั้งที่ 1 หลัง deploy: HTML ใหม่ (network-first) · SW ใหม่รอ ไม่สลับกลางคัน
    let page = await firstPage(ctx);
    await page.goto(ORIGIN + "/");
    await page.evaluate(() => {
      (window as unknown as { swaps: number }).swaps = 0;
      navigator.serviceWorker.addEventListener("controllerchange", () => (window as unknown as { swaps: number }).swaps++);
    });
    check("open #1: page HTML is the new build", (await pageBuildId(page)) === next);
    check("open #1: new SW waiting", await waitFor(page, "waiting"));
    await page.waitForTimeout(1000);
    check("open #1: no controller swap mid-session", (await page.evaluate(() => (window as unknown as { swaps: number }).swaps)) === 0);
    await ctx.close();

    // เปิดครั้งที่ 2: SW ใหม่ active
    ctx = await open();
    page = await firstPage(ctx);
    await page.goto(ORIGIN + "/");
    check("open #2: new SW active", await waitFor(page, "settled"));
    const precache = await page.evaluate(async () => {
      const out: string[] = [];
      for (const n of await caches.keys()) if (n.includes("precache")) for (const r of await (await caches.open(n)).keys()) out.push(r.url);
      return out;
    });
    check("open #2: precache has new build only", precache.some((u) => u.includes(next)) && !precache.some((u) => u.includes(prev)), `${precache.length} entries`);
    await ctx.close();
  } finally {
    await stopServer(server);
  }

  // ออฟไลน์ (เซิร์ฟเวอร์ปิดด้วย): หน้าที่ cache ไว้ตั้งแต่รุ่นเก่าและไม่ได้เปิดอีกเลยหลังอัปเดต
  ctx = await open();
  try {
    await ctx.setOffline(true);
    const page = await firstPage(ctx);
    for (const p of ["/", "/history", "/progress", "/me"]) {
      const errors: string[] = [];
      const failedReq: string[] = [];
      page.removeAllListeners("pageerror");
      page.removeAllListeners("requestfailed");
      page.on("pageerror", (e) => errors.push(e.message));
      // prefetch ของแท็บอื่น (RSC) ล้มตอนออฟไลน์ได้ตามปกติ — นับเฉพาะไฟล์ JS/CSS/ฟอนต์ของหน้า
      page.on("requestfailed", (r) => {
        const u = new URL(r.url());
        if (u.pathname.startsWith("/_next/static/")) failedReq.push(u.pathname);
      });
      const res = await page.goto(ORIGIN + p).catch((e: Error) => e);
      const ok = !(res instanceof Error) && res?.status() === 200;
      await page.waitForTimeout(1200);
      const bid = ok ? await pageBuildId(page) : null;
      const font = ok ? await page.evaluate(() => getComputedStyle(document.body).fontFamily) : "";
      const h1 = ok ? await page.locator("h1").first().textContent() : "";
      // ลองแตะแท็บอื่น (ต้องไม่ค้าง)
      check(
        `offline after update ${p}: loads, styled, no failed chunks, no JS errors`,
        ok && /Noto Sans Thai/.test(font) && failedReq.length === 0 && errors.length === 0,
        `build ${bid === next ? "new" : bid === prev ? "OLD" : bid} · h1 ${h1} · failed ${JSON.stringify(failedReq)} · errors ${JSON.stringify(errors)}`,
      );
    }
  } finally {
    await ctx.close();
  }
}

async function main() {
  const phase = process.argv[2];
  if (phase === "before") await before();
  else if (phase === "after") await after();
  else {
    console.error("usage: tsx tests/e2e/update-check.ts before|after");
    process.exit(2);
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

void main();
