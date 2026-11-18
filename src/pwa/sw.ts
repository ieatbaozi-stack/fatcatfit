/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker ของ Fat Cat Fit — กลยุทธ์ตาม ADR 0004 ข้อ 1 และ ADR 0005
// - asset ที่มี hash (/_next/static/**) = precache ตอนติดตั้ง + cache-first
// - navigation = network-first (หมดเวลา 4 วิ) แล้วถอยไป HTML ของ URL นั้น → "/" → "/welcome" → 503 (ADR 0006 ข้อ 4)
//   navigation ที่ URL มี query ไม่ถูกเก็บ · key ของ cache ไม่มี fragment (ลิงก์เชิญ #invite=)
// - /api/** ไม่ผ่าน cache ของ SW เลย (ไม่มี route ที่จับ → เบราว์เซอร์ส่งไปเครือข่ายเอง)
// - SW ใหม่ไม่ skipWaiting เอง: รอจนเปิดแอปครั้งถัดไป (หน้าเว็บสั่ง SKIP_WAITING ตอนเริ่ม ดู register.tsx)
// - หน้า HTML ขึ้นกับภาษา (cookie NEXT_LOCALE): ทุกหน้าที่ cache ติดภาษาไว้ และเก็บได้ภาษาเดียว
//   เมื่อพบภาษาใหม่ (จากหน้าที่ได้จากเครือข่าย หรือหน้าเว็บแจ้งมา) หน้าภาษาเดิมถูกลบแล้วดึงใหม่ทุกแท็บ
// - ทุกแท็บ (OFFLINE_PAGES) เปิดได้ตอนออฟไลน์ตั้งแต่ติดตั้งครั้งแรก:
//   install ดึงทุกแท็บ + ทุกหน้าที่ cache อยู่ ลง cache พัก (pagesStaging) → activate ย้ายเข้า cache หน้า
//   ทำให้ HTML ใน cache หน้าเป็นรุ่นเดียวกับ precache ของ SW ที่คุมอยู่เสมอ
// - หน้าที่เซิร์ฟเวอร์ redirect (แท็บของแอปตอนไม่ล็อกอิน) ไม่ถูกเก็บ · ออกจากระบบแล้ว (หน้าเว็บส่ง USER_RESET)
//   ผลของการดึงที่ค้างอยู่ด้วย cookie เดิมถูกทิ้ง → หน้าที่เติมกลับเป็นแบบไม่ล็อกอินเท่านั้น
// ไฟล์นี้ถูก bundle ด้วย esbuild ผ่าน src/app/serwist/[path]/route.ts — ห้าม import โค้ดแอป
import type { PrecacheEntry, SerwistGlobalConfig, SerwistPlugin } from "serwist";
import { CacheFirst, NetworkFirst, Serwist } from "serwist";
import { PAGE_LANG_MESSAGE, USER_RESET_MESSAGE } from "./messages";
import { createPageFetcher, offlineFallback, tagWithLocale } from "./page-fetch";
import {
  CACHE_NAMES,
  LOCALE_HEADER,
  type CachedPage,
  classifyRequest,
  isCacheableResponse,
  isOutdatedRuntimeCache,
  isStorablePageUrl,
  pageCacheKey,
  pagesInOtherLocale,
  pagesToStage,
  planActivation,
  planPageSync,
  unstorablePageKeys,
} from "./strategy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const ORIGIN = self.location.origin;

/** ดึงหน้าเองนานสุดเท่านี้ (install/activate/sync) — เซิร์ฟเวอร์ค้างต้องไม่ทำให้ install ค้าง */
const PAGE_FETCH_TIMEOUT_MS = 10_000;

/** ตัวดึงหน้าเอง (install/เติมแท็บ/เปลี่ยนภาษา) — redirect: "manual" และทิ้งผลที่ค้างเมื่อออกจากระบบ (page-fetch.ts) */
const pageFetcher = createPageFetcher({
  fetch: (url, init) => fetch(url, init),
  origin: ORIGIN,
  timeoutMs: PAGE_FETCH_TIMEOUT_MS,
});

async function readPages(cache: Cache): Promise<CachedPage[]> {
  const requests = await cache.keys();
  return Promise.all(
    requests.map(async (req) => {
      const tag = (await cache.match(req))?.headers.get(LOCALE_HEADER);
      return { url: req.url, lang: tag ? tag : null };
    }),
  );
}

/**
 * ให้ cache หน้ามีภาษาเดียวและมีครบทุกแท็บ: ลบหน้าภาษาอื่น แล้วดึงหน้าที่ลบ + แท็บที่ขาด ใหม่
 * ออฟไลน์ = ลบอย่างเดียว (หน้าภาษาผิดไม่ถูกแสดง ถอยไปหน้าที่ภาษาถูกแทน)
 */
