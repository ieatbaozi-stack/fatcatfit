import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHorizontalOverflow, msg, PAGES, TOKENS } from "./helpers";

// ทางผิดที่ผู้ใช้จริงเจอได้

test.describe("ทางผิด", () => {
  test("cookie ภาษาเป็นค่าที่ไม่รองรับ → ไทย ไม่ error", async ({ page, context, baseURL }) => {
    const errors = collectErrors(page);
    for (const value of ["xx", "EN", "../../messages/en", ""]) {
      await context.addCookies([{ name: "NEXT_LOCALE", value, url: baseURL! }]);
      const res = await page.goto("/");
      expect(res?.status(), value).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "th");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "nav.home"));
    }
    expect(errors).toEqual([]);
  });

  test("localStorage โหมดเป็นค่าขยะ → ตามระบบ และสลับต่อได้", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("qa-seeded")) {
        localStorage.setItem("fcf-theme", '"><img src=x onerror=alert(1)>');
        sessionStorage.setItem("qa-seeded", "1");
      }
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/me");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(TOKENS.dark.paper);
    await expect(page.getByRole("button", { name: msg("th", "me.theme.system") })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: msg("th", "me.theme.light") }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(errors).toEqual([]);
  });

  test("localStorage ใช้ไม่ได้ (ถูกบล็อก) → หน้าไม่พัง สลับโหมดได้ในหน้านั้น", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    await page.goto("/me");
    await page.getByRole("button", { name: msg("th", "me.theme.dark") }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(errors).toEqual([]);
  });

  test("กดสลับโหมดและภาษารัวๆ → สถานะสุดท้ายตรงกับปุ่มที่กดล่าสุด ไม่ error", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/me");
    const theme = (k: string) => page.getByRole("button", { name: msg("th", `me.theme.${k}`) });
    for (let i = 0; i < 5; i++) {
      await theme("dark").click();
      await theme("light").click();
      await theme("system").click();
    }
    await theme("dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(theme("dark")).toHaveAttribute("aria-pressed", "true");

    // ภาษา: กดสลับไปมาโดยไม่รอ
    const th = page.locator('button[lang="th"]');
    const en = page.locator('button[lang="en"]');
    for (let i = 0; i < 4; i++) {
      await en.click({ noWaitAfter: true });
      await th.click({ noWaitAfter: true });
    }
    await en.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "nav.me"));
    await expect(en).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(errors).toEqual([]);
  });

  test("ปิด JavaScript → ทุกหน้ายังอ่านได้ (render ฝั่งเซิร์ฟเวอร์) และมีแถบล่าง", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: msg("th", "nav.label") }).getByRole("link")).toHaveCount(4);
    }
    // แท็บเป็นลิงก์จริง กดได้แม้ไม่มี JS
    await page.goto("/");
    await page.getByRole("link", { name: msg("th", "nav.history"), exact: true }).click();
    await expect(page).toHaveURL("/history");
    await ctx.close();
  });

  test("จอแคบ 320px (เทียบ WCAG reflow) ทั้งสองภาษา → ไม่ล้นจอ", async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const locale of ["th", "en"]) {
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      for (const path of PAGES) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      }
    }
  });

  test("เส้นทางที่ไม่มี → 404 และยังมีแถบล่างให้กลับ", async ({ page }) => {
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("navigation", { name: msg("th", "nav.label") })).toBeVisible();
  });
});
