import { describe, expect, it } from "vitest";
import { TABS } from "../components/nav/bottom-tabs";
import {
  APP_SHELL_PATH,
  ASSET_CACHE_LIMITS,
  CACHE_NAMES,
  EXERCISE_EDIT_PATH,
  R3_OFFLINE_PAGES,
  OFFLINE_FALLBACK_PATHS,
  OFFLINE_PAGES,
  WELCOME_PATH,
  classifyRequest,
  extractHtmlLang,
  langOfPages,
  offlinePageUrls,
  pagesInOtherLocale,
  pagesToStage,
  planActivation,
  planPageSync,
  isAdminPath,
  isApiPath,
  isCacheableResponse,
  isOutdatedRuntimeCache,
  isStorablePageUrl,
  isUserScopedCache,
  pageCacheKey,
  unstorablePageKeys,
  type RequestInfo,
} from "./strategy";

const ORIGIN = "https://fatcat.example";

function req(path: string, over: Partial<RequestInfo> = {}): RequestInfo {
  return {
    url: path.startsWith("http") ? path : `${ORIGIN}${path}`,
    method: "GET",
    mode: "cors",
    destination: "",
    rscHeader: null,
    ...over,
  };
}

const nav = (path: string, over: Partial<RequestInfo> = {}) => req(path, { mode: "navigate", destination: "document", ...over });

describe("classifyRequest — /api/** ไม่ผ่าน cache ของ SW", () => {
  it.each([
    ["GET /api/health", req("/api/health")],
    ["GET /api/health?x=1", req("/api/health?x=1")],
    ["POST /api/sync/push", req("/api/sync/push", { method: "POST" })],
    ["GET /api/sync/push", req("/api/sync/push")],
    ["GET /api/bootstrap", req("/api/bootstrap")],
    ["GET /api/auth/get-session", req("/api/auth/get-session")],
    ["GET /api", req("/api")],
    ["navigate ไป /api/export (เปิดไฟล์ในแท็บ)", nav("/api/export")],
  ])("%s → bypass", (_, r) => {
    expect(classifyRequest(r, ORIGIN)).toBe("bypass");
  });

  it("path ที่แค่ขึ้นต้นคล้าย api ไม่ถือเป็น api", () => {
    expect(isApiPath("/apis")).toBe(false);
    expect(isApiPath("/api-docs")).toBe(false);
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/")).toBe(true);
  });
});

describe("classifyRequest — navigation", () => {
  it("หน้าหลักและหน้าอื่นเป็น navigation", () => {
    expect(classifyRequest(nav("/"), ORIGIN)).toBe("navigation");
    expect(classifyRequest(nav("/history"), ORIGIN)).toBe("navigation");
  });

  it("navigation แบบ POST (ฟอร์ม) ไม่ cache", () => {
    expect(classifyRequest(nav("/", { method: "POST" }), ORIGIN)).toBe("bypass");
  });

  it("RSC flight request ไม่ cache (อาจมีข้อมูลผู้ใช้ในรอบหลัง)", () => {
    expect(classifyRequest(req("/history", { rscHeader: "1" }), ORIGIN)).toBe("bypass");
    expect(classifyRequest(req("/history?_rsc=abc"), ORIGIN)).toBe("bypass");
  });
});

describe("classifyRequest — asset", () => {
  it("/_next/static/** เป็น hashed-asset", () => {
    expect(classifyRequest(req("/_next/static/chunks/abc123.js", { destination: "script" }), ORIGIN)).toBe("hashed-asset");
    expect(classifyRequest(req("/_next/static/media/font.woff2", { destination: "font" }), ORIGIN)).toBe("hashed-asset");
  });

  it("ไฟล์ที่ไม่มี hash และ /_next/image ไม่ผ่าน runtime cache", () => {
    expect(classifyRequest(req("/icons/icon-192.png", { destination: "image" }), ORIGIN)).toBe("bypass");
    expect(classifyRequest(req("/_next/image?url=%2Fa.png&w=64&q=75"), ORIGIN)).toBe("bypass");
  });

  it("ตัว service worker เองไม่ cache", () => {
    expect(classifyRequest(req("/serwist/sw.js", { destination: "serviceworker" }), ORIGIN)).toBe("bypass");
  });

  it("ต่าง origin ไม่ยุ่ง", () => {
    expect(classifyRequest(req("https://accounts.google.com/o/oauth2", { mode: "navigate" }), ORIGIN)).toBe("bypass");
    expect(classifyRequest(req("https://cdn.other.example/_next/static/x.js"), ORIGIN)).toBe("bypass");
  });

  it("URL เสียไม่ทำให้ SW ล้ม", () => {
    expect(classifyRequest(req("not a url"), ORIGIN)).toBe("bypass");
  });
});

