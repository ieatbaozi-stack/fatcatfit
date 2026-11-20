import { createHash, randomUUID } from "node:crypto";
import type { APIRequestContext, Browser, BrowserContext, Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { TOKENS, msg, waitForServiceWorker } from "./helpers";
import { applySession, randomIp, residue, signUp, sql, userIdOf, uniqueEmail, waitForOtp, type TestUser } from "./support/auth";

// R1.5 (R1_5_ADMIN_INVITES_CONTRACT.md · ADR 0007 · UX ข้อ 11) — qa-test
// แอดมินในเทสต์ได้สิทธิ์ด้วย INSERT ตรงในฐานทดสอบ (ทางเดียวกับขั้นตอน SQL ใน OPERATIONS) ไม่ผ่านแอป
// ทุกเทสต์สร้างผู้ใช้/แอดมินของตัวเอง (throttle 20/วัน เป็นต่อแอดมิน → ไม่ชนกันข้ามเทสต์)

test.use({ auth: "none", timezoneId: "Asia/Bangkok" });

const TZ = "Asia/Bangkok";
const PAGE = "/admin/invites";
const NOT_FOUND_BODY = '{"code":"not_found"}';
const M = (key: string, locale: "th" | "en" = "th") => msg(locale, key);
const A = (key: string, locale: "th" | "en" = "th") => msg(locale, `admin.invites.${key}`);
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));

async function makeAdmin(email: string): Promise<string> {
  const id = await userIdOf(email);
  if (!id) throw new Error(`no user ${email}`);
  await sql(`insert into app_admin (user_id, created_at) values ($1, now()) on conflict (user_id) do nothing`, [id]);
  return id;
}

async function newAdmin(baseURL: string, locale: "th" | "en" = "th"): Promise<TestUser & { id: string }> {
  const u = await signUp(baseURL, { stage: "ready", locale });
  return { ...u, id: await makeAdmin(u.email) };
}

/** ข้อความวันเวลาแบบเดียวกับที่ UX 11.4 กำหนด (ตรวจผลของหน้า ไม่ import โค้ดแอป) */
function expectedDate(iso: string, locale: "th" | "en"): string {
  const d = new Date(iso);
  const sameYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: TZ }).format(d) === new Intl.DateTimeFormat("en", { year: "numeric", timeZone: TZ }).format(new Date());
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH-u-ca-gregory" : "en", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  }).format(d);
}

function recordRequests(context: BrowserContext): string[] {
  const urls: string[] = [];
  context.on("request", (r: Request) => urls.push(r.url()));
  return urls;
}

/** mock Web Share + Clipboard ก่อนหน้าโหลด · mode: resolve / abort / fail / none (ไม่มี navigator.share) */
async function mockShare(context: BrowserContext, mode: "resolve" | "abort" | "fail" | "none") {
  await context.addInitScript((m) => {
    const w = window as unknown as { __shares: unknown[]; __clips: string[] };
    w.__shares = [];
    w.__clips = [];
    if (m === "none") {
      delete (Navigator.prototype as unknown as { share?: unknown }).share;
      delete (Navigator.prototype as unknown as { canShare?: unknown }).canShare;
    } else {
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: (data: unknown) => {
          w.__shares.push(JSON.parse(JSON.stringify(data)));
          if (m === "abort") return Promise.reject(new DOMException("cancelled", "AbortError"));
          if (m === "fail") return Promise.reject(new DOMException("nope", "NotAllowedError"));
          return Promise.resolve();
        },
      });
    }
    const clip = { writeText: (t: string) => (w.__clips.push(t), Promise.resolve()), readText: () => Promise.resolve(w.__clips.at(-1) ?? "") };
    Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, get: () => clip });
  }, mode);
}

const shares = (page: Page) => page.evaluate(() => (window as unknown as { __shares: unknown[] }).__shares);
const clips = (page: Page) => page.evaluate(() => (window as unknown as { __clips: string[] }).__clips);

async function openAdminPage(browser: Browser, baseURL: string, admin: TestUser, opts: { locale?: "th" | "en"; share?: "resolve" | "abort" | "fail" | "none"; colorScheme?: "light" | "dark" } = {}) {
  const context = await browser.newContext({ baseURL, timezoneId: TZ, colorScheme: opts.colorScheme ?? "light", ...(opts.locale === "en" ? { locale: "en-US" } : { locale: "th-TH" }) });
  if (opts.locale === "en") await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL }]);
  await applySession(context, admin);
  if (opts.share) await mockShare(context, opts.share);
  const page = await context.newPage();
  const res = await page.goto(PAGE);
  expect(res?.status(), "admin opens the admin page").toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(A("title", opts.locale));
  return { context, page };
}

/** กรอกฟอร์มแล้วออกโค้ด → คืนโค้ดที่หน้าแสดง */
async function createViaUi(page: Page, label: string, opts: { days?: 1 | 3 | 7 | 14; uses?: number; locale?: "th" | "en" } = {}) {
  const l = opts.locale ?? "th";
  await page.getByLabel(A("form.label", l)).fill(label);
  if (opts.days) await page.getByRole("radio", { name: fill(l === "th" ? A("form.daysOption", l) : `${opts.days} day${opts.days === 1 ? "" : "s"}`, { days: opts.days }) }).click();
  if (opts.uses) await page.getByLabel(A("form.uses", l), { exact: true }).fill(String(opts.uses));
  await page.getByRole("button", { name: A("form.submit", l) }).click();
  await expect(page.getByRole("heading", { name: A("result.title", l) })).toBeVisible();
  const code = (await page.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/).first().textContent())!.trim();
  return code;
}

async function postInvite(api: APIRequestContext, data: unknown) {
  return api.post("/api/admin/invites", { data });
}

