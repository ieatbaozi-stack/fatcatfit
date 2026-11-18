// สคริปต์ตรวจ S5 ใน Chromium (Playwright) — ไม่ใช่ส่วนของ CI, รันเองตามขั้นตอนนี้:
//
//   npm run build
//   npx tsx src/pwa/e2e/s5-offline-check.ts first     # เปิดครั้งแรก → ออฟไลน์ → ปิด/เปิด
//   npm run build                                     # จำลอง deploy รุ่นใหม่ (BUILD_ID ใหม่ → sw.js ใหม่)
//   npx tsx src/pwa/e2e/s5-offline-check.ts update    # เปิดครั้งที่ 1 และ 2 หลัง deploy
//   npx tsx src/pwa/e2e/s5-offline-check.ts locale    # เปลี่ยนภาษาแล้วออฟไลน์ ต้องได้ภาษาที่เลือกล่าสุด
//   npx tsx src/pwa/e2e/s5-offline-check.ts auth      # ADR 0006: /welcome ออฟไลน์ · ไม่เก็บ query/redirect · ออกจากระบบ
//
// เซิร์ฟเวอร์: proxy ที่พอร์ต 3102 (ใส่ CSP ของ ops + เปลี่ยน <html lang> ตาม cookie NEXT_LOCALE)
//            หน้า next start ที่พอร์ต 31021
// ตัวเลือก: --inject  ใส่ <link rel=manifest> และเรียก register แบบเดียวกับ <ServiceWorkerRegister />
//                    (ใช้เมื่อ layout ยังไม่ได้ใส่ component — R0 ระหว่างทำขนาน)
// ใช้พอร์ต 3102 และโปรไฟล์เบราว์เซอร์ใน os.tmpdir()/fcf-s5-profile (เก็บ SW/cache ข้ามการเปิด)
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const PORT = 3102;
const INTERNAL_PORT = 31021;
const APP_ROUTES = ["/history", "/progress", "/me", "/styleguide"];
const ORIGIN = `http://localhost:${PORT}`;
const PROFILE = path.join(os.tmpdir(), "fcf-s5-profile");
const STATE = path.join(os.tmpdir(), "fcf-s5-state.json");
const phase = process.argv[2];
/** เฟส auth: proxy จำลองเซิร์ฟเวอร์ของ ADR 0006 ข้อ 2 (หน้าของ frontend ยังไม่อยู่ใน branch นี้) */
const AUTH_MODE = phase === "auth";
const S5_SESSION_COOKIE = "fcf_s5_session";
const AUTH_APP_ROUTES = ["/", "/history", "/progress", "/me"];
const hasS5Session = (cookie: string | undefined) => (cookie ?? "").split(/;\s*/).includes(`${S5_SESSION_COOKIE}=1`);
const inject = process.argv.includes("--inject");

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

function buildId(): string {
  return fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
}

// CSP ที่ ops-release ตั้ง (ส่วนที่เกี่ยวกับ SW/manifest) — proxy ใส่ให้ทุกคำตอบ เพื่อทดสอบภายใต้ CSP จริง
const OPS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'";

type Server = { next: ChildProcess; proxy: http.Server };

/**
 * next start อยู่ที่ INTERNAL_PORT และ proxy ที่ PORT ซึ่ง:
 * - ใส่ CSP ของ ops ให้ทุกคำตอบ
 * - จำลอง next-intl ของ frontend (ยังไม่รวมใน branch นี้): เปลี่ยน <html lang> ของ HTML ตาม cookie NEXT_LOCALE
 *   → HTML ของ URL เดียวกันต่างกันตามภาษา เหมือนหน้า dynamic จริง
 */
