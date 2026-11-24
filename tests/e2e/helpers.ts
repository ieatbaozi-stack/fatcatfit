import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";

// ตัวช่วยของ E2E — ข้อความอ่านจาก messages/*.json (ไม่พิมพ์ข้อความซ้ำในเทสต์ จะได้ไม่หลุดเมื่อแก้คำ)

type Tree = { [key: string]: string | Tree };
const load = (locale: "th" | "en") =>
  JSON.parse(readFileSync(path.resolve(process.cwd(), "messages", `${locale}.json`), "utf8")) as Tree;
export const MESSAGES = { th: load("th"), en: load("en") };

export function msg(locale: "th" | "en", key: string): string {
  let node: string | Tree = MESSAGES[locale];
  for (const part of key.split(".")) {
    if (typeof node === "string" || !(part in node)) throw new Error(`missing message ${locale}:${key}`);
    node = node[part];
  }
  if (typeof node !== "string") throw new Error(`not a leaf ${locale}:${key}`);
  return node;
}

export const TABS = [
  { path: "/", key: "home" },
  { path: "/history", key: "history" },
  { path: "/progress", key: "progress" },
  { path: "/me", key: "me" },
] as const;

export const PAGES = ["/", "/history", "/progress", "/me", "/styleguide"] as const;

/** ค่าสีจาก DESIGN.md ข้อ 3 (CR4.1 Soft Charcoal Dark · rgb ตามที่เบราว์เซอร์คืน) */
export const TOKENS = {
  light: { paper: "rgb(255, 255, 255)", ink: "rgb(17, 17, 19)", ink2: "rgb(74, 74, 82)", ink3: "rgb(104, 104, 112)" },
  dark: { paper: "rgb(28, 29, 33)", ink: "rgb(236, 236, 240)", ink2: "rgb(200, 202, 211)", ink3: "rgb(167, 170, 182)" },
  accent: "rgb(249, 160, 58)",
} as const;

/** เก็บ console error / pageerror / คำขอที่ล้มเหลว ตลอดอายุของหน้า */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    // /api/health ตอบ 503 ได้ตามสัญญาเมื่อไม่มีฐานข้อมูล (เช่นบน CI) — ไม่นับเป็นข้อผิดพลาดของหน้า
    if (r.status() >= 400 && !r.url().includes("/api/health")) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}

export async function setLocale(context: BrowserContext, baseURL: string, locale: string) {
  await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL }]);
}

/** ตั้งโหมดก่อนโหลดหน้า (เหมือนผู้ใช้เคยเลือกไว้) */
export async function presetTheme(page: Page, theme: "light" | "dark" | null) {
  await page.addInitScript((t) => {
    try {
      if (t) localStorage.setItem("fcf-theme", t);
      else localStorage.removeItem("fcf-theme");
    } catch {
      // ignore
    }
  }, theme);
}

/** หน้าไม่เลื่อนแนวนอน และไม่มี element ที่มองเห็นได้ล้นขอบจอ (body มี overflow-x:hidden จึงต้องเช็กทีละชิ้นด้วย) */
export async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement | SVGElement>("*"))) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      // ข้าม sr-only (ลิงก์ข้ามไปเนื้อหา) ที่ถูกตัดด้วย clip
      if (cs.position === "absolute" && (cs.clipPath === "inset(50%)" || /rect\(0px/.test(cs.clip))) continue;
      if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
      // อยู่ในแถบเลื่อนแนวนอน (เช่นชิปหมวด) ที่ตัวแถบเองไม่ล้นจอ = ตั้งใจให้เลื่อน ไม่ใช่ล้น
      let scroller: HTMLElement | null = el.parentElement;
      while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
      if (scroller && scroller !== document.body && scroller !== document.documentElement) {
        const sr = scroller.getBoundingClientRect();
        if (sr.right <= vw + 0.5 && sr.left >= -0.5) continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 60)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    }
    return { vw, scrollW, offenders: offenders.slice(0, 10) };
  });
  expect(result.scrollW, "scrollWidth > viewport").toBeLessThanOrEqual(result.vw);
  expect(result.offenders, "elements sticking out of the viewport").toEqual([]);
}

/** รอให้ service worker คุมหน้าแล้ว */
export async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20_000 });
}

/** รอให้ cache หน้ามี path ที่ต้องการ (SW เก็บในพื้นหลัง) */
export async function waitForCachedPages(page: Page, paths: string[], lang?: string) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const out: Record<string, string> = {};
          for (const name of await caches.keys()) {
            if (!name.startsWith("fcf-pages")) continue;
            const c = await caches.open(name);
            for (const req of await c.keys()) {
              const res = await c.match(req);
              out[new URL(req.url).pathname] = res?.headers.get("X-FCF-Cached-Lang") ?? "?";
            }
          }
          return out;
        }),
      { timeout: 20_000 },
    )
    .toEqual(expect.objectContaining(Object.fromEntries(paths.map((p) => [p, lang ?? expect.any(String)]))));
}

/** รอให้ AuthGate ได้คำตอบ /api/me = ready แล้วตั้ง hint `fcf:auth` (ADR 0006 ข้อ 3)
 *  ต้องรอก่อนตัดเน็ตในเทสต์ที่ล็อกอินอยู่ — เน็ตหลุดก่อนรู้สถานะบนเครื่องใหม่ = จอยินดีต้อนรับแบบออฟไลน์ (ถูกตาม ADR) */
export async function waitForAuthReady(page: Page) {
  await page.waitForFunction(
    () => {
      try {
        return localStorage.getItem("fcf:auth") === "ready";
      } catch {
        return false;
      }
    },
    null,
    { timeout: 15_000 },
  );
}

/** หน้าที่มีแถบล่าง (กลุ่ม (app) ตาม ADR 0006) — /styleguide, 404 อยู่นอกกลุ่ม ไม่มีแถบล่างแล้ว */
export const APP_PAGES = ["/", "/history", "/progress", "/me"] as const;