describe("isCacheableResponse — เก็บเฉพาะ 200", () => {
  it.each([
    [{ status: 200, type: "basic" }, true],
    [{ status: 200, type: "default" }, true],
    [{ status: 200, type: "basic", redirected: true }, false],
    [{ status: 0, type: "opaque" }, false],
    // fetchPage ใช้ redirect: "manual" (ADR 0006 ข้อ 4) → redirect ได้ type opaqueredirect status 0
    [{ status: 0, type: "opaqueredirect" }, false],
    [{ status: 307, type: "basic" }, false],
    [{ status: 200, type: "cors" }, false],
    [{ status: 204, type: "basic" }, false],
    [{ status: 304, type: "basic" }, false],
    [{ status: 404, type: "basic" }, false],
    [{ status: 500, type: "basic" }, false],
    [{ status: 503, type: "basic" }, false],
  ])("%o → %s", (res, expected) => {
    expect(isCacheableResponse(res)).toBe(expected);
  });
});

describe("ชื่อ cache", () => {
  it("มีหมายเลขรุ่นในชื่อ", () => {
    expect(CACHE_NAMES.assets).toMatch(/-v\d+$/);
    expect(CACHE_NAMES.pages).toMatch(/-v\d+$/);
  });

  it("ลบ runtime cache รุ่นเก่า แต่ไม่ลบรุ่นปัจจุบัน precache หรือ cache ของคนอื่น", () => {
    expect(isOutdatedRuntimeCache("fcf-pages-v0")).toBe(true);
    expect(isOutdatedRuntimeCache("fcf-assets-v0")).toBe(true);
    expect(isOutdatedRuntimeCache(CACHE_NAMES.pages)).toBe(false);
    expect(isOutdatedRuntimeCache(CACHE_NAMES.assets)).toBe(false);
    expect(isOutdatedRuntimeCache("serwist-precache-v2-https://fatcat.example/")).toBe(false);
    expect(isOutdatedRuntimeCache("user-123")).toBe(false);
    expect(isOutdatedRuntimeCache("other-lib")).toBe(false);
  });

  it("cache ที่ต้องล้างตอนออกจากระบบ: หน้า HTML และ user-*", () => {
    expect(isUserScopedCache(CACHE_NAMES.pages)).toBe(true);
    expect(isUserScopedCache("user-abc")).toBe(true);
    expect(isUserScopedCache(CACHE_NAMES.assets)).toBe(false);
    expect(isUserScopedCache("serwist-precache-v2-https://fatcat.example/")).toBe(false);
  });
});

describe("ภาษาของหน้าที่ cache (NEXT_LOCALE)", () => {
  it.each([
    ['<!DOCTYPE html><html lang="th"><head>', "th"],
    ['<!DOCTYPE html><html class="dark" lang="en" data-x="1">', "en"],
    ["<html lang='EN'>", "en"],
    ["<html lang=th>", "th"],
    ['<html><body lang="en">', null],
    ["<html>", null],
    ["no html", null],
    ['<html data-lang="en">', null],
  ])("extractHtmlLang(%s) = %s", (html, expected) => {
    expect(extractHtmlLang(html)).toBe(expected);
  });

  it("เปลี่ยนเป็น English → ลบทุกหน้าที่เป็นไทยหรือไม่รู้ภาษา ยกเว้นหน้าที่เพิ่ง cache", () => {
    const entries = [
      { url: "https://x/", lang: "th" },
      { url: "https://x/history", lang: "th" },
      { url: "https://x/me", lang: "en" },
      { url: "https://x/progress", lang: null },
    ];
    expect(pagesInOtherLocale(entries, "en", "https://x/me")).toEqual(["https://x/", "https://x/history", "https://x/progress"]);
  });

  it("ภาษาเดิม → ไม่ลบอะไร", () => {
    const entries = [
      { url: "https://x/", lang: "th" },
      { url: "https://x/history", lang: "th" },
    ];
    expect(pagesInOtherLocale(entries, "th", "https://x/")).toEqual([]);
  });
});

