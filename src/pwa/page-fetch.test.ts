import { describe, expect, it } from "vitest";
import { createPageFetcher, offlineFallback, type FetchLike } from "./page-fetch";
import { LOCALE_HEADER, offlinePageUrls } from "./strategy";

const ORIGIN = "https://fatcat.example";
const u = (p: string) => `${ORIGIN}${p}`;

const html = (lang: string, marker: string) => `<!DOCTYPE html><html lang="${lang}"><body>${marker}</body></html>`;

/** cache ปลอม: เก็บ key → body */
function fakeCache() {
  const store = new Map<string, { body: string; lang: string | null }>();
  return {
    store,
    put: async (key: RequestInfo | URL, res: Response) => {
      const url = typeof key === "string" ? key : key instanceof URL ? key.href : key.url;
      store.set(url, { body: await res.text(), lang: res.headers.get(LOCALE_HEADER) || null });
    },
  };
}

/**
 * เซิร์ฟเวอร์ปลอมตาม ADR 0006 ข้อ 2: layout ของ (app)/(setup) redirect เมื่อไม่มี cookie · /welcome ไม่ redirect
 * loggedIn = มี cookie session ไหม (ตอนที่คำขอถึงเซิร์ฟเวอร์)
 */
function fakeServer(state: { loggedIn: boolean }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path === "/welcome") return new Response(html("th", "WELCOME"), { status: 200, headers: { "Content-Type": "text/html" } });
    if (!state.loggedIn) return new Response(null, { status: 307, headers: { Location: "/welcome" } });
    return new Response(html("th", `APP ${path}`), { status: 200, headers: { "Content-Type": "text/html" } });
  };
  return { fetch, calls };
}