async function syncPages(lang: string | null, justCachedUrl: string) {
  const cache = await caches.open(CACHE_NAMES.pages);
  const plan = planPageSync(await readPages(cache), lang, justCachedUrl, ORIGIN);
  await Promise.all(plan.remove.map((url) => cache.delete(url)));
  await pageFetcher.refreshInto(cache, plan.fetch, lang);
}

/** เก็บเฉพาะคำตอบ 200 ที่ไม่ได้ถูก redirect */
const onlyOk: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (isCacheableResponse(response) ? response : null),
};

/**
 * asset ที่ไม่อยู่ใน precache ของ SW ตัวนี้และไม่อยู่ใน fcf-assets → หาในทุก cache ก่อนยอมล้ม
 * กรณี: SW ใหม่ติดตั้งแล้วรออยู่ (เพิ่ม chunk รุ่นใหม่ลง precache cache ที่ใช้ชื่อเดียวกัน) แต่ SW เก่ายังคุม
 * แล้วหน้าเปิด HTML รุ่นใหม่ตอนออฟไลน์ — precache ของ Serwist เก็บ /_next/static/** ด้วย URL ตรงๆ จึงหาเจอ
 */
const anyCacheFallback: SerwistPlugin = {
  handlerDidError: async ({ request }) => (await caches.match(request.url)) ?? undefined,
};

/**
 * หน้า HTML: เก็บพร้อมภาษา และล้าง/เติมหน้าเมื่อภาษาเปลี่ยน
 * - key = URL ไม่มี fragment · ไม่เก็บ URL ที่มี query (ADR 0006 ข้อ 4)
 * - ไม่เก็บถ้าออกจากระบบระหว่างรอคำตอบ (คำตอบนี้ได้มาด้วย cookie ของผู้ใช้เดิม)
 */
const localeAwarePages: SerwistPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => pageCacheKey(request.url),
  handlerWillStart: async ({ state }) => {
    if (state) state.epoch = pageFetcher.epoch();
  },
  cacheWillUpdate: async ({ request, response, state }) => {
    if (!isStorablePageUrl(request.url, ORIGIN) || !isCacheableResponse(response)) return null;
    // state ของ plugin มีทุก request (Serwist StrategyHandler สร้าง {} ให้ทุก plugin)
    if (state && state.epoch !== pageFetcher.epoch()) return null;
    return (await tagWithLocale(response)).response();
  },
  // Serwist เรียกหลังตอบหน้าเว็บแล้ว ภายใน waitUntil ของ fetch event — ไม่ทำให้หน้าช้า
  cacheDidUpdate: async ({ request, newResponse }) => {
    await syncPages(newResponse.headers.get(LOCALE_HEADER) || null, request.url);
  },
};

/**
 * เครือข่ายล้มและไม่มีสำเนาของ URL นี้ (หน้าที่ไม่ใช่แท็บ เช่น /styleguide, URL ที่มี query, URL ที่ไม่มี)
 * → "/" (ล็อกอินอยู่) → "/welcome" (ไม่ล็อกอิน/เพิ่งออกจากระบบ) → 503 Offline
 */
const shellFallback: SerwistPlugin = {
  handlerDidError: async () => {
    const cache = await caches.open(CACHE_NAMES.pages);
    return offlineFallback((url) => cache.match(url), ORIGIN);
  },
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  // false = Serwist ฟังข้อความ { type: "SKIP_WAITING" } แล้ว skipWaiting ให้เอง (ค่าเดียวกับ SKIP_WAITING_MESSAGE)
  skipWaiting: false,
  // ติดตั้งครั้งแรก: คุมหน้าที่เปิดอยู่ทันที (รุ่นถัดไป activate หลังได้ SKIP_WAITING ตอนเปิดแอปเท่านั้น)
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => classifyRequest(toInfo(request), ORIGIN) === "navigation",
      handler: new NetworkFirst({
        cacheName: CACHE_NAMES.pages,
        networkTimeoutSeconds: 4,
        plugins: [localeAwarePages, shellFallback],
      }),
    },
    {
      matcher: ({ request }) => classifyRequest(toInfo(request), ORIGIN) === "hashed-asset",
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.assets,
        plugins: [onlyOk, anyCacheFallback],
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

// install: ดึงทุกแท็บ + ทุกหน้าที่ cache อยู่ ลง cache พัก
// - ไม่เขียนลง cache หน้าตรงๆ: SW ตัวเก่ายังคุมจนกว่าจะ activate และ precache ของมันไม่รู้จัก chunk รุ่นใหม่
// - หน้าไหนดึงไม่ได้ (500, ออฟไลน์, หมดเวลา) → ข้าม ไม่ทำให้ install ล้ม (หน้าที่พังต้องไม่ขวางรุ่นที่แก้)
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await caches.delete(CACHE_NAMES.pagesStaging); // ของ SW ที่ติดตั้งแล้วถูกแทนก่อน activate
        const current = (await (await caches.open(CACHE_NAMES.pages)).keys()).map((r) => r.url);
        const staging = await caches.open(CACHE_NAMES.pagesStaging);
        await pageFetcher.refreshInto(staging, pagesToStage(current, ORIGIN));
      } catch {
        // Cache Storage ใช้ไม่ได้ (เช่นพื้นที่เต็ม) — ข้าม navigation จะ cache เองทีหลัง
      }
    })(),
  );
});