// ---------------------------------------------------------------- เกณฑ์ 3
test.describe("เกณฑ์ 3: คนที่ไม่ใช่แอดมินเห็นแต่ 404 (ยิงผ่านเซิร์ฟเวอร์จริง)", () => {
  const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

  async function expectAll404(api: APIRequestContext, baseURL: string, who: string) {
    const paths = ["/api/admin/invites", `/api/admin/invites/${randomUUID()}/revoke`, "/api/admin/invites/not-a-uuid/revoke"];
    for (const p of paths) {
      for (const method of METHODS) {
        // POST/อื่นๆ ใส่ Origin ที่ถูกต้อง เพื่อให้ผ่านด่าน Origin แล้วไปถึง requireAdmin (ไม่มี Origin = 403 ตามเกณฑ์ 10)
        const res = await api.fetch(p, { method, headers: { origin: baseURL }, data: method === "GET" || method === "HEAD" ? undefined : { label: "x", days: 3, maxUses: 1 }, maxRedirects: 0 });
        expect(res.status(), `${who} ${method} ${p}`).toBe(404);
        if (method !== "HEAD") expect(await res.text(), `${who} ${method} ${p} body`).toBe(NOT_FOUND_BODY);
        expect(res.headers()["cache-control"], `${who} ${method} ${p} cache-control`).toContain("no-store");
        expect(res.headers()["allow"], `${who} ${method} ${p} no Allow header`).toBeUndefined();
      }
    }
  }

  test("ไม่มี session · cookie ปลอม · session หมดอายุ · ผู้ใช้ทั่วไป → ทุกเส้นทาง × ทุก method = 404 body เดียวกัน", async ({ playwright, baseURL }) => {
    test.setTimeout(120_000);
    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    await expectAll404(anon, baseURL!, "anon");
    const forged = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie: "better-auth.session_token=forged.value", "x-forwarded-for": randomIp() } });
    await expectAll404(forged, baseURL!, "forged");

    const regular = await signUp(baseURL!, { stage: "ready" });
    await expectAll404(regular.api, baseURL!, "regular");

    // session หมดอายุ: แอดมินจริง แต่ session ในฐานหมดอายุแล้ว → ต้องได้ 404 ไม่ใช่ 401
    const expired = await newAdmin(baseURL!);
    expect((await expired.api.get("/api/admin/invites")).status(), "admin before expiry").toBe(200);
    await sql(`update session set expires_at = now() - interval '1 day' where user_id = $1`, [expired.id]);
    await expectAll404(expired.api, baseURL!, "expired-session admin");

    await anon.dispose();
    await forged.dispose();
    await regular.api.dispose();
    await expired.api.dispose();
  });

  test("ผู้ใช้ทั่วไปเปิด /admin/invites → 404 และหน้าเหมือน path ที่ไม่มีอยู่ · ไม่มี cookie → 307 /welcome", async ({ playwright, baseURL, browser }) => {
    const anon = await playwright.request.newContext({ baseURL });
    for (const p of [PAGE, "/admin"]) {
      const r = await anon.get(p, { maxRedirects: 0 });
      if (p === PAGE) {
        expect(r.status(), `${p} without cookie`).toBe(307);
        expect(new URL(r.headers()["location"], baseURL).pathname).toBe("/welcome");
      } else {
        // /admin ไม่มีหน้า → 404 ของแอป (ไม่ใช่ข้อกำหนด แค่บันทึกพฤติกรรม)
        expect([307, 404]).toContain(r.status());
      }
    }
    await anon.dispose();

    // เกณฑ์ 3 (แก้ตามที่ boss อนุมัติ 2026-11-20): วัดจากสิ่งที่ผู้ใช้เห็น — status 404 · ข้อความเหมือนหน้า 404 ปกติ
    // · ไม่มีแถบล่าง · ไม่มีข้อความของหน้าแอดมิน · no-store — ไม่เทียบ HTML ดิบ (Next 16 ส่ง error shell เมื่อ notFound() ตอน dynamic render)
    const regular = await signUp(baseURL!, { stage: "ready" });
    const admin404 = await regular.api.get(PAGE, { maxRedirects: 0 });
    const missing = await regular.api.get(`/no-such-page-${Date.now().toString(36)}`, { maxRedirects: 0 });
    expect(admin404.status(), "regular user GET /admin/invites").toBe(404);
    expect(missing.status()).toBe(404);
    expect(admin404.headers()["cache-control"], "404 of /admin/invites is no-store").toContain("no-store");

    // ในเบราว์เซอร์ (จอมือถือ · TH/EN · สว่าง/มืด): ข้อความและปุ่มของหน้า 404 เดิม · ไม่มีแถบล่าง · ไม่มีข้อความของหน้าแอดมิน
    for (const [locale, colorScheme] of [
      ["th", "light"],
      ["en", "dark"],
    ] as const) {
      const ctx = await browser.newContext({ baseURL, colorScheme, viewport: { width: 375, height: 812 }, locale: locale === "en" ? "en-US" : "th-TH" });
      if (locale === "en") await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
      await applySession(ctx, regular);
      const page = await ctx.newPage();
      const res = await page.goto(PAGE);
      expect(res?.status(), `${locale} browser status`).toBe(404);
      expect(res?.headers()["cache-control"], `${locale} browser no-store`).toContain("no-store");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(M("notFound.text", locale));
      // รอให้ AuthGate ตอบ /api/me แล้ว (ถ้าจะมีอะไรของแอดมินโผล่ ต้องโผล่หลังจุดนี้)
      await page.waitForLoadState("networkidle");
      for (const key of ["title", "form.submit", "list.title", "back"]) await expect(page.getByText(A(key, locale), { exact: true }), `no admin text "${key}"`).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: M("nav.label", locale) }), "404 of /admin/invites has no bottom tabs").toHaveCount(0);
      const textAdmin = await page.locator("body").innerText();
      const title = await page.title();
      const linksAdmin = await page.getByRole("link").evaluateAll((ls) => ls.map((l) => `${l.textContent?.trim()}->${l.getAttribute("href")}`));
      const r2 = await page.goto(`/no-such-page-${Date.now().toString(36)}`);
      expect(r2?.status()).toBe(404);
      await page.waitForLoadState("networkidle");
      expect(textAdmin, `${locale}: visible text of /admin/invites 404 == missing-path 404`).toBe(await page.locator("body").innerText());
      expect(title, `${locale}: <title> same`).toBe(await page.title());
      expect(linksAdmin, `${locale}: same links/buttons`).toEqual(await page.getByRole("link").evaluateAll((ls) => ls.map((l) => `${l.textContent?.trim()}->${l.getAttribute("href")}`)));
      await expect(page.getByRole("navigation", { name: M("nav.label", locale) }), "app 404 has no bottom tabs either").toHaveCount(0);
      await ctx.close();
    }
    await regular.api.dispose();
  });
});

