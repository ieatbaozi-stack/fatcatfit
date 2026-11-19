// SW ดึงหน้า HTML เอง (install / เติมแท็บ / เปลี่ยนภาษา) แล้วเก็บลง cache — แยกจาก sw.ts เพื่อเทสต์ใน Node ได้
// ใช้ได้ทั้งใน service worker และ Node (fetch/Response/Headers มาตรฐาน) · ไม่ import โค้ดแอป
import {
  LOCALE_HEADER,
  OFFLINE_FALLBACK_PATHS,
  extractHtmlLang,
  isCacheableResponse,
  isStorablePageUrl,
  pageCacheKey,
} from "./strategy";

/** หน้าที่ดึงมาแล้ว ติดภาษาแล้ว — สร้าง Response ใหม่ได้หลายครั้ง (body ของ Response ใช้ได้ครั้งเดียว) */
export interface FetchedPage {
  lang: string | null;
  response: () => Response;
}

/** ติดภาษา (จาก <html lang>) ไว้ใน header ของสำเนา · คง header เดิมทั้งหมด (CSP — ADR 0005 กติกา 4) */
export async function tagWithLocale(res: Response): Promise<FetchedPage> {
  const html = await res.clone().text();
  const lang = extractHtmlLang(html);
  const headers = new Headers(res.headers);
  headers.set(LOCALE_HEADER, lang ?? "");
  const init = { status: res.status, statusText: res.statusText, headers };
  return { lang, response: () => new Response(html, init) };
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type PageCache = Pick<Cache, "put">;

export interface PageFetcherOptions {
  fetch: FetchLike;
  origin: string;
  /** ดึงหน้าเองนานสุดเท่านี้ — เซิร์ฟเวอร์ค้างต้องไม่ทำให้ install ค้าง */
  timeoutMs: number;
}

/**
 * ตัวดึงหน้าของ SW
 * - `credentials: "same-origin"` → cookie ภาษาและ session ถูกส่งไป (ได้ HTML ตามสถานะจริงของผู้ใช้)
 * - `redirect: "manual"` (ADR 0006 ข้อ 4) → ไม่ตามไป render หน้าปลายทางซ้ำ · ได้ opaqueredirect = ไม่เก็บ
 * - ล้ม/ไม่ใช่ 200/redirect/หมดเวลา = null · request ซ้ำของ URL เดียวกันที่ยังไม่จบใช้ผลเดียวกัน
 *
 * รอบผู้ใช้ (epoch): `reset()` ถูกเรียกเมื่อหน้าเว็บแจ้งว่าออกจากระบบ/ลบบัญชี
 * → ผลของการดึงที่เริ่มก่อน reset (ใช้ cookie ของผู้ใช้เดิม) ไม่ถูกเขียนลง cache และไม่ถูกแชร์ให้ request หลัง reset
 * ทำให้หน้าที่เติมกลับหลังออกจากระบบเป็นแบบไม่ล็อกอินเท่านั้น
 */
export function createPageFetcher({ fetch, origin, timeoutMs }: PageFetcherOptions) {
  let epoch = 0;
  const inflight = new Map<string, Promise<FetchedPage | null>>();

  function fetchPage(url: string): Promise<FetchedPage | null> {
    const key = pageCacheKey(url);
    const running = inflight.get(key);
    if (running) return running;
    // ประกาศก่อนกำหนดค่า: finally ของ job อ้างตัวเอง (await ข้างในทำให้ finally รันหลังกำหนดค่าเสมอ)
    let job: Promise<FetchedPage | null> | null = null;
    job = (async () => {
      await Promise.resolve(); // ให้ job ถูกกำหนดค่าและใส่ใน map ก่อน finally จะรันได้ (แม้ fetch โยนทันที)
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const res = await fetch(key, {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "manual",
          signal: abort.signal,
        });
        if (!isCacheableResponse(res)) return null;
        return await tagWithLocale(res);
      } catch {
        return null; // ออฟไลน์/หมดเวลา — ไว้รอบหน้า
      } finally {
        clearTimeout(timer);
        // reset() อาจล้าง map แล้วมี job ใหม่ของ URL เดียวกัน — ลบเฉพาะของตัวเอง
        if (inflight.get(key) === job) inflight.delete(key);
      }
    })();
    inflight.set(key, job);
    return job;
  }

  /**
   * ดึงแล้วเก็บ
   * - lang: เก็บเฉพาะเมื่อได้ภาษานี้ (cookie อาจเปลี่ยนระหว่างทาง) · undefined = ไม่ตรวจภาษา (ใช้ตอน install)
   * - ไม่เก็บถ้ามี reset() ระหว่างดึง · ไม่เก็บ URL ที่มี query หรือต่าง origin
   * คืนรายการ URL ที่เก็บ
   */
  async function refreshInto(cache: PageCache, urls: string[], lang?: string | null): Promise<string[]> {
    const started = epoch;
    const stored: string[] = [];
    await Promise.all(
      urls
        .filter((u) => isStorablePageUrl(u, origin))
        .map(async (url) => {
          const page = await fetchPage(url);
          if (!page || epoch !== started) return;
          if (lang !== undefined && (!lang || page.lang !== lang)) return;
          await cache.put(pageCacheKey(url), page.response());
          stored.push(pageCacheKey(url));
        }),
    );
    return stored;
  }

  return {
    fetchPage,
    refreshInto,
    /** ออกจากระบบ/ลบบัญชี: ทิ้งผลของการดึงที่ค้างอยู่ทั้งหมด */
    reset() {
      epoch += 1;
      inflight.clear();
    },
    /** เลขรอบปัจจุบัน — ใช้กับ navigation ที่ Serwist เก็บเอง (เทียบตอนเริ่มกับตอนจะเก็บ) */
    epoch: () => epoch,
  };
}

export type PageFetcher = ReturnType<typeof createPageFetcher>;

/**
 * เครือข่ายล้มและไม่มีสำเนาของ URL ที่ขอ: `/` → `/welcome` → `503 Offline` (ADR 0006 ข้อ 4)
 * match = ค้นใน cache หน้า
 */
export async function offlineFallback(
  match: (url: string) => Promise<Response | undefined>,
  origin: string,
): Promise<Response> {
  for (const path of OFFLINE_FALLBACK_PATHS) {
    const page = await match(new URL(path, origin).href);
    if (page) return page;
  }
  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