/**
 * ย้ายหน้าที่พักไว้เข้า cache หน้า (อ่าน/เขียน cache เท่านั้น ไม่รอเครือข่าย — fetch event รอ activate อยู่)
 * คืนรายการที่ต้องลองดึงใหม่ทีหลัง
 */
async function promoteStagedPages(): Promise<{ lang: string | null; refetch: string[] }> {
  const pages = await caches.open(CACHE_NAMES.pages);
  const hasStaging = await caches.has(CACHE_NAMES.pagesStaging);
  const staging = hasStaging ? await caches.open(CACHE_NAMES.pagesStaging) : null;
  const current = await readPages(pages);
  const plan = planActivation(current, staging ? await readPages(staging) : [], ORIGIN);
  if (staging) {
    for (const url of plan.promote) {
      const res = await staging.match(url);
      if (res) await pages.put(url, res);
    }
    await caches.delete(CACHE_NAMES.pagesStaging);
  }
  // key ที่มี query/fragment (เก็บไว้โดยรุ่นก่อน ADR 0006) ลบทิ้ง — ADR 0006 เกณฑ์ 5
  await Promise.all(unstorablePageKeys((await pages.keys()).map((r) => r.url), ORIGIN).map((url) => pages.delete(url)));
  // หน้าภาษาอื่นที่ค้างอยู่ (ไม่ควรมี) ลบทิ้ง
  if (plan.lang) {
    await Promise.all(pagesInOtherLocale(await readPages(pages), plan.lang, "").map((url) => pages.delete(url)));
  }
  return { lang: plan.lang, refetch: plan.refetch };
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      let pending: { lang: string | null; refetch: string[] } = { lang: null, refetch: [] };
      try {
        pending = await promoteStagedPages();
      } catch {
        // ข้าม — หน้าที่ขาดจะถูกเติมเมื่อหน้าเว็บแจ้งภาษาหรือเปิดหน้านั้นออนไลน์
      }
      const names = await caches.keys();
      await Promise.all(names.filter(isOutdatedRuntimeCache).map((name) => caches.delete(name)));
      // หน้าที่ดึงไม่ได้ตอน install / หน้าที่เปิดระหว่างรอ: ลองใหม่โดยไม่ถ่วง activate
      // ล้มก็คงสำเนาเดิม (มีหน้าดีกว่าไม่มีตอนออฟไลน์)
      if (pending.refetch.length > 0) {
        void caches
          .open(CACHE_NAMES.pages)
          .then((cache) => pageFetcher.refreshInto(cache, pending.refetch, pending.lang))
          .catch(() => {});
      }
    })(),
  );
});

// หน้าเว็บแจ้งภาษาปัจจุบัน (<html lang>) ตอนเปิดและเมื่อเปลี่ยนภาษาแบบไม่ reload (router.refresh เป็น RSC ซึ่ง SW ไม่ cache)
// ใช้เติมแท็บที่ขาดด้วย (เช่นหลังออกจากระบบซึ่งล้าง cache หน้า)
self.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (!data || typeof data !== "object") return;
  const type = (data as { type?: unknown }).type;
  // ออกจากระบบ/ลบบัญชี (reset-device.ts): ทิ้งการดึงที่ค้าง แล้วตอบกลับทาง port ให้หน้าเว็บล้าง cache ต่อ
  if (type === USER_RESET_MESSAGE) {
    pageFetcher.reset();
    event.ports[0]?.postMessage({ type: USER_RESET_MESSAGE, ok: true });
    return;
  }
  if (type !== PAGE_LANG_MESSAGE) return;
  const lang = (data as { lang?: unknown }).lang;
  if (typeof lang !== "string" || !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(lang)) return;
  event.waitUntil(syncPages(lang.toLowerCase(), ""));
});

serwist.addEventListeners();
