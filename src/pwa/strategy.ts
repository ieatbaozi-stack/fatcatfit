// กติกาว่า service worker จัดการ request แบบไหน (ADR 0004 ข้อ 1)
// ไฟล์นี้ไม่มี I/O และไม่พึ่ง API ของ service worker เพื่อให้เทสต์ใน Node ได้
// ทั้ง sw.ts และเทสต์ใช้ฟังก์ชันเดียวกัน

/** รุ่นของ runtime cache — เปลี่ยนเลขเมื่อรูปแบบ cache เปลี่ยน แล้ว SW ใหม่จะลบของเก่าตอน activate */
export const CACHE_VERSION = 1;

/** ทุก cache ที่ SW นี้สร้างขึ้นต้นด้วย prefix นี้ (ใช้ตอนล้างของเก่า) */
export const CACHE_PREFIX = "fcf-";

export const CACHE_NAMES = {
  /** ไฟล์ที่มี hash ในชื่อ (/_next/static/**) — ไม่เปลี่ยนเนื้อหาเมื่อ URL เดิม */
  assets: `${CACHE_PREFIX}assets-v${CACHE_VERSION}`,
  /** HTML ของหน้า (app shell) — ใช้ตอนออฟไลน์เท่านั้น */
  pages: `${CACHE_PREFIX}pages-v${CACHE_VERSION}`,
  /**
   * HTML ของรุ่นใหม่ที่ SW ตัวใหม่ดึงไว้ตอน install — ย้ายเข้า `pages` ตอน activate
   * (ไม่เขียนลง `pages` ตรงๆ เพราะ SW ตัวเก่ายังคุมอยู่ และ precache ของมันไม่รู้จัก chunk ของรุ่นใหม่)
   */
  pagesStaging: `${CACHE_PREFIX}pages-staging-v${CACHE_VERSION}`,
} as const;

/** path ของ app shell — ถอยไปหน้านี้เมื่อ URL ที่ขอไม่มีสำเนา */
export const APP_SHELL_PATH = "/";

/** จอยินดีต้อนรับ (ADR 0006 ข้อ 1) — HTML เหมือนกันทุกสถานะ เซิร์ฟเวอร์ไม่ redirect จึงเก็บได้เสมอ */
export const WELCOME_PATH = "/welcome";

/**
 * ลำดับถอยเมื่อเครือข่ายล้มและไม่มีสำเนาของ URL ที่ขอ (ADR 0006 ข้อ 4): `/` → `/welcome` → (503 Offline)
 * - ล็อกอินอยู่: `/` มีสำเนา → หน้าแอป (AuthGate ตัดสินต่อ)
 * - ยังไม่ล็อกอิน/เพิ่งออกจากระบบ: `/` ถูก redirect จึงไม่มีสำเนา → จอยินดีต้อนรับ (contract เกณฑ์ 13)
 */
export const OFFLINE_FALLBACK_PATHS = [APP_SHELL_PATH, WELCOME_PATH] as const;

/**
 * หน้าที่ต้องเปิดได้ตอนออฟไลน์ตั้งแต่ติดตั้งครั้งแรก (ADR 0005 สิ่งที่ R3 ต้องรู้ ข้อ ง + ADR 0006 ข้อ 4)
 * = แท็บทั้ง 4 ของแถบล่าง (src/components/nav/bottom-tabs.tsx — เทสต์ตรวจว่าทุกแท็บอยู่ในรายการ) + `/welcome`
 * เพิ่มหน้าใหม่ที่ต้องใช้ออฟไลน์ (เช่นหน้าจดของ R3) ที่นี่ · path ต้องคงที่ ไม่มี id หรือ query
 * หน้าที่เซิร์ฟเวอร์ redirect (เช่นแท็บของแอปตอนไม่ล็อกอิน) ถูกดึงแต่ไม่ถูกเก็บ
 */
export const OFFLINE_PAGES = ["/", "/history", "/progress", "/me", WELCOME_PATH] as const;

/** URL เต็มของ OFFLINE_PAGES */
export function offlinePageUrls(origin: string): string[] {
  return OFFLINE_PAGES.map((p) => new URL(p, origin).href);
}

/**
 * key ของหน้าใน cache = URL ไม่มี fragment
 * (ลิงก์เชิญ `/welcome#invite=…` ต้องไม่ทิ้งโค้ดเชิญไว้ใน key ของ cache — ADR 0006 เกณฑ์ 5)
 */
export function pageCacheKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

/**
 * URL ของหน้าที่เก็บลง cache หน้าได้: origin เดียวกัน · ไม่ใช่ /api · **ไม่มี query** (ADR 0006 ข้อ 4)
 * (เช่น `/welcome?error=…` จาก Better Auth ไม่ถูกเก็บ — URL เดียวกันที่ไม่มี query ถูกเก็บแทนเมื่อเปิดครั้งถัดไป)
 * fragment ไม่นับ เพราะถูกตัดออกจาก key ด้วย pageCacheKey
 */