// ---------------------------------------------------------------- เกณฑ์ 4
test("เกณฑ์ 4: ลบแถว app_admin กลางทาง → คำขอถัดไป 404 ทันที · หน้า reload แล้วเป็น 404", async ({ browser, baseURL }) => {
  const admin = await newAdmin(baseURL!);
  const { context, page } = await openAdminPage(browser, baseURL!, admin);
  expect((await admin.api.get("/api/admin/invites")).status()).toBe(200);
  await sql(`delete from app_admin where user_id = $1`, [admin.id]);
  const after = await admin.api.get("/api/admin/invites");
  expect(after.status()).toBe(404);
  expect(await after.text()).toBe(NOT_FOUND_BODY);
  // หน้าที่เปิดค้างอยู่: กดออกโค้ด → API 404 → หน้า reload → เซิร์ฟเวอร์ตอบหน้า 404
  await page.getByLabel(A("form.label")).fill("หลังถอนสิทธิ์");
  const nav = page.waitForResponse((r) => new URL(r.url()).pathname === PAGE && r.request().isNavigationRequest());
  await page.getByRole("button", { name: A("form.submit") }).click();
  expect((await nav).status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(M("notFound.text"));
  expect(await sql(`select 1 from invite_code where label = $1`, ["หลังถอนสิทธิ์"])).toHaveLength(0);
  await context.close();
  await admin.api.dispose();
});

// ---------------------------------------------------------------- เกณฑ์ 5 + 7
test.describe("เกณฑ์ 5 + 7: ออกโค้ดจากหน้า → เพื่อนเปิดลิงก์ในบริบทใหม่ → สมัครด้วย OTP สำเร็จ · โค้ดแสดงครั้งเดียว", () => {
  test("ทางหลักครบเส้น", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { share: "none" });
    const adminUrls = recordRequests(context);
    const label = `ฟ้า-${Date.now().toString(36)}`;
    const code = await createViaUi(page, label, { days: 7, uses: 2 });
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const link = `${new URL(baseURL!).origin}/welcome#invite=${code}`;
    await expect(page.getByText(link, { exact: true })).toBeVisible();

    // ฐานข้อมูลมีแค่ hash: ไม่มีคอลัมน์ใดเก็บโค้ดดิบ (รูปมีขีด/ไม่มีขีด) · ค่าที่ตั้งตรง
    const rows = await sql<Record<string, unknown>>(`select * from invite_code where label = $1`, [label]);
    expect(rows).toHaveLength(1);
    const raw = code.replace("-", "");
    const dump = JSON.stringify(rows[0]).toUpperCase();
    expect(dump).not.toContain(code);
    expect(dump).not.toContain(raw);
    expect(rows[0].max_uses).toBe(2);
    expect(rows[0].uses_count).toBe(0);
    const days = (new Date(String(rows[0].expires_at)).getTime() - new Date(String(rows[0].created_at)).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 3);

    // เกณฑ์ 7: GET ไม่มีโค้ด/hash
    const list = await admin.api.get("/api/admin/invites");
    const listText = await list.text();
    expect(listText.toUpperCase()).not.toContain(raw);
    expect(listText).not.toContain(String(rows[0].code_hash));
    expect(listText).not.toMatch(/code_?hash|"code"/i);

    // เกณฑ์ 7: ไม่มีโค้ดใน localStorage / sessionStorage / IndexedDB / Cache Storage
    const stores = await page.evaluate(async () => {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) out.push(`ls:${localStorage.key(i)}=${localStorage.getItem(localStorage.key(i)!)}`);
      for (let i = 0; i < sessionStorage.length; i++) out.push(`ss:${sessionStorage.key(i)}=${sessionStorage.getItem(sessionStorage.key(i)!)}`);
      for (const info of await indexedDB.databases()) {
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const r = indexedDB.open(info.name!);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        for (const store of Array.from(db.objectStoreNames)) {
          const all = await new Promise<unknown[]>((res) => {
            const q = db.transaction(store).objectStore(store).getAll();
            q.onsuccess = () => res(q.result);
            q.onerror = () => res([]);
          });
          out.push(`idb:${info.name}/${store}=${JSON.stringify(all)}`);
        }
        db.close();
      }
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        for (const req of await c.keys()) {
          const r = await c.match(req);
          const type = r?.headers.get("content-type") ?? "";
          out.push(`cache:${name}:${req.url}=${/text|json|javascript/.test(type) ? await r!.text() : ""}`);
        }
      }
      return out.join("\n");
    });
    expect(stores.toUpperCase()).not.toContain(code);
    expect(stores.toUpperCase()).not.toContain(raw);

    // เกณฑ์ 7: โหลดหน้าใหม่แล้วไม่เห็นโค้ด (รายการยังมีป้าย)
    await page.reload();
    await expect(page.getByText(label)).toBeVisible();
    await expect(page.getByText(code)).toHaveCount(0);
    expect((await page.content()).toUpperCase()).not.toContain(code);

    // เพื่อนใหม่: บริบทใหม่ (คนละเครื่อง) เปิดลิงก์ → ช่องถูกเติม → OTP → ยินยอม → แบบสอบถาม → หน้าหลัก
    const friendCtx = await browser.newContext({ baseURL, timezoneId: TZ });
    await friendCtx.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    const friendUrls = recordRequests(friendCtx);
    const friend = await friendCtx.newPage();
    await friend.goto(link);
    await expect(friend.getByLabel(M("welcome.invite.label"))).toHaveValue(code);
    await expect.poll(() => friend.evaluate(() => location.hash)).toBe("");
    const email = uniqueEmail("friend");
    await friend.getByRole("button", { name: M("welcome.useEmail") }).click();
    await friend.getByLabel(M("welcome.email.label")).fill(email);
    const since = Date.now();
    await friend.getByRole("button", { name: M("welcome.email.send") }).click();
    const { otp } = await waitForOtp(email, since);
    await friend.getByLabel(M("otp.label")).fill(otp);
    await expect(friend).toHaveURL(/\/consent$/, { timeout: 15_000 });
    await friend.getByText(M("consent.ageCheckbox")).click();
    await friend.getByText(M("consent.checkbox")).click();
    await friend.getByRole("button", { name: M("consent.agree") }).click();
    await expect(friend).toHaveURL(/\/onboarding$/);
    await friend.getByLabel(M("onboarding.step1.weight"), { exact: true }).fill("70");
    await friend.getByLabel(M("onboarding.step1.height"), { exact: true }).fill("170");
    await friend.getByLabel(M("onboarding.step1.birthYear"), { exact: true }).fill("1995");
    await friend.getByRole("button", { name: M("onboarding.next") }).click();
    await friend.getByRole("button", { name: M("onboarding.place.kinds.home") }).click();
    await friend.getByRole("button", { name: M("onboarding.start") }).click();
    await expect(friend).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(friend.getByRole("heading", { level: 1 })).toHaveText(M("nav.home"));

    // เพื่อนผูกกับโค้ดนี้ · ใช้ไป 1/2 · เพื่อนไม่ใช่แอดมิน
    const fid = (await userIdOf(email))!;
    const link2 = await sql<{ uses_count: number }>(`select uses_count from invite_code where label = $1`, [label]);
    expect(link2[0].uses_count).toBe(1);
    const linked = await sql(`select 1 from "user" u join invite_code i on i.id = u.invite_code_id where u.id = $1 and i.label = $2`, [fid, label]);
    expect(linked).toHaveLength(1);
    expect(await sql(`select 1 from app_admin where user_id = $1`, [fid])).toHaveLength(0);
    // แอดมิน reload → "ใช้ไป 1/2"
    await page.reload();
    const row = page.locator("li", { hasText: label });
    await expect(row).toContainText(fill(A("list.meta"), { used: 1, max: 2, date: expectedDate(String(rows[0].expires_at), "th") }));

    // เกณฑ์ 7: ไม่มีคำขอใด (ทั้งฝั่งแอดมินและเพื่อน) ที่มีโค้ดใน URL
    const leaky = [...adminUrls, ...friendUrls].filter((u) => u.toUpperCase().includes(code) || u.toUpperCase().includes(raw));
    expect(leaky).toEqual([]);
    await friendCtx.close();
    await context.close();
    await admin.api.dispose();
  });

  test("ออกจากหน้าแล้วกด Back (ทั้ง client nav และโหลดเต็มหน้า/bfcache) → ไม่เห็นโค้ดเดิม", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { share: "none" });
    const code = await createViaUi(page, `back-${Date.now().toString(36)}`);
    // ‹ กลับไปหน้า "ฉัน" (client navigation) → Back
    await page.getByRole("link", { name: A("back") }).click();
    await expect(page).toHaveURL(/\/me$/);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(A("title"));
    await expect(page.getByText(code, { exact: true })).toHaveCount(0);
    // ออกโค้ดใหม่ → ไปหน้าอื่นแบบโหลดเต็มหน้า → Back (เบราว์เซอร์อาจคืนหน้าจาก bfcache)
    const code2 = await createViaUi(page, `back2-${Date.now().toString(36)}`);
    await page.goto("/privacy");
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(A("title"));
    await expect(page.getByText(code2, { exact: true })).toHaveCount(0);
    expect((await page.content()).toUpperCase()).not.toContain(code2);
    await context.close();
    await admin.api.dispose();
  });

  test("กดออกโค้ดซ้ำเร็วๆ (double-click + Enter) → เกิดโค้ดเดียว", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin);
    const label = `ซ้ำ-${Date.now().toString(36)}`;
    await page.getByLabel(A("form.label")).fill(label);
    // ทำให้คำขอช้าลง เพื่อให้คลิกครั้งที่ 2-3 เกิดระหว่างรอ
    await context.route("**/api/admin/invites", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    const btn = page.getByRole("button", { name: A("form.submit") });
    await btn.dblclick();
    await page.keyboard.press("Enter").catch(() => {});
    await expect(page.getByRole("heading", { name: A("result.title") })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await sql(`select 1 from invite_code where label = $1`, [label])).toHaveLength(1);
    await context.close();
    await admin.api.dispose();
  });
});

