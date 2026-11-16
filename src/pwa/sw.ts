/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker ของ Fat Cat Fit — กลยุทธ์ตาม ADR 0004 ข้อ 1
// - asset ที่มี hash (/_next/static/**) = precache ตอนติดตั้ง + cache-first
// - navigation = network-first (หมดเวลา 4 วิ) แล้วถอยไป HTML ของ URL นั้น → app shell "/" ที่ cache ไว้
// - /api/** ไม่ผ่าน cache ของ SW เลย (ไม่มี route ที่จับ → เบราว์เซอร์ส่งไปเครือข่ายเอง)
// - SW ใหม่ไม่ skipWaiting เอง: รอจนเปิดแอปครั้งถัดไป (หน้าเว็บสั่ง SKIP_WAITING ตอนเริ่ม ดู register.tsx)
// - หน้า HTML ขึ้นกับภาษา (cookie NEXT_LOCALE): ทุกหน้าที่ cache ติดภาษาไว้ และเก็บได้ภาษาเดียว
//   เมื่อพบภาษาใหม่ (จากหน้าที่ได้จากเครือข่าย หรือหน้าเว็บแจ้งมา) หน้าภาษาเดิมถูกลบแล้วดึงใหม่
// ไฟล์นี้ถูก bundle ด้วย esbuild ผ่าน src/app/serwist/[path]/route.ts — ห้าม import โค้ดแอป
import type { PrecacheEntry, SerwistGlobalConfig, SerwistPlugin } from "serwist";
import { CacheFirst, NetworkFirst, Serwist } from "serwist";
import { PAGE_LANG_MESSAGE } from "./messages";
import {
  CACHE_NAMES,
  LOCALE_HEADER,
  classifyRequest,
  extractHtmlLang,
  isCacheableResponse,
  isOutdatedRuntimeCache,
  pagesInOtherLocale,
} from "./strategy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const APP_SHELL_URL = "/";

/** สำเนาของหน้าที่ติดภาษาไว้ใน header (อ่านจาก <html lang>) */
async function tagWithLocale(response: Response): Promise<{ tagged: Response; lang: string | null }> {
  const html = await response.clone().text();
  const lang = extractHtmlLang(html);
  const headers = new Headers(response.headers);
  headers.set(LOCALE_HEADER, lang ?? "");
  return { tagged: new Response(html, { status: response.status, statusText: response.statusText, headers }), lang };
}

/**
 * ให้ cache หน้ามีภาษาเดียว: ลบหน้าที่เป็นภาษาอื่น แล้วลองดึงใหม่ (ได้ภาษาตาม cookie ปัจจุบัน)
 * ออฟไลน์ = ลบอย่างเดียว (หน้าภาษาผิดไม่ถูกแสดง ถอยไปหน้าที่ภาษาถูกแทน)
 */
async function keepSingleLocale(lang: string | null, justCachedUrl: string) {
  const cache = await caches.open(CACHE_NAMES.pages);
  const requests = await cache.keys();
  const entries = await Promise.all(
    requests.map(async (req) => {
      const res = await cache.match(req);
      const tag = res?.headers.get(LOCALE_HEADER);
      return { url: req.url, lang: tag ? tag : null };
    }),
  );
  const stale = pagesInOtherLocale(entries, lang, justCachedUrl);
  if (stale.length === 0) return;
  await Promise.all(stale.map((url) => cache.delete(url)));
  const shell = new URL(APP_SHELL_URL, self.location.origin).href;
  const refetch = new Set(stale);
  if (justCachedUrl !== shell) refetch.add(shell);
  await Promise.all(
    [...refetch].map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (!isCacheableResponse(res)) return;
        const { tagged, lang: fetchedLang } = await tagWithLocale(res);
        if (fetchedLang === lang) await cache.put(url, tagged);
      } catch {
        // ออฟไลน์ — ดึงใหม่ตอนเปิดออนไลน์ครั้งถัดไป
      }
    }),
  );
}

