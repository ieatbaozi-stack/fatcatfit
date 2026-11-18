import { expect, test } from "./fixtures";
import { TABS, collectErrors, msg, setLocale, waitForCachedPages, waitForServiceWorker } from "./helpers";

// PWA ของ R0 (contract เกณฑ์ 10, 12 + ส่วนที่ตรวจในเบราว์เซอร์ได้ของ 9) — ADR 0004 ข้อ 1
// "ปิดแล้วเปิดแอป" = ปิดทุกแท็บแล้วเปิดแท็บใหม่ใน context เดิม (SW และ Cache Storage อยู่ต่อ)
// เน็ตหลุด = context.setOffline(true) (Chromium ใช้กับ service worker ด้วย — เทสต์ /api ข้างล่างพิสูจน์ว่าออฟไลน์จริง)

test.describe("PWA", () => {
  test("SW ลงทะเบียนและคุมหน้าตั้งแต่เปิดครั้งแรก · manifest ติดตั้งได้ตามเกณฑ์ Chromium", async ({ page, browserName }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await waitForServiceWorker(page);
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/serwist\/sw\.js$/);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    if (browserName === "chromium") {
      // Page.getInstallabilityErrors ใช้ไม่ได้ที่นี่ (context ของ Playwright เป็น incognito → "in-incognito" เสมอ)
      // ตรวจแค่ว่า manifest ไม่มี error · การติดตั้งจริงตรวจด้วยโปรไฟล์ถาวร (src/pwa/e2e) และเครื่องจริงของ boss
      const cdp = await page.context().newCDPSession(page);
      const manifest = (await cdp.send("Page.getAppManifest")) as { errors: { message: string }[] };
      expect(manifest.errors).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test("/api/** ไม่ผ่าน cache ของ SW: ไม่ถูกเก็บ และออฟไลน์แล้วเรียกไม่ได้", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await waitForCachedPages(page, ["/"]);

    const [res, body] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/health")),
      page.evaluate(() => fetch("/api/health").then((r) => r.json())),
    ]);
    expect([200, 503]).toContain(res.status());
    expect(res.fromServiceWorker()).toBe(false);
    expect(res.headers()["cache-control"]).toContain("no-store");
    // ไม่ leak รายละเอียด: body มีแค่ { ok }
    expect(Object.keys(body)).toEqual(["ok"]);

    const cachedUrls = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname);
      return urls;
    });
    expect(cachedUrls.length).toBeGreaterThan(0);
    expect(cachedUrls.filter((u) => u.startsWith("/api"))).toEqual([]);

    await context.setOffline(true);
    const offline = await page.evaluate(() =>
      fetch("/api/health").then(
        (r) => `answered ${r.status}`,
        () => "rejected",
      ),
    );
    expect(offline).toBe("rejected");
  });

  test("เปิดออนไลน์ 1 ครั้ง → เน็ตหลุด → ปิดแล้วเปิดแอปใหม่ → เห็นหน้าหลัก", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await waitForCachedPages(page, ["/"]);
    await page.close();

    await context.setOffline(true);
    const app = await context.newPage();
    const errors = collectErrors(app);
    const res = await app.goto("/");
    expect(res?.status()).toBe(200);
    await expect(app.getByRole("heading", { level: 1 })).toHaveText(msg("th", "nav.home"));
    await expect(app.getByText(msg("th", "empty.home"))).toBeVisible();
    // ฟอนต์และ CSS มาจาก cache ด้วย (หน้าไม่ใช่ HTML เปล่า)
    expect(await app.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Noto Sans Thai/);
    await app.waitForTimeout(500);
    expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(e))).toEqual([]);
  });

  test("ออฟไลน์: แตะแท็บที่เคยเปิดแล้ว ได้หน้านั้นจริง (ไม่ค้าง ไม่พัง)", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    for (const p of ["/history", "/progress", "/me"]) await page.goto(p);
    await waitForCachedPages(page, ["/", "/history", "/progress", "/me"], "th");
    await page.goto("/");
    await context.setOffline(true);

    const nav = page.getByRole("navigation", { name: msg("th", "nav.label") });
    for (const { path, key } of [
      { path: "/history", key: "history" },
      { path: "/progress", key: "progress" },
      { path: "/me", key: "me" },
      { path: "/", key: "home" },
    ]) {
      await nav.getByRole("link", { name: msg("th", `nav.${key}`), exact: true }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", `nav.${key}`));
    }
  });

  test("ออฟไลน์: แตะแท็บที่ยังไม่เคยเปิด ได้ app shell ที่ใช้งานต่อได้ ไม่ใช่หน้า error ของเบราว์เซอร์", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await waitForCachedPages(page, ["/"]);
    await context.setOffline(true);
    const nav = page.getByRole("navigation", { name: msg("th", "nav.label") });
    await nav.getByRole("link", { name: msg("th", "nav.progress"), exact: true }).click();
    // ต้องยังเห็นแอป (แถบล่าง) — ไม่ใช่ chrome-error://
    await expect(nav).toBeVisible();
    expect(page.url()).toMatch(/^http:\/\/localhost:\d+\//);
  });

  // QA M1: ผู้ใช้ใหม่เปิดแค่ "/" แล้วเน็ตหลุด → ทุกแท็บต้องเป็นหน้าของมันเอง (ไม่ใช่ shell ของ "/")
  for (const locale of ["th", "en"] as const) {
    test(`ติดตั้งครั้งแรกที่ / (${locale}) → ออฟไลน์ → แตะทุกแท็บ ได้เนื้อหาและแถบล่างของหน้านั้น`, async ({ page, context, baseURL }) => {
      if (locale === "en") await setLocale(context, baseURL!, "en");
      await page.goto("/");
      await waitForServiceWorker(page);
      await waitForCachedPages(
        page,
        TABS.map((t) => t.path),
        locale,
      );
      await context.setOffline(true);
      const errors = collectErrors(page);

      const nav = page.getByRole("navigation", { name: msg(locale, "nav.label") });
      for (const { path, key } of [...TABS.slice(1), TABS[0]]) {
        await nav.getByRole("link", { name: msg(locale, `nav.${key}`), exact: true }).click();
        await expect(page).toHaveURL(path);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, `nav.${key}`));
        // แถบล่างไฮไลต์แท็บนี้แท็บเดียว
        await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
        await expect(nav.getByRole("link", { name: msg(locale, `nav.${key}`), exact: true })).toHaveAttribute("aria-current", "page");
      }
      // ทุกหน้ามาจาก cache ได้ครบ (CSS/JS ของหน้าไม่หาย)
      expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Noto Sans Thai/);
      expect(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(e))).toEqual([]);
    });
  }

  test("เปลี่ยนภาษาตอนออนไลน์ (cookie) → SW ดึงใหม่ครบทั้ง 4 แท็บในภาษาใหม่ → ออฟไลน์แล้วทุกแท็บเป็นภาษาใหม่", async ({ page, context, baseURL }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await waitForCachedPages(
      page,
      TABS.map((t) => t.path),
      "th",
    );
    // ไม่พึ่งปุ่มภาษา: ตั้ง cookie แบบเดียวกับตัวสลับภาษาแล้วโหลดหน้าใหม่ (navigation ผ่าน SW → เห็นภาษาใหม่)
    await setLocale(context, baseURL!, "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await waitForCachedPages(
      page,
      TABS.map((t) => t.path),
      "en",
    );
    await page.close();

    await context.setOffline(true);
    const app = await context.newPage();
    for (const { path, key } of TABS) {
      await app.goto(path);
      await expect(app.locator("html")).toHaveAttribute("lang", "en");
      await expect(app.getByRole("heading", { level: 1 })).toHaveText(msg("en", `nav.${key}`));
    }
  });

  test("ออฟไลน์: หน้าที่ไม่ใช่แท็บและไม่เคยเปิด (/styleguide, URL ที่ไม่มี) → ถอยไป app shell ไม่ใช่หน้า error ของเบราว์เซอร์", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await waitForCachedPages(page, ["/"]);
    await context.setOffline(true);
    for (const p of ["/styleguide", "/no-such-page"]) {
      const res = await page.goto(p);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("navigation", { name: msg("th", "nav.label") })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "nav.home"));
    }
  });

  test("เปลี่ยนภาษาแล้วเน็ตหลุด → เปิดแอปใหม่ได้ภาษาที่เลือกล่าสุด", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await page.goto("/me");
    await waitForCachedPages(page, ["/", "/me"], "th");
    await page
      .getByRole("group", { name: msg("th", "me.language.label") })
      .getByRole("button", { name: msg("th", "me.language.en") })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await waitForCachedPages(page, ["/", "/me"], "en");
    await page.close();

    await context.setOffline(true);
    const app = await context.newPage();
    await app.goto("/");
    await expect(app.locator("html")).toHaveAttribute("lang", "en");
    await expect(app.getByRole("heading", { level: 1 })).toHaveText(msg("en", "nav.home"));
  });

  test("ออฟไลน์: กดเปลี่ยนภาษา → ไม่พัง และเมื่อเปิดใหม่ภาษาตรงกับ cookie ที่เลือก หรือคงภาษาเดิมโดยไม่ปนกัน", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await page.goto("/me");
    await waitForCachedPages(page, ["/", "/me"], "th");
    await context.setOffline(true);
    const errors = collectErrors(page);
    // พฤติกรรมใหม่ (ADR 0005 · QA M2): ออฟไลน์เปลี่ยนภาษาไม่ได้ → ปุ่มภาษาอื่นกดไม่ได้ + มีข้อความบอก (ดู locale-and-404.spec.ts)
    const enBtn = page.getByRole("group", { name: msg("th", "me.language.label") }).getByRole("button", { name: msg("th", "me.language.en") });
    await expect(enBtn).toBeDisabled();
    await expect(page.getByText(msg("th", "me.language.offlineNote"))).toBeVisible();
    await enBtn.click({ force: true });
    await page.waitForTimeout(1500);
    // หน้ายังอยู่ ใช้ต่อได้
    await expect(page.getByRole("navigation").first()).toBeVisible();
    const lang = await page.locator("html").getAttribute("lang");
    const h1 = await page.getByRole("heading", { level: 1 }).textContent();
    const pressedEn = await page.getByRole("button", { name: msg(lang === "en" ? "en" : "th", "me.language.en") }).getAttribute("aria-pressed");
    test.info().annotations.push({ type: "observed", description: JSON.stringify({ lang, h1, pressedEn, errors }) });
    // หน้าต้องสอดคล้องกันเอง: ภาษาของ <html>, หัวข้อ และชิปที่เลือก ต้องตรงกัน
    expect(h1).toBe(msg(lang === "en" ? "en" : "th", "nav.me"));
    expect(pressedEn).toBe(lang === "en" ? "true" : "false");
  });
});