// ---------------------------------------------------------------- เกณฑ์ 6
test.describe("เกณฑ์ 6: input นอก D3 → 400 · ครั้งที่ 21 → 429 + หน้าบอกรอ", () => {
  test("input ผิด → 400 invalid_input (API จริง) · ป้ายว่างในหน้า = ปุ่มปิด", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const bad: unknown[] = [
      { label: "a", days: 2, maxUses: 1 },
      { label: "a", days: 0, maxUses: 1 },
      { label: "a", days: 30, maxUses: 1 },
      { label: "a", days: 3, maxUses: 0 },
      { label: "a", days: 3, maxUses: 11 },
      { label: "a", days: 3, maxUses: -1 },
      { label: "a", days: 3, maxUses: 1.5 },
      { label: "", days: 3, maxUses: 1 },
      { label: "   ", days: 3, maxUses: 1 },
      { label: "x".repeat(41), days: 3, maxUses: 1 },
      { label: "a", days: "3", maxUses: 1 },
      { label: "a", days: 3, maxUses: 1, extra: true },
    ];
    for (const data of bad) {
      const r = await postInvite(admin.api, data);
      expect(r.status(), JSON.stringify(data)).toBe(400);
      expect(await r.json()).toEqual({ code: "invalid_input" });
    }
    // ขอบที่ถูก: ป้าย 40 ตัวไทย (นับเป็นอักขระ) · 14 วัน · 10 คน
    const ok = await postInvite(admin.api, { label: "ก".repeat(40), days: 14, maxUses: 10 });
    expect(ok.status()).toBe(201);
    expect(ok.headers()["cache-control"]).toContain("no-store");
    expect(Object.keys(await ok.json()).sort()).toEqual(["code", "expiresAt", "id", "label", "maxUses"]);

    const { context, page } = await openAdminPage(browser, baseURL!, admin);
    const submit = page.getByRole("button", { name: A("form.submit") });
    await expect(submit).toBeDisabled();
    await page.getByLabel(A("form.label")).fill("    ");
    await expect(submit).toBeDisabled();
    await page.getByLabel(A("form.label")).fill("x".repeat(60));
    await expect(page.getByLabel(A("form.label"))).toHaveValue("x".repeat(40)); // maxlength=40
    await expect(page.getByText("40/40")).toBeVisible();
    // จำนวนคนนอกช่วง → ถูกดึงเข้าช่วงตอนออกจากช่อง
    const uses = page.getByLabel(A("form.uses"), { exact: true });
    await uses.fill("99");
    await uses.blur();
    await expect(uses).toHaveValue("10");
    await uses.fill("-3");
    await uses.blur();
    await expect(uses).toHaveValue("1");
    await context.close();
    await admin.api.dispose();
  });

  test("ออกครบ 20 ใน 24 ชม. → ครั้งที่ 21 ได้ 429 + X-Retry-After · หน้าบอก \"รอ\" และปุ่มปิด", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const admin = await newAdmin(baseURL!);
    for (let i = 1; i <= 20; i++) {
      const r = await postInvite(admin.api, { label: `rl-${i}`, days: 1, maxUses: 1 });
      expect(r.status(), `create #${i}`).toBe(201);
    }
    const r21 = await postInvite(admin.api, { label: "rl-21", days: 1, maxUses: 1 });
    expect(r21.status()).toBe(429);
    const retry = Number(r21.headers()["x-retry-after"]);
    expect(retry).toBeGreaterThan(86_000);
    expect(retry).toBeLessThanOrEqual(86_400);
    expect(r21.headers()["cache-control"]).toContain("no-store");

    const { context, page } = await openAdminPage(browser, baseURL!, admin);
    await page.getByLabel(A("form.label")).fill("ครั้งที่ 22");
    await page.getByRole("button", { name: A("form.submit") }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText(A("form.rateLimited").split("{time}")[0].trim());
    await expect(alert).toContainText(/\d+ ชม\. \d+ นาที/);
    await expect(page.getByRole("button", { name: A("form.submit") })).toBeDisabled();
    await expect(page.getByLabel(A("form.label"))).toHaveValue("ครั้งที่ 22"); // ที่กรอกไม่หาย
    expect(await sql(`select 1 from invite_code where label in ('rl-21','ครั้งที่ 22')`)).toHaveLength(0);
    await context.close();
    await admin.api.dispose();
  });
});