describe("หน้าที่ต้องเปิดได้ตอนออฟไลน์ (OFFLINE_PAGES)", () => {
  it("แถบล่างทุกแท็บอยู่ในรายการ — เพิ่มแท็บแล้วต้องเพิ่มที่นี่ด้วย (ADR 0006 ข้อ 4)", () => {
    for (const t of TABS) expect(OFFLINE_PAGES).toContain(t.href);
  });

  it("มีจอยินดีต้อนรับ /welcome (เปิดแอปออฟไลน์ตอนไม่ล็อกอินได้จอนี้ — contract เกณฑ์ 13)", () => {
    expect(WELCOME_PATH).toBe("/welcome");
    expect(OFFLINE_PAGES).toContain(WELCOME_PATH);
  });

  it("นอกจากแท็บแล้วมีแค่ /welcome + หน้าของ R3a (หน้าที่เพิ่มต้องตั้งใจเพิ่ม)", () => {
    expect([...OFFLINE_PAGES].sort()).toEqual([...TABS.map((t) => t.href), WELCOME_PATH, ...R3_OFFLINE_PAGES].sort());
  });

  it("R3a: หน้าจด ท่าของฉัน (รายการ/สร้าง/แก้ path คงที่) สถานที่ เครดิต เปิดได้ออฟไลน์ (เกณฑ์ 15)", () => {
    for (const p of ["/log", "/me/exercises", "/me/exercises/new", "/me/places", "/me/credits"]) expect(OFFLINE_PAGES).toContain(p);
    expect(EXERCISE_EDIT_PATH).toBe("/me/exercises/edit");
    expect(OFFLINE_PAGES).toContain(EXERCISE_EDIT_PATH);
  });

  it("app shell อยู่ในรายการ และทุก path คงที่ (ไม่มี query/id) ไม่ซ้ำ", () => {
    expect(OFFLINE_PAGES).toContain(APP_SHELL_PATH);
    for (const p of OFFLINE_PAGES) expect(p).toMatch(/^(\/[a-z-]*)+$/);
    expect(new Set(OFFLINE_PAGES).size).toBe(OFFLINE_PAGES.length);
  });

  it("เพดาน cache asset มีจำนวนและอายุ (ADR 0005 เลื่อนมา R3)", () => {
    expect(ASSET_CACHE_LIMITS.maxEntries).toBeGreaterThan(0);
    expect(ASSET_CACHE_LIMITS.maxAgeSeconds).toBeGreaterThan(0);
  });

  it("offlinePageUrls เป็น URL เต็มของ origin", () => {
    expect(offlinePageUrls(ORIGIN)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/history`,
      `${ORIGIN}/progress`,
      `${ORIGIN}/me`,
      `${ORIGIN}/welcome`,
      `${ORIGIN}/log`,
      `${ORIGIN}/me/exercises`,
      `${ORIGIN}/me/exercises/new`,
      `${ORIGIN}/me/exercises/edit`,
      `${ORIGIN}/me/places`,
      `${ORIGIN}/me/credits`,
    ]);
  });

  it("cache พักหน้าถูกล้างตอนออกจากระบบ และไม่ถูกลบเป็นของเก่าตอน activate", () => {
    expect(isUserScopedCache(CACHE_NAMES.pagesStaging)).toBe(true);
    expect(isOutdatedRuntimeCache(CACHE_NAMES.pagesStaging)).toBe(false);
    expect(isOutdatedRuntimeCache("fcf-pages-staging-v0")).toBe(true);
  });
});

const u = (p: string) => `${ORIGIN}${p}`;
// ทุกหน้าใน OFFLINE_PAGES (4 แท็บ + /welcome + หน้าของ R3a)
const ALL_TABS = OFFLINE_PAGES.map(u);
const R3 = R3_OFFLINE_PAGES.map(u);
const FIRST5 = ["/", "/history", "/progress", "/me", "/welcome"].map(u);

describe("pagesToStage — SW ใหม่ดึงอะไรตอน install", () => {
  it("ติดตั้งครั้งแรก (cache ว่าง) → ทั้ง 4 แท็บ + /welcome", () => {
    expect(pagesToStage([], ORIGIN)).toEqual(ALL_TABS);
  });

  it("อัปเดต → ทุกแท็บ + ทุกหน้าที่ cache อยู่ ไม่ซ้ำ ไม่เอาต่าง origin หรือ /api", () => {
    const cached = [u("/"), u("/styleguide"), u("/me"), "https://evil.example/x", u("/api/health"), "not a url"];
    expect(pagesToStage(cached, ORIGIN)).toEqual([...ALL_TABS, u("/styleguide")]);
  });

  it("key เก่าที่มี query ไม่ถูกดึงซ้ำ · fragment ถูกตัด (ADR 0006 ข้อ 4)", () => {
    const cached = [u("/welcome?error=access_denied"), u("/?x=1"), u("/styleguide#top")];
    expect(pagesToStage(cached, ORIGIN)).toEqual([...ALL_TABS, u("/styleguide")]);
  });
});

describe("planPageSync — ภาษาเดียว และมีครบทุกแท็บ", () => {
  it("เปลี่ยนภาษา → ลบหน้าภาษาเดิมทั้งหมด และดึงใหม่ทั้ง 4 แท็บ (ไม่ใช่แค่ /)", () => {
    const entries = [
      { url: u("/"), lang: "th" },
      { url: u("/history"), lang: "th" },
      { url: u("/progress"), lang: "th" },
      { url: u("/me"), lang: "th" },
      { url: u("/welcome"), lang: "th" },
      { url: u("/styleguide"), lang: "th" },
    ];
    const plan = planPageSync(entries, "en", "", ORIGIN);
    expect(plan.remove.sort()).toEqual([...FIRST5, u("/styleguide")].sort());
    expect(plan.fetch.sort()).toEqual([...ALL_TABS, u("/styleguide")].sort());
  });

  it("เปลี่ยนภาษาจากการเปิด /me (เพิ่งได้จากเครือข่าย) → ไม่ลบ/ไม่ดึง /me ซ้ำ", () => {
    const entries = ALL_TABS.map((url) => ({ url, lang: url === u("/me") ? "en" : "th" }));
    const plan = planPageSync(entries, "en", u("/me"), ORIGIN);
    expect(plan.remove.sort()).toEqual(ALL_TABS.filter((x) => x !== u("/me")).sort());
    expect(plan.fetch).not.toContain(u("/me"));
    expect(plan.fetch.sort()).toEqual(ALL_TABS.filter((x) => x !== u("/me")).sort());
  });

  it("ภาษาเดิมและครบแล้ว → ไม่ทำอะไร (ไม่ยิงเครือข่ายทุกครั้งที่เปลี่ยนหน้า)", () => {
    const entries = ALL_TABS.map((url) => ({ url, lang: "th" }));
    expect(planPageSync(entries, "th", u("/history"), ORIGIN)).toEqual({ remove: [], fetch: [] });
  });

  it("แท็บขาด (เช่นหลังออกจากระบบ หรือดึงไม่สำเร็จตอน install) → เติมเฉพาะที่ขาด", () => {
    const plan = planPageSync([{ url: u("/"), lang: "th" }], "th", "", ORIGIN);
    expect(plan).toEqual({ remove: [], fetch: [u("/history"), u("/progress"), u("/me"), u("/welcome"), ...R3] });
  });

  it("cache ว่าง → เติมทั้ง 4 แท็บ + /welcome", () => {
    expect(planPageSync([], "en", "", ORIGIN).fetch).toEqual(ALL_TABS);
  });

  it("ไม่รู้ภาษาปัจจุบัน → ไม่ลบและไม่ดึง", () => {
    expect(planPageSync([{ url: u("/"), lang: "th" }], null, "", ORIGIN)).toEqual({ remove: [], fetch: [] });
  });
});

describe("planActivation — ย้ายหน้าที่พักไว้ตอน SW ใหม่ activate", () => {
  it("ติดตั้งครั้งแรก: cache หน้าว่าง → ย้ายทุกหน้าที่พักไว้ ใช้ภาษาของหน้าที่พัก", () => {
    const staged = ALL_TABS.map((url) => ({ url, lang: "en" }));
    expect(planActivation([], staged, ORIGIN)).toEqual({ lang: "en", promote: ALL_TABS, refetch: [] });
  });

  it("อัปเดต: ย้ายหน้าที่พักไว้แทนของเดิม · หน้าที่ดึงไม่สำเร็จตอน install อยู่ใน refetch (คงสำเนาเดิมไว้ก่อน)", () => {
    const current = [...ALL_TABS, u("/styleguide")].map((url) => ({ url, lang: "th" }));
    const staged = [u("/"), u("/history"), u("/me"), u("/welcome"), u("/styleguide")].map((url) => ({ url, lang: "th" }));
    const plan = planActivation(current, staged, ORIGIN);
    expect(plan.lang).toBe("th");
    expect(plan.promote).toEqual([u("/"), u("/history"), u("/me"), u("/welcome"), u("/styleguide")]);
    expect(plan.refetch).toEqual([u("/progress"), ...R3]);
  });

  it("ผู้ใช้เปลี่ยนภาษาหลัง SW ใหม่ install (ระหว่างรอ) → ยึดภาษาของ cache ปัจจุบัน ไม่ย้ายหน้าภาษาเก่าที่พักไว้", () => {
    const current = ALL_TABS.map((url) => ({ url, lang: "en" }));
    const staged = ALL_TABS.map((url) => ({ url, lang: "th" }));
    const plan = planActivation(current, staged, ORIGIN);
    expect(plan).toEqual({ lang: "en", promote: [], refetch: ALL_TABS });
  });

  it("ไม่มีอะไรพักไว้ (install ออฟไลน์ หรือออกจากระบบระหว่างรอ) → ไม่ย้าย และลองดึงทุกแท็บ", () => {
    const plan = planActivation([], [], ORIGIN);
    expect(plan).toEqual({ lang: null, promote: [], refetch: ALL_TABS });
  });

  it("langOfPages: ใช้ภาษาของ / ก่อน", () => {
    expect(
      langOfPages(
        [
          { url: u("/me"), lang: "th" },
          { url: u("/"), lang: "en" },
        ],
        ORIGIN,
      ),
    ).toBe("en");
    expect(langOfPages([{ url: u("/me"), lang: "th" }], ORIGIN)).toBe("th");
    expect(langOfPages([{ url: u("/"), lang: null }], ORIGIN)).toBeNull();
  });
});

describe("ADR 0006 เทสต์ 6 — ถอยตอนออฟไลน์ และไม่เก็บ URL ที่มี query", () => {
  it("ลำดับถอย: (สำเนาของ URL) → / → /welcome → (503)", () => {
    expect(OFFLINE_FALLBACK_PATHS).toEqual(["/", "/welcome"]);
    expect(OFFLINE_FALLBACK_PATHS[0]).toBe(APP_SHELL_PATH);
    // ทุกหน้าที่ใช้ถอยต้องถูกดึงไว้ตั้งแต่ติดตั้ง
    for (const p of OFFLINE_FALLBACK_PATHS) expect(OFFLINE_PAGES).toContain(p);
  });

  it.each([
    ["/", true],
    ["/welcome", true],
    ["/history", true],
    ["/welcome#invite=ABCD-1234", true], // fragment ไม่ไปเซิร์ฟเวอร์ และถูกตัดออกจาก key
    ["/welcome?error=access_denied", false],
    ["/?utm=x", false],
    ["/me?", true], // URL มาตรฐาน: ? เปล่า → search = ""
    ["/api/me", false],
    ["https://evil.example/", false],
    ["not a url", false],
  ])("isStorablePageUrl(%s) = %s", (path, expected) => {
    expect(isStorablePageUrl(path.startsWith("/") ? u(path) : path, ORIGIN)).toBe(expected);
  });

  it("key ของ cache ไม่มี fragment — โค้ดเชิญใน #invite= ไม่ลงเครื่อง", () => {
    expect(pageCacheKey(u("/welcome#invite=ABCD-1234"))).toBe(u("/welcome"));
    expect(pageCacheKey(u("/history"))).toBe(u("/history"));
    expect(pageCacheKey("not a url")).toBe("not a url");
  });

  it("key ที่มี ? หรือ # (จากรุ่นก่อน) ถูกลบตอน activate · key ปกติคงไว้", () => {
    const keys = [u("/"), u("/welcome?error=x"), u("/welcome"), u("/styleguide#a"), "https://evil.example/x"];
    expect(unstorablePageKeys(keys, ORIGIN)).toEqual([u("/welcome?error=x"), u("/styleguide#a"), "https://evil.example/x"]);
  });

  it("activate ไม่ดึง URL ที่มี query ซ้ำ", () => {
    const plan = planActivation([{ url: u("/welcome?error=x"), lang: "th" }], [], ORIGIN);
    expect(plan.refetch).not.toContain(u("/welcome?error=x"));
    expect(plan.refetch).toEqual(ALL_TABS);
  });

  it("หลังออกจากระบบ (cache มีแค่ /welcome) → ลองเติมแท็บที่ขาด (เซิร์ฟเวอร์ redirect จึงไม่ถูกเก็บ — ดู page-fetch.test)", () => {
    const plan = planPageSync([{ url: u("/welcome"), lang: "th" }], "th", u("/welcome"), ORIGIN);
    expect(plan).toEqual({ remove: [], fetch: [u("/"), u("/history"), u("/progress"), u("/me"), ...R3] });
  });
});

describe("R1.5 เกณฑ์ 9 — หน้าแอดมิน (/admin/**) ไม่ลงเครื่อง", () => {
  it.each([
    ["/admin", false],
    ["/admin/", false],
    ["/admin/invites", false],
    ["/admin/invites/new", false],
    ["/admin#top", false],
    ["/Admin", false], // ตัดสิน: ไม่สนตัวพิมพ์ — กันไว้ก่อน แม้ route ของ Next.js จะแยกตัวพิมพ์
    ["/ADMIN/invites", false],
    ["/%61dmin", false], // ตัดสิน: ถอด percent-encoding ก่อนเทียบ
    ["/admin%2Finvites", false],
    ["/administrator", true], // คนละ path — ไม่ใช่ /admin
    ["/adminx", true],
    ["/admins/x", true],
    ["/me/admin", true], // /admin ต้องอยู่ต้น path เท่านั้น
    ["/admin/../me", true], // URL ถูกทำให้เป็น /me ก่อน
  ])("isStorablePageUrl(%s) = %s", (path, expected) => {
    expect(isStorablePageUrl(u(path), ORIGIN)).toBe(expected);
  });

  it("isAdminPath: /admin และทุกอย่างใต้ /admin/ เท่านั้น", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/invites")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/adminx")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/%E0%A4%A")).toBe(false); // percent-encoding เสีย → ไม่ throw
  });

  it("SW อัปเดต: หน้าแอดมินที่ค้างใน cache ไม่ถูกดึงซ้ำ (pagesToStage)", () => {
    const staged = pagesToStage([u("/admin"), u("/admin/invites"), u("/administrator")], ORIGIN);
    expect(staged).toEqual([...ALL_TABS, u("/administrator")]);
  });

  it("activate: key แอดมินที่ค้างจากรุ่นก่อนถูกลบ และไม่ถูกย้าย/ดึงซ้ำ", () => {
    const keys = [u("/"), u("/admin"), u("/admin/invites"), u("/me")];
    expect(unstorablePageKeys(keys, ORIGIN)).toEqual([u("/admin"), u("/admin/invites")]);
    const plan = planActivation(
      [u("/admin"), ...ALL_TABS].map((url) => ({ url, lang: "th" })),
      [u("/admin/invites"), ...ALL_TABS].map((url) => ({ url, lang: "th" })),
      ORIGIN,
    );
    expect([...plan.promote, ...plan.refetch].filter((x) => new URL(x).pathname.startsWith("/admin"))).toEqual([]);
  });

  it("เปลี่ยนภาษา: หน้าแอดมินที่ค้างถูกลบ และไม่อยู่ในรายการดึงใหม่", () => {
    const entries = [u("/admin"), ...ALL_TABS].map((url) => ({ url, lang: "th" }));
    const plan = planPageSync(entries, "en", "", ORIGIN);
    expect(plan.remove).toContain(u("/admin"));
    expect(plan.fetch).not.toContain(u("/admin"));
  });

  it("หน้าที่ดึงตั้งแต่ติดตั้งและหน้าถอยตอนออฟไลน์ไม่มีหน้าแอดมิน", () => {
    for (const p of [...OFFLINE_PAGES, ...OFFLINE_FALLBACK_PATHS]) expect(isAdminPath(p)).toBe(false);
  });
});