export function isStorablePageUrl(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === origin && !isApiPath(u.pathname) && u.search === "";
  } catch {
    return false;
  }
}

/** cache ที่ต้องล้างตอนออกจากระบบ (ADR 0004 ข้อ 8): หน้า HTML (รวมที่รอย้าย) + ทุก cache ที่ขึ้นต้น `user-` */
export function isUserScopedCache(name: string): boolean {
  return name === CACHE_NAMES.pages || name === CACHE_NAMES.pagesStaging || name.startsWith("user-");
}

/**
 * runtime cache ของเราที่ไม่ใช่รุ่นปัจจุบัน → ลบตอน activate
 * (precache ชื่อ `serwist-precache-v2-<scope>` — Serwist ลบรายการเก่าเองด้วย cleanupOutdatedCaches)
 */
export function isOutdatedRuntimeCache(name: string): boolean {
  if (!name.startsWith(CACHE_PREFIX)) return false;
  return !(Object.values(CACHE_NAMES) as string[]).includes(name);
}

export type RequestKind =
  /** ไม่แตะ: ปล่อยให้เบราว์เซอร์ส่งไปเครือข่ายตามปกติ ไม่อ่าน/เขียน cache */
  | "bypass"
  /** navigation: network-first แล้วถอยไป HTML ที่ cache ไว้ */
  | "navigation"
  /** asset ที่มี hash: cache-first */
  | "hashed-asset";

export interface RequestInfo {
  url: string;
  method: string;
  mode: string;
  destination: string;
  /** ค่าของ header `RSC` (Next.js ใช้ดึง flight data ตอนเปลี่ยนหน้าในแอป) */
  rscHeader: string | null;
}

/** `/api` และทุกอย่างใต้ `/api/` — ไม่ผ่าน cache ของ SW เลย ทั้งอ่านและเขียน */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function classifyRequest(req: RequestInfo, origin: string): RequestKind {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return "bypass";
  }
  // ต่าง origin (เช่น Google sign-in) ไม่ยุ่ง
  if (url.origin !== origin) return "bypass";
  // ข้อมูลผู้ใช้ — ห้ามผ่าน cache ของ SW ทุก method
  if (isApiPath(url.pathname)) return "bypass";
  // เขียนข้อมูลไม่ cache
  if (req.method !== "GET") return "bypass";
  // ไฟล์ของ service worker เอง ต้องมาจากเครือข่ายเสมอ
  if (url.pathname.startsWith("/serwist/")) return "bypass";
  // flight data ของ React Server Components อาจมีข้อมูลเฉพาะผู้ใช้ในรอบหลัง → ไม่ cache
  if (req.rscHeader !== null || url.searchParams.has("_rsc")) return "bypass";

  if (req.mode === "navigate" || req.destination === "document") return "navigation";
  if (url.pathname.startsWith("/_next/static/")) return "hashed-asset";
  return "bypass";
}

/** เก็บลง cache ได้เฉพาะคำตอบ 200 แบบ basic (same-origin ไม่ใช่ opaque/redirect) */
export function isCacheableResponse(res: { status: number; type: string; redirected?: boolean }): boolean {
  return res.status === 200 && (res.type === "basic" || res.type === "default") && !res.redirected;
}

// ---- ภาษาของหน้าที่ cache (next-intl อ่านภาษาจาก cookie NEXT_LOCALE ตอน render → HTML ขึ้นกับภาษา) ----
// SW มองไม่เห็น cookie ของ request จึงอ่านภาษาจาก <html lang> ของคำตอบ แล้วติดไว้ใน header ของสำเนาที่ cache

/** header ที่ SW ติดไว้กับหน้าที่ cache เพื่อบอกว่าเป็นภาษาอะไร (อยู่ในเครื่องเท่านั้น) */
export const LOCALE_HEADER = "X-FCF-Cached-Lang";