// ---------------------------------------------------------------- เกณฑ์ 8
test("เกณฑ์ 8: เพิกถอนต้องยืนยัน · หลังเพิกถอน /api/invite/check = invalid · ซ้ำ = unchanged · สถานะ 4 แบบ + x/y + วันหมดอายุ", async ({ browser, baseURL, playwright }) => {
  test.setTimeout(90_000);
  const admin = await newAdmin(baseURL!);
  const tag = Date.now().toString(36);
  const mk = async (label: string, days: number, maxUses: number) => {
    const r = await postInvite(admin.api, { label, days, maxUses });
    expect(r.status()).toBe(201);
    return (await r.json()) as { id: string; code: string; expiresAt: string };
  };
  const act = await mk(`active-${tag}`, 3, 3);
  const exh = await mk(`exhausted-${tag}`, 7, 2);
  const exp = await mk(`expired-${tag}`, 1, 4);
  const rev = await mk(`revoked-${tag}`, 14, 1);
  const target = await mk(`target-${tag}`, 1, 1);
  // สร้างสถานะในฐานทดสอบ: ใช้ครบ · หมดอายุ · ใช้ไป 1 ของ active
  await sql(`update invite_code set uses_count = max_uses where id = $1`, [exh.id]);
  await sql(`update invite_code set uses_count = 1 where id = $1`, [act.id]);
  await sql(`update invite_code set expires_at = now() - interval '1 hour', uses_count = 2 where id = $1`, [exp.id]);
  expect((await (await admin.api.post(`/api/admin/invites/${rev.id}/revoke`)).json())).toEqual({ result: "revoked" });
  const db = await sql<{ id: string; expires_at: string }>(`select id, expires_at from invite_code where id = any($1::uuid[])`, [[act.id, exh.id, exp.id, rev.id]]);
  const expOf = (id: string) => String(db.find((d) => d.id === id)!.expires_at);

  const { context, page } = await openAdminPage(browser, baseURL!, admin);
  const row = (label: string) => page.locator("li", { hasText: label });
  const cases = [
    { label: `active-${tag}`, status: "active", used: 1, max: 3, id: act.id, revoke: true },
    { label: `exhausted-${tag}`, status: "exhausted", used: 2, max: 2, id: exh.id, revoke: false },
    { label: `expired-${tag}`, status: "expired", used: 2, max: 4, id: exp.id, revoke: false },
    { label: `revoked-${tag}`, status: "revoked", used: 0, max: 1, id: rev.id, revoke: false },
  ];
  for (const c of cases) {
    await expect(row(c.label)).toContainText(A(`status.${c.status}`));
    await expect(row(c.label)).toContainText(fill(A("list.meta"), { used: c.used, max: c.max, date: expectedDate(expOf(c.id), "th") }));
    await expect(row(c.label).getByRole("button", { name: fill(A("revoke.buttonLabel"), { label: c.label }) })).toHaveCount(c.revoke ? 1 : 0);
  }
  // ใหม่สุดก่อน
  const order = await page.locator("li").filter({ hasText: tag }).allInnerTexts();
  expect(order.map((t) => t.split("\n")[0])).toEqual([`target-${tag}`, `revoked-${tag}`, `expired-${tag}`, `exhausted-${tag}`, `active-${tag}`]);

  // ยืนยันก่อน: ยกเลิก / Esc / แตะพื้นมืด = ไม่มีอะไรเปลี่ยน
  const tLabel = `target-${tag}`;
  const revokeBtn = row(tLabel).getByRole("button", { name: fill(A("revoke.buttonLabel"), { label: tLabel }) });
  await revokeBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(fill(A("revoke.title"), { label: tLabel }));
  await dialog.getByRole("button", { name: A("revoke.cancel") }).click();
  await expect(dialog).toHaveCount(0);
  await revokeBtn.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const check = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL!, "x-forwarded-for": randomIp() } });
  expect(await (await check.post("/api/invite/check", { data: { code: target.code } })).json()).toEqual({ result: "ok" });
  expect((await sql<{ revoked_at: unknown }>(`select revoked_at from invite_code where id = $1`, [target.id]))[0].revoked_at).toBeNull();

  // ยืนยันจริง
  await revokeBtn.click();
  await dialog.getByRole("button", { name: A("revoke.confirm"), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: A("toast.revoked") })).toBeVisible();
  await expect(row(tLabel)).toContainText(A("status.revoked"));
  await expect(row(tLabel).getByRole("button")).toHaveCount(0);
  expect(await (await check.post("/api/invite/check", { data: { code: target.code } })).json()).toEqual({ result: "invalid" });
  // เพิกถอนซ้ำ (ส่งซ้ำได้) · หมดอายุแล้ว = unchanged · id ไม่มี = 404
  expect(await (await admin.api.post(`/api/admin/invites/${target.id}/revoke`)).json()).toEqual({ result: "unchanged" });
  expect(await (await admin.api.post(`/api/admin/invites/${exp.id}/revoke`)).json()).toEqual({ result: "unchanged" });
  const none = await admin.api.post(`/api/admin/invites/${randomUUID()}/revoke`);
  expect(none.status()).toBe(404);
  expect(await none.text()).toBe(NOT_FOUND_BODY);
  // reload แล้วสถานะยังเป็นเพิกถอน (มาจากเซิร์ฟเวอร์ ไม่ใช่แค่ state ในหน้า)
  await page.reload();
  await expect(row(tLabel)).toContainText(A("status.revoked"));
  await check.dispose();
  await context.close();
  await admin.api.dispose();
});

// ---------------------------------------------------------------- เกณฑ์ 9
test("เกณฑ์ 9: Cache-Control ของหน้าและ API แอดมิน · fcf-pages-v1 ไม่มี key ใต้ /admin", async ({ browser, baseURL }) => {
  const admin = await newAdmin(baseURL!);
  const context = await browser.newContext({ baseURL, timezoneId: TZ });
  await applySession(context, admin);
  const page = await context.newPage();
  const seen: Record<string, string> = {};
  page.on("response", (r) => {
    const p = new URL(r.url()).pathname;
    if (p === PAGE || p.startsWith("/api/admin/")) seen[`${r.request().method()} ${p}`] = r.headers()["cache-control"] ?? "(none)";
  });
  await page.goto("/me");
  await waitForServiceWorker(page);
  // ไปหน้าแอดมินด้วย navigation ที่ SW คุมอยู่ (ทั้งคลิกจากแถวในหน้า "ฉัน" และพิมพ์ URL ตรง)
  await page.getByRole("link", { name: msg("th", "account.adminInvites") }).click();
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(A("title"));
  await page.goto(PAGE);
  await page.getByLabel(A("form.label")).fill("cache");
  await page.getByRole("button", { name: A("form.submit") }).click();
  await expect(page.getByRole("heading", { name: A("result.title") })).toBeVisible();
  await page.goto(`${PAGE}/`); // รูปมี / ท้าย
  await page.goto("/me");
  await page.waitForTimeout(2500); // ให้ SW เก็บหน้าในพื้นหลังเสร็จ

  const direct = await admin.api.get(PAGE, { maxRedirects: 0 });
  console.log(`[qa] Cache-Control ${PAGE} (direct GET): ${direct.headers()["cache-control"]}`);
  for (const [k, v] of Object.entries(seen)) console.log(`[qa] Cache-Control ${k}: ${v}`);
  expect(direct.headers()["cache-control"]).toContain("no-store");
  expect(seen[`GET ${PAGE}`]).toContain("no-store");
  expect(seen["GET /api/admin/invites"]).toContain("no-store");
  expect(seen["POST /api/admin/invites"]).toContain("no-store");

  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) out.push(`${name} ${new URL(req.url).pathname}`);
    }
    return out;
  });
  expect(keys.some((k) => k.startsWith("fcf-pages-v1 /me")), `positive control: /me cached · ${keys.join(", ")}`).toBe(true);
  expect(keys.filter((k) => /\s\/admin(\/|$)/i.test(k))).toEqual([]);
  await context.close();
  await admin.api.dispose();
});

// ---------------------------------------------------------------- เกณฑ์ 12 (ซ้ำกับ unit แต่ยิงผ่านเซิร์ฟเวอร์จริง)
test("เกณฑ์ 12: แอดมินลบบัญชี → app_admin และ key throttle ของแอดมินหาย", async ({ baseURL }) => {
  const admin = await newAdmin(baseURL!);
  expect((await postInvite(admin.api, { label: "before-delete", days: 1, maxUses: 1 })).status()).toBe(201);
  const key = `admin-invite:${createHash("sha256").update(admin.id, "utf8").digest("hex")}`;
  expect(await sql(`select 1 from auth_throttle where key = $1`, [key])).toHaveLength(1);
  const del = await admin.api.delete("/api/me");
  expect(del.status()).toBe(200);
  const r = await residue(admin.id, admin.email);
  expect(r.app_admin).toBe(0);
  expect(Object.values(r).every((n) => n === 0), JSON.stringify(r)).toBe(true);
  expect(await sql(`select 1 from auth_throttle where key = $1`, [key])).toHaveLength(0);
  await admin.api.dispose();
});