/** เก็บเฉพาะคำตอบ 200 ที่ไม่ได้ถูก redirect */
const onlyOk: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (isCacheableResponse(response) ? response : null),
};

/** หน้า HTML: เก็บพร้อมภาษา และล้างหน้าภาษาอื่นเมื่อภาษาเปลี่ยน */
const localeAwarePages: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => {
    if (!isCacheableResponse(response)) return null;
    return (await tagWithLocale(response)).tagged;
  },
  // Serwist เรียกหลังตอบหน้าเว็บแล้ว ภายใน waitUntil ของ fetch event — ไม่ทำให้หน้าช้า
  cacheDidUpdate: async ({ request, newResponse }) => {
    await keepSingleLocale(newResponse.headers.get(LOCALE_HEADER) || null, request.url);
  },
};

/** เครือข่ายล้มและไม่มีสำเนาของ URL นี้ → ใช้ app shell "/" */
const shellFallback: SerwistPlugin = {
  handlerDidError: async () => {
    const cache = await caches.open(CACHE_NAMES.pages);
    const shell = await cache.match(APP_SHELL_URL);
    return (
      shell ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      })
    );
  },
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  // false = Serwist ฟังข้อความ { type: "SKIP_WAITING" } แล้ว skipWaiting ให้เอง (ค่าเดียวกับ SKIP_WAITING_MESSAGE)
  skipWaiting: false,
  // ติดตั้งครั้งแรก: คุมหน้าที่เปิดอยู่ทันทีเพื่อให้ cache "/" ได้ตั้งแต่การเปิดครั้งแรก
  // (รุ่นถัดไป activate หลังได้ SKIP_WAITING ตอนเปิดแอปเท่านั้น)
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => classifyRequest(toInfo(request), self.location.origin) === "navigation",
      handler: new NetworkFirst({
        cacheName: CACHE_NAMES.pages,
        networkTimeoutSeconds: 4,
        plugins: [localeAwarePages, shellFallback],
      }),
    },
    {
      matcher: ({ request }) => classifyRequest(toInfo(request), self.location.origin) === "hashed-asset",
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.assets,
        plugins: [onlyOk],
      }),
    },
    // ทุกอย่างอื่น (รวม /api/**) ไม่มี route → ไม่ผ่าน cache
  ],
});

function toInfo(request: Request) {
  return {
    url: request.url,
    method: request.method,
    mode: request.mode,
    destination: request.destination,
    rscHeader: request.headers.get("RSC"),
  };
}

self.addEventListener("install", (event) => {
  // เก็บ app shell ไว้ตั้งแต่ติดตั้ง — ล้มก็ไม่ทำให้ติดตั้งล้ม (navigation จะ cache เองครั้งถัดไป)
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(APP_SHELL_URL, { credentials: "same-origin", cache: "no-store" });
        if (isCacheableResponse(res)) {
          const { tagged, lang } = await tagWithLocale(res);
          const cache = await caches.open(CACHE_NAMES.pages);
          await cache.put(APP_SHELL_URL, tagged);
          await keepSingleLocale(lang, new URL(APP_SHELL_URL, self.location.origin).href);
        }
      } catch {
        // ออฟไลน์ระหว่างติดตั้ง — ข้าม
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter(isOutdatedRuntimeCache).map((name) => caches.delete(name)));
    })(),
  );
});

// หน้าเว็บแจ้งภาษาปัจจุบัน (<html lang>) ตอนเปิดและเมื่อเปลี่ยนภาษาแบบไม่ reload (router.refresh เป็น RSC ซึ่ง SW ไม่ cache)
self.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (!data || typeof data !== "object" || (data as { type?: unknown }).type !== PAGE_LANG_MESSAGE) return;
  const lang = (data as { lang?: unknown }).lang;
  if (typeof lang !== "string" || !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(lang)) return;
  event.waitUntil(keepSingleLocale(lang.toLowerCase(), ""));
});

serwist.addEventListeners();
