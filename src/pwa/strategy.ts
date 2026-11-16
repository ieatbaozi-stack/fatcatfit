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
} as const;

/** cache ที่ต้องล้างตอนออกจากระบบ (ADR 0004 ข้อ 8): หน้า HTML + ทุก cache ที่ขึ้นต้น `user-` */
export function isUserScopedCache(name: string): boolean {
  return name === CACHE_NAMES.pages || name.startsWith("user-");
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