// ---------------------------------------------------------------- เกณฑ์ 13
test("เกณฑ์ 13: /api/me isAdmin ถูกทั้งสองแบบ · แถว \"ออกโค้ดเชิญ\" เห็นเฉพาะแอดมิน · HTML ของ /me เหมือนกัน", async ({ browser, baseURL }) => {
  const admin = await newAdmin(baseURL!);
  const regular = await signUp(baseURL!, { stage: "ready" });
  expect((await (await admin.api.get("/api/me")).json()).isAdmin).toBe(true);
  expect((await (await regular.api.get("/api/me")).json()).isAdmin).toBe(false);

  const normalize = (html: string, u: TestUser) =>
    html
      .replaceAll(u.email, "<email>")
      // ค่าต่อคำขอที่ไม่เกี่ยวกับผู้ใช้ (ถ้ามี) — ไม่มีก็ไม่เปลี่ยนอะไร
      .replace(/nonce="[^"]*"/g, "");
  const a = normalize(await (await admin.api.get("/me", { maxRedirects: 0 })).text(), admin);
  const b = normalize(await (await regular.api.get("/me", { maxRedirects: 0 })).text(), regular);
  expect(a).toBe(b);
  expect(a).not.toContain("/admin/invites");
  // หมายเหตุ: คำว่า "ออกโค้ดเชิญ" อยู่ใน HTML ของทุกคนเพราะ next-intl ส่งข้อความทั้งชุดให้ไคลเอนต์ (ไม่ได้บอกสถานะแอดมิน)

  for (const [u, expected] of [
    [admin, 1],
    [regular, 0],
  ] as const) {
    const ctx = await browser.newContext({ baseURL });
    await applySession(ctx, u);
    const page = await ctx.newPage();
    await page.goto("/me");
    await expect(page.getByText(u.email)).toBeVisible();
    await expect(page.getByRole("link", { name: msg("th", "account.adminInvites") })).toHaveCount(expected);
    if (expected) await expect(page.getByRole("link", { name: msg("th", "account.adminInvites") })).toHaveAttribute("href", PAGE);
    // ไม่มีในแถบล่าง
    await expect(page.getByRole("navigation", { name: M("nav.label") }).getByRole("link")).toHaveCount(4);
    await ctx.close();
  }
  await admin.api.dispose();
  await regular.api.dispose();
});

// ---------------------------------------------------------------- หน้าแอดมินอยู่กลุ่ม (admin) (96449fa)
test("หน้าแอดมินของแอดมิน: ไม่มีแถบล่าง · มีปุ่ม ‹ กลับ \"ฉัน\" (≥ 44px) · กดแล้วไป /me ที่มีแถบล่าง · TH/EN", async ({ browser, baseURL }) => {
  const admin = await newAdmin(baseURL!);
  for (const locale of ["th", "en"] as const) {
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { locale, colorScheme: locale === "en" ? "dark" : "light" });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("heading", { name: A("list.title", locale) })).toBeVisible();
    await expect(page.getByRole("navigation", { name: M("nav.label", locale) }), "admin page has no bottom tabs").toHaveCount(0);
    for (const tab of ["home", "me"]) await expect(page.getByRole("link", { name: M(`nav.${tab}`, locale), exact: true })).toHaveCount(0);
    const back = page.getByRole("link", { name: A("back", locale), exact: true });
    await expect(back).toBeVisible();
    expect(A("back", locale)).toContain(M("nav.me", locale));
    await expect(back).toHaveAttribute("href", "/me");
    const box = (await back.boundingBox())!;
    expect(Math.min(box.width, box.height), "back button >= 44px").toBeGreaterThanOrEqual(44);
    // อยู่ส่วนบนของจอ (header) ไม่ใช่ท้ายหน้า
    expect(box.y).toBeLessThan(200);
    await back.click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole("navigation", { name: M("nav.label", locale) }).getByRole("link")).toHaveCount(4);
    await context.close();
  }
  await admin.api.dispose();
});

// ---------------------------------------------------------------- M1 ทาง ก. (boss 2026-11-20): ลบบัญชีที่สมัครด้วยโค้ด → ป้ายของโค้ดนั้นเป็น "—"
// "—" = DELETED_INVITE_LABEL ใน src/lib/data/server/account.ts (server-only import ไม่ได้ใน e2e — ค่าที่ boss อนุมัติใน contract)
const DELETED_LABEL = "—";

test("ลบบัญชีเพื่อนที่สมัครด้วยโค้ด → ป้ายในรายการของแอดมินเป็น \"—\" · โค้ดอื่นไม่ถูกแตะ · สถานะ/ใช้ไป ไม่เปลี่ยน", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const admin = await newAdmin(baseURL!);
  const tag = Date.now().toString(36);
  const mk = async (label: string, maxUses: number) => {
    const r = await postInvite(admin.api, { label, days: 3, maxUses });
    expect(r.status()).toBe(201);
    return (await r.json()) as { id: string; code: string };
  };
  const single = await mk(`ฟ้า-${tag}`, 1);
  const multi = await mk(`กลุ่ม-${tag}`, 3);
  const untouched = await mk(`ไม่มีใครใช้-${tag}`, 1);

  const friend1 = await signUp(baseURL!, { stage: "ready", code: single.code });
  const friend2 = await signUp(baseURL!, { stage: "ready", code: multi.code });
  const friend3 = await signUp(baseURL!, { stage: "consented", code: multi.code });
  const labelOf = async (id: string) => (await sql<{ label: string; uses_count: number; revoked_at: unknown }>(`select label, uses_count, revoked_at from invite_code where id = $1`, [id]))[0];
  expect((await labelOf(multi.id)).uses_count).toBe(2);

  // ลบบัญชีเพื่อน 1 (ผ่าน API จริง) → ป้ายของโค้ด 1 ครั้งเป็น "—" · ใช้ไปยัง 1
  expect((await friend1.api.delete("/api/me")).status()).toBe(200);
  expect(await labelOf(single.id)).toMatchObject({ label: DELETED_LABEL, uses_count: 1, revoked_at: null });
  // โค้ดหลายสิทธิ์: ลบหนึ่งในสองคน → ป้ายเป็น "—" ด้วย (ป้ายอาจระบุตัวคนใดคนหนึ่ง) · ใช้ไปยัง 2
  expect((await friend2.api.delete("/api/me")).status()).toBe(200);
  expect(await labelOf(multi.id)).toMatchObject({ label: DELETED_LABEL, uses_count: 2 });
  // โค้ดที่ไม่มีใครใช้ไม่เปลี่ยน
  expect((await labelOf(untouched.id)).label).toBe(`ไม่มีใครใช้-${tag}`);
  // บัญชีที่เหลือยังอยู่และยังผูกกับโค้ดเดิม
  const f3 = (await userIdOf(friend3.email))!;
  expect(await sql(`select 1 from "user" where id = $1 and invite_code_id = $2`, [f3, multi.id])).toHaveLength(1);

  // API ของแอดมินและหน้าจอแสดง "—"
  const { invites: rows } = (await (await admin.api.get("/api/admin/invites")).json()) as { invites: { id: string; label: string }[] };
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.label]));
  expect(byId[single.id]).toBe(DELETED_LABEL);
  expect(byId[multi.id]).toBe(DELETED_LABEL);
  expect(byId[untouched.id]).toBe(`ไม่มีใครใช้-${tag}`);
  const listText = JSON.stringify(rows);
  expect(listText).not.toContain(`ฟ้า-${tag}`);
  expect(listText).not.toContain(`กลุ่ม-${tag}`);

  const { context, page } = await openAdminPage(browser, baseURL!, admin);
  await expect(page.getByText(`ไม่มีใครใช้-${tag}`)).toBeVisible();
  await expect(page.getByText(`ฟ้า-${tag}`)).toHaveCount(0);
  await expect(page.getByText(`กลุ่ม-${tag}`)).toHaveCount(0);
  // รายการเป็นของทั้งระบบ (เทสต์อื่นที่รันขนานก็สร้างแถว "—" ได้) → เทียบกับ API ที่หน้าใช้ ณ เวลาเดียวกัน ไม่ใช่เลขตายตัว
  const dashRows = page.locator("li").filter({ has: page.getByText(DELETED_LABEL, { exact: true }) });
  const apiDash = async () => ((await (await admin.api.get("/api/admin/invites")).json()) as { invites: { label: string }[] }).invites.filter((r) => r.label === DELETED_LABEL).length;
  expect(await dashRows.count()).toBeGreaterThanOrEqual(2);
  await page.reload();
  await expect(page.getByText(`ไม่มีใครใช้-${tag}`)).toBeVisible();
  expect(await dashRows.count()).toBe(await apiDash());
  // เพิกถอนโค้ดหลายสิทธิ์ที่เหลือได้ตามปกติ (ปุ่มยังมีชื่อที่อ่านได้)
  await expect(page.getByRole("button", { name: fill(A("revoke.buttonLabel"), { label: DELETED_LABEL }) }).first()).toBeVisible();
  await context.close();

  // ลบซ้ำบัญชีที่ใช้โค้ดหลายสิทธิ์คนสุดท้าย → ไม่ error และยัง "—"
  expect((await friend3.api.delete("/api/me")).status()).toBe(200);
  expect((await labelOf(multi.id)).label).toBe(DELETED_LABEL);
  for (const f of [friend1, friend2, friend3]) await f.api.dispose();
  await admin.api.dispose();
});