async function startServer(): Promise<Server> {
  const next = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(INTERNAL_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });
  const proxy = http.createServer((req, res) => {
    const headers = { ...req.headers, host: `localhost:${INTERNAL_PORT}`, "accept-encoding": "identity" };
    const reqPath = (req.url ?? "/").split("?")[0];
    // เฟส auth: ไม่มี cookie session → แท็บของแอป 307 ไป /welcome (layout ของ (app)) · /welcome ไม่ redirect
    if (AUTH_MODE && AUTH_APP_ROUTES.includes(reqPath) && !hasS5Session(req.headers.cookie)) {
      res.writeHead(307, { Location: "/welcome", "Cache-Control": "no-store", "content-security-policy": OPS_CSP });
      res.end();
      return;
    }
    // หน้าของ frontend ยังไม่อยู่ใน branch นี้ → ให้ /history /progress /me /styleguide (/welcome) ตอบด้วยหน้า "/" (200)
    const stubbed = APP_ROUTES.includes(reqPath) || (AUTH_MODE && reqPath === "/welcome");
    const upstreamPath = stubbed ? "/" : req.url;
    const upstream = http.request({ host: "127.0.0.1", port: INTERNAL_PORT, path: upstreamPath, method: req.method, headers }, (up) => {
      const outHeaders = { ...up.headers, "content-security-policy": OPS_CSP };
      const isHtml = String(up.headers["content-type"] ?? "").includes("text/html");
      if (!isHtml) {
        res.writeHead(up.statusCode ?? 502, outHeaders);
        up.pipe(res);
        return;
      }
      const chunks: Buffer[] = [];
      up.on("data", (c: Buffer) => chunks.push(c));
      up.on("end", () => {
        const locale = /(?:^|;\s*)NEXT_LOCALE=([a-z]{2})/.exec(req.headers.cookie ?? "")?.[1] ?? "th";
        let body = Buffer.concat(chunks).toString("utf8").replace(/<html([^>]*)\slang="[^"]*"/, `<html$1 lang="${locale}"`);
        // เฟส auth: ติดป้ายว่า HTML นี้เป็นของ path ไหน (ใช้ตรวจว่าตอนออฟไลน์ได้หน้าอะไร)
        if (AUTH_MODE) body = body.replace("<head>", `<head><meta name="fcf-s5-page" content="${reqPath}">`);
        delete outHeaders["content-length"];
        res.writeHead(up.statusCode ?? 502, outHeaders);
        res.end(body);
      });
    });
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  await new Promise<void>((r) => proxy.listen(PORT, r));
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${ORIGIN}/manifest.webmanifest`);
      if (res.ok) return { next, proxy };
    } catch {
      // ยังไม่ขึ้น
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await stopServer({ next, proxy });
  throw new Error("server did not come up on port " + PORT);
}

async function stopServer(server: Server) {
  await new Promise((r) => {
    server.proxy.close(r);
    server.proxy.closeAllConnections();
  });
  const child = server.next;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((r) => child.once("exit", r));
  child.kill();
  await done;
}

async function openApp(): Promise<BrowserContext> {
  // S5_CHANNEL=chrome|msedge ใช้เบราว์เซอร์ที่ติดตั้งในเครื่องแทน Chromium ของ Playwright
  return chromium.launchPersistentContext(PROFILE, {
    headless: true,
    serviceWorkers: "allow",
    channel: process.env.S5_CHANNEL || undefined,
  });
}

/** ทำแบบเดียวกับ src/pwa/register.tsx */
async function injectRegistration(page: Page) {
  await page.evaluate(async () => {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.webmanifest";
      document.head.appendChild(link);
    }
    const reg = await navigator.serviceWorker.register("/serwist/sw.js", { scope: "/", updateViaCache: "none" });
    reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    reg.update().catch(() => {});
    // reportPageLang + MutationObserver
    // (ไม่ตั้งชื่อฟังก์ชันในนี้: tsx ใส่ __name ซึ่งไม่มีในหน้าเว็บ)
    const html = document.documentElement;
    reg.active?.postMessage({ type: "FCF_PAGE_LANG", lang: html.lang });
    new MutationObserver(() => reg.active?.postMessage({ type: "FCF_PAGE_LANG", lang: html.lang })).observe(html, {
      attributes: true,
      attributeFilter: ["lang"],
    });
  });
}

/** ภาษาของทุกหน้าใน cache หน้า (อ่าน header ที่ SW ติดไว้) */
async function cachedPageLangs(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const out: Record<string, string> = {};
    const c = await caches.open("fcf-pages-v1");
    for (const req of await c.keys()) {
      const res = await c.match(req);
      out[new URL(req.url).pathname] = res?.headers.get("X-FCF-Cached-Lang") ?? "?";
    }
    return out;
  });
}

async function setLocaleCookie(ctx: BrowserContext, locale: "th" | "en") {
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: ORIGIN }]);
}

/** รอจนทุกหน้าใน cache เป็นภาษาที่ต้องการ (SW ทำในพื้นหลัง) */
async function waitCachedLangs(page: Page, lang: string, mustHave: string[], timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  let langs: Record<string, string> = {};
  while (Date.now() < end) {
    langs = await cachedPageLangs(page);
    const vals = Object.values(langs);
    if (vals.length > 0 && vals.every((v) => v === lang) && mustHave.every((p) => langs[p] === lang)) return { ok: true, langs };
    await page.waitForTimeout(250);
  }
  return { ok: false, langs };
}

async function htmlLang(page: Page) {
  return page.evaluate(() => document.documentElement.lang);
}

async function phaseLocale() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = await startServer();
  let ctx = await openApp();
  try {
    await setLocaleCookie(ctx, "en");
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(ORIGIN + "/");
    if (inject) await injectRegistration(page);
    await waitForController(page);
    await page.goto(ORIGIN + "/history");
    if (inject) await injectRegistration(page);
    let r = await waitCachedLangs(page, "en", ["/", "/history"]);
    check("English: / and /history cached as en", r.ok, JSON.stringify(r.langs));

    // ก. เปลี่ยนเป็น Thai แล้วเปิดหน้าใหม่แบบ navigation (เช่นเปิดแอปใหม่) → หน้าอังกฤษเดิมต้องถูกแทน
    await setLocaleCookie(ctx, "th");
    await page.goto(ORIGIN + "/me");
    if (inject) await injectRegistration(page);
    check("Thai via navigation: page renders th", (await htmlLang(page)) === "th", await htmlLang(page));
    r = await waitCachedLangs(page, "th", ["/", "/history", "/me"]);
    check("Thai via navigation: every cached page is th (en pages refetched)", r.ok, JSON.stringify(r.langs));

    // ข. เปลี่ยนกลับเป็น English แบบไม่ navigate (frontend ตั้ง cookie แล้ว router.refresh → <html lang> เปลี่ยน)
    await setLocaleCookie(ctx, "en");
    await page.evaluate(() => {
      document.documentElement.lang = "en";
    });
    r = await waitCachedLangs(page, "en", ["/", "/history", "/me"]);
    check("English via in-app switch (no navigation): every cached page is en", r.ok, JSON.stringify(r.langs));
    await ctx.close();

    // ค. ออฟไลน์ → ปิด/เปิด → ทุกหน้าเป็นภาษาที่เลือกล่าสุด (en)
    await stopServer(server);
    ctx = await openApp();
    await ctx.setOffline(true);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    for (const p of ["/", "/history", "/me", "/progress"]) {
      const res = await page.goto(ORIGIN + p).catch((e: Error) => e);
      const ok = !(res instanceof Error) && res?.status() === 200;
      const lang = ok ? await htmlLang(page) : "";
      check(`offline ${p}: loads in last chosen language (en)`, ok && lang === "en", res instanceof Error ? res.message : `status ${res?.status()} lang ${lang}`);
    }
  } finally {
    await ctx.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

async function swState(page: Page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const cacheNames = await caches.keys();
    const cached: Record<string, string[]> = {};
    for (const name of cacheNames) {
      const c = await caches.open(name);
      cached[name] = (await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
    }
    return {
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      active: reg?.active?.scriptURL ?? null,
      waiting: Boolean(reg?.waiting),
      installing: Boolean(reg?.installing),
      cached,
    };
  });
}

async function waitForController(page: Page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
}

/** รอในหน้าเว็บ (waitForFunction ไม่รอ predicate แบบ async) — "waiting" = มี SW รอ · "settled" = มี active และไม่มีตัวรอ */
async function pollRegistration(page: Page, want: "waiting" | "settled", timeoutMs = 15000) {
  return page.evaluate(
    async ({ want, timeoutMs }) => {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        if (want === "waiting" ? Boolean(reg?.waiting) : Boolean(reg?.active) && !reg?.waiting && !reg?.installing) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    },
    { want, timeoutMs },
  );
}

/** ดึงข้อความ buildId ที่ Next ฝังใน HTML (ใช้บอกว่าหน้าที่เห็นเป็นรุ่นไหน) */
async function pageBuildId(page: Page): Promise<string | null> {
  const html = await page.content();
  // RSC payload ใน HTML มี \"b\":\"<BUILD_ID>\"
  const m = html.match(/\\?"b\\?":\\?"([A-Za-z0-9_-]{10,})\\?"/);
  return m ? m[1] : null;
}

async function installability(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const errors = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
  const manifest = (await cdp.send("Page.getAppManifest")) as { url: string; errors: { message: string }[] };
  return { errors: errors.installabilityErrors.map((e) => e.errorId), manifestUrl: manifest.url, manifestErrors: manifest.errors.map((e) => e.message) };
}

async function phaseFirst() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = await startServer();
  const id1 = buildId();
  let ctx = await openApp();
  try {
    // 1) เปิดออนไลน์ครั้งแรก
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    const cspErrors: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text());
    });
    const res = await page.goto(ORIGIN + "/");
    check("first online open: / returns 200", res?.status() === 200, `status ${res?.status()}`);
    check("ops CSP header present on page", Boolean(res?.headers()["content-security-policy"]?.includes("worker-src 'self'")));
    if (inject) await injectRegistration(page);
    await waitForController(page);
    const s1 = await swState(page);
    check("SW registered and controlling", s1.controller?.endsWith("/serwist/sw.js") ?? false, String(s1.controller));

    // 2) ข้อมูล /api ไม่ถูก cache — เรียกผ่านหน้าที่ SW คุมอยู่
    const apiStatus = await page.evaluate(async () => {
      const a = await fetch("/api/health").then((r) => r.status).catch(() => -1);
      const b = await fetch("/api/sync/push", { method: "POST", body: "{}" }).then((r) => r.status).catch(() => -1);
      return { a, b };
    });
    const s2 = await swState(page);
    const allCached = Object.values(s2.cached).flat();
    check("no /api/** entry in any Cache Storage", !allCached.some((u) => u.startsWith("/api")), `api statuses ${JSON.stringify(apiStatus)}; caches ${Object.keys(s2.cached).join(", ")}`);
    check("app shell / is cached", (s2.cached["fcf-pages-v1"] ?? []).includes("/"), JSON.stringify(s2.cached["fcf-pages-v1"]));
    const precache = Object.entries(s2.cached).find(([n]) => n.includes("precache"));
    check("hashed assets precached", (precache?.[1].filter((u) => u.startsWith("/_next/static/")).length ?? 0) > 0, `${precache?.[0]}: ${precache?.[1].length} entries`);

    // 3) เกณฑ์ติดตั้งได้ของ Chromium (ไอคอนต้องมีอยู่จริงที่ /icons/*)
    const inst = await installability(page);
    check("Chromium installability: no errors", inst.errors.length === 0 && inst.manifestErrors.length === 0, JSON.stringify(inst));
    check("no CSP violations (SW + manifest under ops CSP)", cspErrors.length === 0, cspErrors.join(" | "));
    await ctx.close();

    // 4) ออฟไลน์ → ปิด/เปิดแอป
    await stopServer(server);
    ctx = await openApp();
    await ctx.setOffline(true);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    const off = await page.goto(ORIGIN + "/").catch((e: Error) => e);
    const offOk = !(off instanceof Error) && off?.status() === 200;
    check("offline reopen: / loads from SW", offOk, off instanceof Error ? off.message : `status ${off?.status()} buildId ${await pageBuildId(page)}`);
    const offDeep = await page.goto(ORIGIN + "/never-visited").catch((e: Error) => e);
    check("offline: unvisited URL falls back to app shell", !(offDeep instanceof Error) && offDeep?.status() === 200, offDeep instanceof Error ? offDeep.message : `status ${offDeep?.status()}`);
    const offApi = await page.evaluate(() => fetch("/api/health").then((r) => `status ${r.status}`).catch((e: Error) => `rejected: ${e.message}`));
    check("offline: /api/health is NOT answered from cache", offApi.startsWith("rejected"), offApi);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(ORIGIN + "/");
    await page.waitForTimeout(1000);
    check("offline page hydrates without JS errors", errors.length === 0, errors.join(" | "));
  } finally {
    await ctx.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
  fs.writeFileSync(STATE, JSON.stringify({ buildId: id1 }));
}

async function phaseUpdate() {
  const prev = JSON.parse(fs.readFileSync(STATE, "utf8")) as { buildId: string };
  const id2 = buildId();
  check("new build has a different BUILD_ID", id2 !== prev.buildId, `${prev.buildId} → ${id2}`);
  const server = await startServer();
  let ctx = await openApp();
  try {
    // เปิดครั้งที่ 1 หลัง deploy
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(ORIGIN + "/");
    await page.evaluate(() => {
      const w = window as unknown as { __swaps: number };
      w.__swaps = 0;
      navigator.serviceWorker.addEventListener("controllerchange", () => w.__swaps++);
    });
    if (inject) await injectRegistration(page);
    await waitForController(page);
    const b1 = await pageBuildId(page);
    check("open #1 after deploy: page HTML is new build (network-first)", b1 === id2, `page buildId ${b1}`);
    // รอให้ SW ใหม่ติดตั้งเสร็จ (เข้าสถานะ waiting) — ต้องไม่ activate กลางการใช้งาน
    await pollRegistration(page, "waiting");
    await page.waitForTimeout(1000); // ให้เวลาสลับ ถ้า SW จะ activate เองกลางคัน (ต้องไม่เกิด)
    const s1 = await swState(page);
    const swaps = await page.evaluate(() => (window as unknown as { __swaps: number }).__swaps);
    check("open #1: new SW installed and waiting", s1.waiting, JSON.stringify({ waiting: s1.waiting, installing: s1.installing }));
    check("open #1: no controller swap mid-session", swaps === 0, `controllerchange events: ${swaps}`);
    await ctx.close();

    // เปิดครั้งที่ 2
    ctx = await openApp();
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(ORIGIN + "/");
    if (inject) await injectRegistration(page);
    await pollRegistration(page, "settled");
    await page.reload(); // ให้แน่ใจว่าการ navigate ถัดไปผ่าน SW ตัวที่ active อยู่
    const s2 = await swState(page);
    const precacheUrls = Object.entries(s2.cached).filter(([n]) => n.includes("precache")).flatMap(([, u]) => u);
    const hasNew = precacheUrls.some((u) => u.includes(`/_next/static/${id2}/`));
    const hasOld = precacheUrls.some((u) => u.includes(`/_next/static/${prev.buildId}/`));
    check("open #2: active SW is the new build (precache has new build files)", hasNew, `${precacheUrls.length} precache entries`);
    check("open #2: old build precache cleaned up", !hasOld, hasOld ? "old entries remain" : "");
    check("open #2: page HTML is new build", (await pageBuildId(page)) === id2);

    // ออฟไลน์หลังอัปเดต ยังเปิดได้และเป็นรุ่นใหม่
    await ctx.close();
    await stopServer(server);
    ctx = await openApp();
    await ctx.setOffline(true);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    const off = await page.goto(ORIGIN + "/").catch((e: Error) => e);
    check("offline after update: / loads and is new build", !(off instanceof Error) && off?.status() === 200 && (await pageBuildId(page)) === id2, off instanceof Error ? off.message : `buildId ${await pageBuildId(page)}`);
  } finally {
    await ctx.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

/** key ใน cache หน้า (path + query) */
async function pageKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (!(await caches.has("fcf-pages-v1"))) return [];
    const c = await caches.open("fcf-pages-v1");
    return (await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search + new URL(r.url).hash).sort();
  });
}

/** รอจน key ใน cache หน้าตรงกับที่ต้องการ และคงที่อย่างน้อย 1.5 วิ (SW เติมแท็บในพื้นหลัง) */
async function waitPageKeys(page: Page, want: string[], timeoutMs = 15000) {
  const target = JSON.stringify([...want].sort());
  const end = Date.now() + timeoutMs;
  let keys: string[] = [];
  let since = 0;
  while (Date.now() < end) {
    keys = await pageKeys(page);
    if (JSON.stringify(keys) === target) {
      if (!since) since = Date.now();
      if (Date.now() - since >= 1500) return { ok: true, keys };
    } else since = 0;
    await page.waitForTimeout(250);
  }
  return { ok: false, keys };
}

async function servedPage(page: Page, path: string) {
  const res = await page.goto(ORIGIN + path).catch((e: Error) => e);
  if (res instanceof Error) return { status: -1, marker: res.message };
  const marker =
    res && res.status() === 200
      ? await page.evaluate(() => document.querySelector('meta[name="fcf-s5-page"]')?.getAttribute("content") ?? "(none)")
      : "";
  return { status: res?.status() ?? -1, marker };
}

/** ทำแบบเดียวกับ resetDeviceAfterSignOut (src/pwa/reset-device.ts) — ไม่มีหน้าออกจากระบบใน branch นี้ */
async function resetDeviceInPage(page: Page) {
  await page.evaluate(async () => {
    localStorage.removeItem("fcf:auth");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const workers = [reg?.installing, reg?.waiting, reg?.active].filter(Boolean) as ServiceWorker[];
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve) => {
            const ch = new MessageChannel();
            const t = setTimeout(resolve, 1000);
            ch.port1.onmessage = () => {
              clearTimeout(t);
              resolve();
            };
            w.postMessage({ type: "FCF_USER_RESET" }, [ch.port2]);
          }),
      ),
    );
    for (const name of await caches.keys()) {
      if (name === "fcf-pages-v1" || name === "fcf-pages-staging-v1" || name.startsWith("user-")) await caches.delete(name);
    }
  });
}

async function phaseAuth() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  let server = await startServer();
  let ctx = await openApp();
  try {
    // 1) ยังไม่ล็อกอิน: SW ติดตั้งจาก /welcome · แท็บของแอปถูก redirect → ไม่ถูกเก็บ
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    const first = await page.goto(ORIGIN + "/welcome");
    check("auth: GET /welcome (no cookie) = 200", first?.status() === 200, `status ${first?.status()}`);
    await waitForController(page);
    let r = await waitPageKeys(page, ["/welcome"]);
    check("auth: not signed in → pages cache holds only /welcome (redirected tabs not stored)", r.ok, JSON.stringify(r.keys));

    // 2) URL ที่มี query / fragment ไม่ลง key
    await page.goto(ORIGIN + "/welcome?error=access_denied");
    await page.goto(ORIGIN + "/styleguide");
    await page.goto(ORIGIN + "/welcome#invite=ABCD-1234");
    await page.waitForTimeout(1500);
    const keys = await pageKeys(page);
    check("auth: no cache key with ? or #, no invite code", !keys.some((k) => /[?#]/.test(k) || k.includes("ABCD")), JSON.stringify(keys));
    await ctx.close();

    // 3) ออฟไลน์ (ไม่เคยล็อกอิน) → เปิด / ได้ /welcome ไม่ใช่ 503
    await stopServer(server);
    ctx = await openApp();
    await ctx.setOffline(true);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    for (const p of ["/", "/history", "/never-visited", "/welcome?error=x"]) {
      const s = await servedPage(page, p);
      check(`auth: offline, never signed in: ${p} → /welcome copy`, s.status === 200 && s.marker === "/welcome", JSON.stringify(s));
    }
    await ctx.close();

    // 4) ล็อกอิน → ทุกแท็บถูกเก็บ
    server = await startServer();
    ctx = await openApp();
    await ctx.addCookies([{ name: S5_SESSION_COOKIE, value: "1", url: ORIGIN }]);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(ORIGIN + "/");
    await waitForController(page);
    r = await waitPageKeys(page, ["/", "/history", "/progress", "/me", "/styleguide", "/welcome"]);
    check("auth: signed in → every tab + /welcome cached", r.ok, JSON.stringify(r.keys));

    // 5) ออกจากระบบ: cookie หาย → reset → location.replace("/welcome") → เติมกลับได้แค่หน้าแบบไม่ล็อกอิน
    await ctx.clearCookies({ name: S5_SESSION_COOKIE });
    await resetDeviceInPage(page);
    await page.evaluate(() => location.replace("/welcome"));
    await page.waitForURL(ORIGIN + "/welcome");
    r = await waitPageKeys(page, ["/welcome"]);
    check("auth: after sign-out → pages cache refilled with /welcome only", r.ok, JSON.stringify(r.keys));
    await ctx.close();

    // 6) ออฟไลน์หลังออกจากระบบ → /welcome
    await stopServer(server);
    ctx = await openApp();
    await ctx.setOffline(true);
    page = ctx.pages()[0] ?? (await ctx.newPage());
    for (const p of ["/", "/me"]) {
      const s = await servedPage(page, p);
      check(`auth: offline after sign-out: ${p} → /welcome copy`, s.status === 200 && s.marker === "/welcome", JSON.stringify(s));
    }

    // 7) ไม่มีสำเนาเลย → 503 Offline
    await page.evaluate(async () => {
      await caches.delete("fcf-pages-v1");
    });
    const res = await page.goto(ORIGIN + "/").catch((e: Error) => e);
    const text = res instanceof Error ? res.message : await page.evaluate(() => document.body.innerText);
    check(
      "auth: offline with no page copies → 503 Offline",
      !(res instanceof Error) && res?.status() === 503 && text.includes("Offline"),
      `status ${res instanceof Error ? res.message : res?.status()}`,
    );
  } finally {
    await ctx.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

async function main() {
  if (phase === "auth") await phaseAuth();
  else if (phase === "first") await phaseFirst();
  else if (phase === "update") await phaseUpdate();
  else if (phase === "locale") await phaseLocale();
  else {
    console.error("usage: tsx src/pwa/e2e/s5-offline-check.ts first|update|locale|auth [--inject]");
    process.exit(2);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

void main();