/** fetch ที่ค้างจนกว่าจะสั่งปล่อย — จำลองคำขอที่ส่งไปก่อนออกจากระบบแล้วตอบกลับทีหลัง */
function deferredFetch(state: { loggedIn: boolean }) {
  const server = fakeServer(state);
  const pending: (() => void)[] = [];
  const fetch: FetchLike = (url, init) => {
    const snapshot = { loggedIn: state.loggedIn }; // cookie ที่ติดไปกับคำขอ ณ ตอนส่ง
    return new Promise((resolve) => {
      pending.push(() => resolve(fakeServer(snapshot).fetch(url, init)));
    });
  };
  return { fetch, calls: server.calls, release: () => pending.splice(0).forEach((r) => r()) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("fetchPage — redirect: manual (ADR 0006 ข้อ 4)", () => {
  it("ส่ง credentials same-origin + redirect manual + no-store", async () => {
    const server = fakeServer({ loggedIn: true });
    const f = createPageFetcher({ fetch: server.fetch, origin: ORIGIN, timeoutMs: 1000 });
    await f.fetchPage(u("/history"));
    expect(server.calls[0].init).toMatchObject({ credentials: "same-origin", redirect: "manual", cache: "no-store" });
  });

  it("redirect (307 หรือ opaqueredirect) ไม่ถูกเก็บ", async () => {
    const opaque = { status: 0, type: "opaqueredirect", redirected: false } as unknown as Response;
    const f1 = createPageFetcher({ fetch: async () => opaque, origin: ORIGIN, timeoutMs: 1000 });
    expect(await f1.fetchPage(u("/"))).toBeNull();
    const f2 = createPageFetcher({ fetch: fakeServer({ loggedIn: false }).fetch, origin: ORIGIN, timeoutMs: 1000 });
    expect(await f2.fetchPage(u("/"))).toBeNull();
  });

  it("เครือข่ายล้ม / หมดเวลา → null ไม่โยน", async () => {
    const f1 = createPageFetcher({ fetch: async () => Promise.reject(new TypeError("offline")), origin: ORIGIN, timeoutMs: 1000 });
    expect(await f1.fetchPage(u("/"))).toBeNull();
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const f2 = createPageFetcher({ fetch: hang, origin: ORIGIN, timeoutMs: 10 });
    expect(await f2.fetchPage(u("/"))).toBeNull();
  });

  it("ดึงด้วย URL ไม่มี fragment (โค้ดเชิญไม่ออกจากเครื่อง)", async () => {
    const server = fakeServer({ loggedIn: false });
    const f = createPageFetcher({ fetch: server.fetch, origin: ORIGIN, timeoutMs: 1000 });
    await f.fetchPage(u("/welcome#invite=ABCD-1234"));
    expect(server.calls[0].url).toBe(u("/welcome"));
  });
});

describe("refreshInto — สิ่งที่ถูกเก็บ", () => {
  it("ไม่ล็อกอิน: ดึงทุกหน้าใน OFFLINE_PAGES แต่เก็บได้แค่ /welcome", async () => {
    const cache = fakeCache();
    const f = createPageFetcher({ fetch: fakeServer({ loggedIn: false }).fetch, origin: ORIGIN, timeoutMs: 1000 });
    const stored = await f.refreshInto(cache, offlinePageUrls(ORIGIN));
    expect(stored).toEqual([u("/welcome")]);
    expect([...cache.store.keys()]).toEqual([u("/welcome")]);
    expect(cache.store.get(u("/welcome"))?.lang).toBe("th");
  });

  it("ล็อกอิน: เก็บครบทุกหน้า", async () => {
    const cache = fakeCache();
    const f = createPageFetcher({ fetch: fakeServer({ loggedIn: true }).fetch, origin: ORIGIN, timeoutMs: 1000 });
    await f.refreshInto(cache, offlinePageUrls(ORIGIN));
    expect([...cache.store.keys()].sort()).toEqual(offlinePageUrls(ORIGIN).sort());
  });

  it("ไม่เก็บ URL ที่มี query และไม่ดึงด้วย", async () => {
    const cache = fakeCache();
    const server = fakeServer({ loggedIn: false });
    const f = createPageFetcher({ fetch: server.fetch, origin: ORIGIN, timeoutMs: 1000 });
    await f.refreshInto(cache, [u("/welcome?error=access_denied"), u("/api/me")]);
    expect(cache.store.size).toBe(0);
    expect(server.calls).toHaveLength(0);
  });

  it("ภาษาไม่ตรงที่ขอ → ไม่เก็บ", async () => {
    const cache = fakeCache();
    const f = createPageFetcher({ fetch: fakeServer({ loggedIn: false }).fetch, origin: ORIGIN, timeoutMs: 1000 });
    await f.refreshInto(cache, [u("/welcome")], "en");
    await f.refreshInto(cache, [u("/welcome")], null);
    expect(cache.store.size).toBe(0);
  });
});

describe("หลังออกจากระบบ หน้าที่เติมกลับเป็นแบบไม่ล็อกอินเท่านั้น (contract แถว pwa-offline)", () => {
  it("การดึงที่ส่งไปก่อนออกจากระบบ (cookie เดิม) แล้วตอบหลัง reset → ไม่ถูกเขียนลง cache", async () => {
    const state = { loggedIn: true };
    const net = deferredFetch(state);
    const f = createPageFetcher({ fetch: net.fetch, origin: ORIGIN, timeoutMs: 5000 });
    const cache = fakeCache();
    const before = f.refreshInto(cache, offlinePageUrls(ORIGIN), "th"); // เช่น เติมแท็บตอนเปลี่ยนภาษา
    await tick();
    // ผู้ใช้ออกจากระบบ: cookie หาย + หน้าเว็บส่ง USER_RESET
    state.loggedIn = false;
    f.reset();
    net.release(); // คำตอบของคำขอเดิม (หน้าแอปแบบล็อกอิน) มาถึงทีหลัง
    await before;
    expect(cache.store.size).toBe(0);
  });

  it("คำขอหลัง reset ไม่ใช้ผลของคำขอเดิมที่ยังค้าง (ไม่แชร์ inflight ข้ามรอบ)", async () => {
    const state = { loggedIn: true };
    const net = deferredFetch(state);
    const f = createPageFetcher({ fetch: net.fetch, origin: ORIGIN, timeoutMs: 5000 });
    const old = f.fetchPage(u("/history"));
    await tick();
    state.loggedIn = false;
    f.reset();
    const cache = fakeCache();
    const after = f.refreshInto(cache, offlinePageUrls(ORIGIN), "th");
    await tick();
    net.release();
    await tick();
    net.release();
    await Promise.all([old, after]);
    // ทุกหน้าที่เก็บหลังออกจากระบบ = หน้าที่ได้ตอนไม่มี cookie
    expect([...cache.store.keys()]).toEqual([u("/welcome")]);
    for (const { body } of cache.store.values()) expect(body).not.toContain("APP");
  });

  it("epoch เพิ่มทุกครั้งที่ reset (ใช้กับ navigation ที่ Serwist เก็บเอง)", () => {
    const f = createPageFetcher({ fetch: fakeServer({ loggedIn: false }).fetch, origin: ORIGIN, timeoutMs: 1000 });
    const e0 = f.epoch();
    f.reset();
    expect(f.epoch()).toBe(e0 + 1);
  });
});

describe("offlineFallback — / → /welcome → 503 (ADR 0006 เทสต์ 6)", () => {
  const page = (body: string) => new Response(body, { status: 200 });
  const matcher = (have: Record<string, string>) => async (url: string) => (have[url] ? page(have[url]) : undefined);

  it("ล็อกอินอยู่ (มี /) → /", async () => {
    const res = await offlineFallback(matcher({ [u("/")]: "APP", [u("/welcome")]: "WELCOME" }), ORIGIN);
    expect(await res.text()).toBe("APP");
  });

  it("ไม่ล็อกอิน/หลังออกจากระบบ (ไม่มี /) → /welcome", async () => {
    const res = await offlineFallback(matcher({ [u("/welcome")]: "WELCOME" }), ORIGIN);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("WELCOME");
  });

  it("ไม่มีอะไรเลย → 503 Offline no-store", async () => {
    const res = await offlineFallback(matcher({}), ORIGIN);
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("Offline");
  });
});
