import { describe, expect, it } from "vitest";
import {
  CACHE_NAMES,
  classifyRequest,
  extractHtmlLang,
  pagesInOtherLocale,
  isApiPath,
  isCacheableResponse,
  isOutdatedRuntimeCache,
  isUserScopedCache,
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