// ---------------------------------------------------------------- เกณฑ์ 14
test.describe("เกณฑ์ 14: แชร์ (mock navigator.share)", () => {
  test("มี share → ส่ง { text } อย่างเดียว · ข้อความ D5 มีลิงก์ครั้งเดียว · ไม่มีป้าย/อีเมล", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { share: "resolve" });
    const label = `ป้ายลับ-${Date.now().toString(36)}`;
    const code = await createViaUi(page, label);
    await expect(page.getByRole("button", { name: A("result.copyMessage") })).toHaveCount(0);
    await page.getByRole("button", { name: A("result.share") }).click();
    await expect.poll(() => shares(page)).toHaveLength(1);
    const [payload] = (await shares(page)) as Record<string, string>[];
    expect(Object.keys(payload)).toEqual(["text"]);
    const exp = (await sql<{ expires_at: string }>(`select expires_at from invite_code where label = $1`, [label]))[0].expires_at;
    const link = `${new URL(baseURL!).origin}/welcome#invite=${code}`;
    expect(payload.text).toBe(fill(A("share.text"), { link, code, date: expectedDate(String(exp), "th") }));
    expect(payload.text.split(link)).toHaveLength(2); // ลิงก์ครั้งเดียว
    expect(payload.text).not.toContain(label);
    expect(payload.text).not.toContain(admin.email);
    // คัดลอกลิงก์ / คัดลอกโค้ด = ค่าล้วน + toast
    await page.getByRole("button", { name: A("result.copyLink") }).click();
    await expect(page.getByRole("status").filter({ hasText: A("toast.linkCopied") })).toBeVisible();
    await page.getByRole("button", { name: A("result.copyCode") }).click();
    await expect(page.getByRole("status").filter({ hasText: A("toast.codeCopied") })).toBeVisible();
    expect(await clips(page)).toEqual([link, code]);
    await context.close();
    await admin.api.dispose();
  });

  test("ผู้ใช้ยกเลิก (AbortError) → เงียบ: ไม่มี error ไม่มี toast ไม่คัดลอก", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { share: "abort" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await createViaUi(page, "abort");
    await page.getByRole("button", { name: A("result.share") }).click();
    await expect.poll(() => shares(page)).toHaveLength(1);
    await page.waitForTimeout(500);
    expect(await clips(page)).toEqual([]);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    for (const k of ["messageCopied", "copyFailed"]) await expect(page.getByText(A(`toast.${k}`))).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
    await admin.api.dispose();
  });

  test("share reject แบบอื่น → คัดลอกข้อความเชิญแทน + toast", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { share: "fail" });
    const code = await createViaUi(page, "fail");
    await page.getByRole("button", { name: A("result.share") }).click();
    await expect(page.getByRole("status").filter({ hasText: A("toast.messageCopied") })).toBeVisible();
    const c = await clips(page);
    expect(c).toHaveLength(1);
    expect(c[0]).toContain(`/welcome#invite=${code}`);
    await context.close();
    await admin.api.dispose();
  });

  test("ไม่มี navigator.share → ปุ่มหลักเป็น \"คัดลอกข้อความเชิญ\" · คัดลอกข้อความ D5 + toast", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { share: "none" });
    const code = await createViaUi(page, "noshare");
    await expect(page.getByRole("button", { name: A("result.share") })).toHaveCount(0);
    await page.getByRole("button", { name: A("result.copyMessage") }).click();
    await expect(page.getByRole("status").filter({ hasText: A("toast.messageCopied") })).toBeVisible();
    const c = await clips(page);
    expect(c).toHaveLength(1);
    expect(c[0].startsWith(A("share.text").split("{link}")[0])).toBe(true);
    expect(c[0]).toContain(code);
    // ออกอีกอัน → ฟอร์มเปล่าค่าเริ่ม (3 วัน / 1 คน) · โค้ดเดิมหายจากจอ
    await page.getByRole("button", { name: A("result.another") }).click();
    await expect(page.getByLabel(A("form.label"))).toHaveValue("");
    await expect(page.getByRole("radio", { name: fill(A("form.daysOption"), { days: 3 }) })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel(A("form.uses"), { exact: true })).toHaveValue("1");
    await expect(page.getByText(code)).toHaveCount(0);
    await context.close();
    await admin.api.dispose();
  });
});