/** ภาษาจาก `<html lang="...">` ตัวแรกของเอกสาร · ไม่พบ = null */
export function extractHtmlLang(html: string): string | null {
  const tag = html.match(/<html\b[^>]*>/i);
  if (!tag) return null;
  const lang = tag[0].match(/\slang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const value = lang ? (lang[1] ?? lang[2] ?? lang[3] ?? "").trim().toLowerCase() : "";
  return value || null;
}

/**
 * หน้าที่ cache ไว้แล้วซึ่งเป็นคนละภาษากับหน้าที่เพิ่งได้จากเครือข่าย → ต้องลบ (และดึงใหม่ถ้าออนไลน์)
 * เพื่อไม่ให้ผู้ใช้ที่เปลี่ยนภาษาแล้วได้หน้าภาษาเดิมตอนออฟไลน์
 * รายการที่ไม่รู้ภาษา (lang = null) ถือว่าไม่ตรง → ลบด้วย
 */
export function pagesInOtherLocale(
  entries: { url: string; lang: string | null }[],
  currentLang: string | null,
  justCachedUrl: string,
): string[] {
  return entries.filter((e) => e.url !== justCachedUrl && e.lang !== currentLang).map((e) => e.url);
}

export interface CachedPage {
  url: string;
  lang: string | null;
}

const unique = (urls: string[]) => [...new Set(urls)];

/**
 * ทำให้ cache หน้าเป็นภาษาเดียว และมีครบทุกหน้าใน OFFLINE_PAGES
 * - remove: หน้าภาษาอื่น/ไม่รู้ภาษา (ลบทันที แม้ออฟไลน์ — หน้าภาษาผิดต้องไม่ถูกแสดง)
 * - fetch: หน้าที่ลบ + หน้าใน OFFLINE_PAGES ที่ยังไม่มีในภาษานี้ (ลองดึงใหม่ ล้ม = ไว้รอบหน้า)
 * ไม่รวม justCachedUrl (เพิ่งได้จากเครือข่าย) · ไม่รู้ภาษาปัจจุบัน (lang = null) → ไม่ทำอะไร
 */
export function planPageSync(
  entries: CachedPage[],
  lang: string | null,
  justCachedUrl: string,
  origin: string,
): { remove: string[]; fetch: string[] } {
  if (!lang) return { remove: [], fetch: [] };
  const remove = pagesInOtherLocale(entries, lang, justCachedUrl);
  const have = new Set(entries.filter((e) => e.lang === lang).map((e) => e.url));
  have.add(justCachedUrl);
  const missing = offlinePageUrls(origin).filter((u) => !have.has(u));
  return { remove, fetch: unique([...remove, ...missing]).filter((u) => u !== justCachedUrl) };
}

/** ภาษาของชุดหน้า: ใช้ภาษาของ app shell ก่อน ไม่มีก็ใช้หน้าแรกที่รู้ภาษา */
export function langOfPages(entries: CachedPage[], origin: string): string | null {
  const shell = new URL(APP_SHELL_PATH, origin).href;
  return entries.find((e) => e.url === shell && e.lang)?.lang ?? entries.find((e) => e.lang)?.lang ?? null;
}

/**
 * ตอน SW ใหม่ activate: ย้ายหน้าที่ดึงไว้ตอน install (staged) เข้า cache หน้า
 * - ภาษาเป้าหมาย = ภาษาของ cache หน้าปัจจุบัน (SW ตัวเก่าคุมให้ตรงกับที่ผู้ใช้เลือกล่าสุด แม้เปลี่ยนหลัง install)
 *   cache ว่าง (ติดตั้งครั้งแรก/เพิ่งออกจากระบบ) → ภาษาของหน้าที่ staged
 * - promote: หน้าที่ staged ในภาษาเป้าหมาย
 * - refetch: หน้าอื่นทั้งหมดที่มีอยู่หรือควรมี (ดึงไม่สำเร็จตอน install, ภาษาไม่ตรง, หน้าที่เปิดระหว่างรอ)
 *   → ลองดึงใหม่ ได้ก็แทน ไม่ได้ก็คงสำเนาเดิมไว้ (ดีกว่าไม่มีหน้าเลยตอนออฟไลน์)
 */
export function planActivation(
  current: CachedPage[],
  staged: CachedPage[],
  origin: string,
): { lang: string | null; promote: string[]; refetch: string[] } {
  const lang = langOfPages(current, origin) ?? langOfPages(staged, origin);
  const promote = lang ? unique(staged.filter((e) => e.lang === lang).map((e) => e.url)) : [];
  const done = new Set(promote);
  const refetch = unique([...current.map((e) => e.url), ...staged.map((e) => e.url), ...offlinePageUrls(origin)]).filter(
    (u) => !done.has(u) && isStorablePageUrl(u, origin),
  );
  return { lang, promote, refetch };
}

/**
 * key ใน cache หน้าที่ต้องลบทิ้ง: มี query (เก็บไว้โดย v0.1.0 ก่อน ADR 0006) หรือมี fragment หรือไม่ใช่หน้าของเรา
 * (ADR 0006 เกณฑ์ 5: ไม่มี key ที่มี `?` หรือ `#`)
 */
export function unstorablePageKeys(urls: string[], origin: string): string[] {
  return urls.filter((u) => !isStorablePageUrl(u, origin) || pageCacheKey(u) !== u);
}

/** หน้าที่ SW ใหม่ต้องดึงตอน install: ทุกแท็บ + ทุกหน้าที่ cache ไว้แล้ว (กัน HTML รุ่นเก่าอ้าง chunk ที่ถูกลบ — ADR 0005 ข้อ จ) */
export function pagesToStage(cachedUrls: string[], origin: string): string[] {
  const own = cachedUrls.filter((u) => isStorablePageUrl(u, origin)).map(pageCacheKey);
  return unique([...offlinePageUrls(origin), ...own]);
}