// ---------------------------------------------------------------- เกณฑ์ 15
test.describe("เกณฑ์ 15: TH/EN · ปุ่ม ≥ 44px · โหมดมืด · ไม่มีส้ม · ออฟไลน์ · จอคอม 1280px คีย์บอร์ด", () => {
  async function smallTargets(page: Page) {
    return page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("main button, main a[href], main [role=radio], main input, [role=dialog] button"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 44 || (el.tagName !== "INPUT" && r.width < 44)) out.push(`${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
  }

  test("EN ครบทุกจอของหน้า · ไม่มีคีย์หลุด", async ({ browser, baseURL }, info) => {
    const admin = await newAdmin(baseURL!, "en");
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { locale: "en", share: "resolve" });
    await expect(page.getByLabel(A("form.label", "en"))).toBeVisible();
    await expect(page.getByText(A("form.labelHint", "en"))).toBeVisible();
    await expect(page.getByRole("radio", { name: "14 days" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "1 day", exact: true })).toBeVisible();
    const enLabel = `english-${info.project.name}-${Date.now().toString(36)}`;
    await createViaUi(page, enLabel, { locale: "en", days: 1 });
    await expect(page.getByText(A("result.warning", "en"))).toBeVisible();
    await expect(page.getByText(/· 1 person · until /)).toBeVisible();
    await page.getByRole("button", { name: A("result.share", "en") }).click();
    const [p] = (await shares(page)) as { text: string }[];
    expect(p.text.startsWith("Join me on Fat Cat Fit. Open this link to sign up: ")).toBe(true);
    await expect(page.getByRole("heading", { name: A("list.title", "en") })).toBeVisible();
    await expect(page.locator("li", { hasText: enLabel })).toContainText(A("status.active", "en"));
    await page.getByRole("button", { name: `Revoke ${enLabel}` }).click();
    await expect(page.getByRole("dialog")).toContainText(A("revoke.body", "en"));
    // ป้ายของโค้ดอื่น (เทสต์อื่นออกเป็นภาษาไทย) เป็นข้อมูลผู้ใช้ ไม่ใช่ข้อความของแอป → ตัดออกก่อนตรวจ
    const body = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("li > div > p:first-child").forEach((n) => n.remove());
      clone.querySelectorAll("#revoke-title").forEach((n) => n.remove());
      clone.querySelectorAll("button[aria-label]").forEach((n) => n.removeAttribute("aria-label"));
      document.body.appendChild(clone);
      const t = clone.innerText;
      clone.remove();
      return t;
    });
    expect(body).not.toMatch(/admin\.invites\.|[ก-๙]/);
    await context.close();
    await admin.api.dispose();
  });

  test("มือถือ: ทุกปุ่ม/ลิงก์/ชิปในหน้า ฟอร์ม กรอบโค้ด รายการ และแผ่นยืนยัน ≥ 44px · ไม่ล้นจอ", async ({ browser, baseURL }) => {
    // สร้าง context ขนาดจอเอง → รันได้ทั้งสอง project (ไม่ใช้ test.skip)
    const admin = await newAdmin(baseURL!);
    const context = await browser.newContext({ baseURL, timezoneId: TZ, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    await applySession(context, admin);
    await mockShare(context, "resolve");
    const page = await context.newPage();
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(A("title"));
    expect(await smallTargets(page)).toEqual([]);
    const touch = `touch-${Date.now().toString(36)}`;
    await createViaUi(page, touch);
    expect(await smallTargets(page)).toEqual([]);
    await page.locator("li", { hasText: touch }).getByRole("button").click();
    expect(await smallTargets(page)).toEqual([]);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(360);
    await context.close();
    await admin.api.dispose();
  });

  test("โหมดมืด: พื้นและตัวหนังสือตาม token · ไม่มีส้มในหน้าแอดมิน (ทั้งสองโหมด)", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    for (const scheme of ["light", "dark"] as const) {
      const { context, page } = await openAdminPage(browser, baseURL!, admin, { colorScheme: scheme, share: "resolve" });
      await createViaUi(page, `scheme-${scheme}`);
      const c = await page.evaluate(() => {
        const bg = getComputedStyle(document.body).backgroundColor;
        const h1 = getComputedStyle(document.querySelector("h1")!).color;
        const colors = new Set<string>();
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
          const cs = getComputedStyle(el);
          colors.add(cs.color);
          colors.add(cs.backgroundColor);
          colors.add(cs.borderTopColor);
        }
        return { bg, h1, colors: [...colors] };
      });
      expect(c.bg, scheme).toBe(TOKENS[scheme].paper);
      expect(c.h1, scheme).toBe(TOKENS[scheme].ink);
      expect(c.colors, `${scheme}: no accent orange`).not.toContain(TOKENS.accent);
      await context.close();
    }
    await admin.api.dispose();
  });

  test("ออฟไลน์หลังเปิดหน้า: ปุ่มออกโค้ด/เพิกถอนปิด · บอก \"ต้องต่อเน็ต\" · กรอบโค้ดไม่หาย", async ({ browser, baseURL }) => {
    const admin = await newAdmin(baseURL!);
    const { context, page } = await openAdminPage(browser, baseURL!, admin, { share: "resolve" });
    const offLabel = `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const code = await createViaUi(page, offLabel);
    await context.setOffline(true);
    await expect(page.getByText(A("needNet"))).toBeVisible();
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: A("result.another") })).toBeDisabled();
    await expect(page.locator("li", { hasText: offLabel }).getByRole("button")).toBeDisabled();
    await page.getByRole("button", { name: A("result.share") }).click();
    await expect.poll(() => shares(page)).toHaveLength(1);
    await context.setOffline(false);
    await expect(page.getByText(A("needNet"))).toHaveCount(0);
    await context.close();
    await admin.api.dispose();
  });

  test("จอคอม 1280px: ใช้ด้วยคีย์บอร์ดล้วน (Tab · ลูกศรเลือกวัน · Enter ออกโค้ด · แผ่นเพิกถอน focus ที่ยกเลิก · Esc ปิด)", async ({ browser, baseURL }) => {
    // สร้าง context ขนาดจอเอง → รันได้ทั้งสอง project (ไม่ใช้ test.skip)
    const admin = await newAdmin(baseURL!);
    const context = await browser.newContext({ baseURL, timezoneId: TZ, viewport: { width: 1280, height: 800 } });
    await applySession(context, admin);
    await mockShare(context, "resolve");
    const page = await context.newPage();
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(A("title"));
    // คอลัมน์กลางจอ ≤ 480px
    const w = await page.locator("main").evaluate((m) => m.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(480);
    const kbLabel = `kb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await page.getByLabel(A("form.label")).focus();
    await page.keyboard.type(kbLabel);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("radio", { name: fill(A("form.daysOption"), { days: 3 }) })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: fill(A("form.daysOption"), { days: 7 }) })).toBeFocused();
    await expect(page.getByRole("radio", { name: fill(A("form.daysOption"), { days: 7 }) })).toHaveAttribute("aria-checked", "true");
    await page.getByLabel(A("form.label")).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: A("result.title") })).toBeFocused();
    const row = await sql<{ expires_at: string; created_at: string }>(`select expires_at, created_at from invite_code where label = $1`, [kbLabel]);
    expect((new Date(row[0].expires_at).getTime() - new Date(row[0].created_at).getTime()) / 86_400_000).toBeCloseTo(7, 3);
    // ไปถึงปุ่มเพิกถอนด้วย Tab แล้วเปิดแผ่นด้วย Enter
    const revoke = page.getByRole("button", { name: fill(A("revoke.buttonLabel"), { label: kbLabel }) });
    for (let i = 0; i < 15 && !(await revoke.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(revoke).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByRole("button", { name: A("revoke.cancel") })).toBeFocused();
    // focus ถูกขังในแผ่น
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await sql<{ revoked_at: unknown }>(`select revoked_at from invite_code where label = $1`, [kbLabel]))[0].revoked_at).toBeNull();
    await context.close();
    await admin.api.dispose();
  });
});

// ---------------------------------------------------------------- คำแนะนำ LINE บน /welcome
test.describe("คำแนะนำ LINE บนจอยินดีต้อนรับ", () => {
  const LINE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0";
  const SAFARI_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  for (const [name, ua, shown] of [
    ["UA มี Line/ → เห็นคำแนะนำ", LINE_UA, true],
    ["UA อื่น → ไม่เห็น", SAFARI_UA, false],
  ] as const) {
    test(`${name} · #invite= ยังเติมช่อง`, async ({ browser, baseURL }) => {
      const admin = await newAdmin(baseURL!);
      const r = await postInvite(admin.api, { label: `line-${shown}`, days: 1, maxUses: 1 });
      const { code } = (await r.json()) as { code: string };
      const ctx = await browser.newContext({ baseURL, userAgent: ua });
      await ctx.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(`/welcome#invite=${code}`);
      await expect(page.getByLabel(M("welcome.invite.label"))).toHaveValue(code);
      await expect(page.getByText(M("welcome.lineHint"))).toHaveCount(shown ? 1 : 0);
      expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
      await ctx.close();
      await admin.api.dispose();
    });
  }

  test("EN + LINE → คำแนะนำภาษาอังกฤษ", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, userAgent: LINE_UA });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
    const page = await ctx.newPage();
    await page.goto("/welcome");
    await expect(page.getByText(msg("en", "welcome.lineHint"))).toBeVisible();
    await ctx.close();
  });
});
