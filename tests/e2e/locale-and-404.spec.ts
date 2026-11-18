import { expect, test } from "./fixtures";
import { collectErrors, msg, setLocale, waitForAuthReady } from "./helpers";

// สลับภาษาตอนออฟไลน์ (ADR 0005: เปลี่ยนไม่ได้ → ต้องบอกผู้ใช้) และหน้า 404 ของเราเอง

test.describe("สลับภาษาตอนออฟไลน์", () => {
  test("ออฟไลน์ → ปุ่มภาษาอื่นกดไม่ได้ + มีข้อความ · cookie ไม่เปลี่ยน · ออนไลน์แล้วกดได้ทันที", async ({ page, context }) => {
    await page.goto("/me");
    await waitForAuthReady(page);
    const th = page.locator('button[lang="th"]');
    const en = page.locator('button[lang="en"]');
    const note = page.getByText(msg("th", "me.language.offlineNote"));
    await expect(note).toHaveCount(0);

    await context.setOffline(true);
    await expect(note).toBeVisible();
    await expect(en).toBeDisabled();
    await expect(th).toBeEnabled();
    await expect(th).toHaveAttribute("aria-pressed", "true");
    await en.click({ force: true }); // ถึงจะฝืนกด ก็ต้องไม่มีอะไรเกิดขึ้น
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "NEXT_LOCALE")?.value ?? "th").toBe("th");
    await expect(page.locator("html")).toHaveAttribute("lang", "th");

    await context.setOffline(false);
    await expect(note).toHaveCount(0);
    await expect(en).toBeEnabled();
    const errors = collectErrors(page);
    await en.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "nav.me"));
    expect(errors).toEqual([]);
  });

  test("ข้อความออฟไลน์เป็นภาษาอังกฤษเมื่อหน้าเป็น en", async ({ page, context, baseURL }) => {
    await setLocale(context, baseURL!, "en");
    await page.goto("/me");
    await waitForAuthReady(page);
    await context.setOffline(true);
    await expect(page.getByText(msg("en", "me.language.offlineNote"))).toBeVisible();
    await expect(page.locator('button[lang="th"]')).toBeDisabled();
  });
});

test.describe("หน้า 404", () => {
  for (const locale of ["th", "en"] as const) {
    // R1 (ADR 0006 ข้อ 1): not-found เป็นชนิด open อยู่นอกกลุ่ม (app) → ไม่มีแถบล่างแล้ว เหลือปุ่มกลับหน้าหลักทางเดียว
    test(`URL ที่ไม่มี → HTTP 404 + ข้อความ ${locale} + ปุ่มกลับหน้าหลัก (ไม่มีแถบล่าง)`, async ({ page, context, baseURL }) => {
      await setLocale(context, baseURL!, locale);
      const res = await page.goto("/ไม่มีหน้านี้/จริงๆ");
      expect(res?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "notFound.text"));
      await expect(page.getByRole("navigation", { name: msg(locale, "nav.label") })).toHaveCount(0);
      await page.getByRole("link", { name: msg(locale, "notFound.home") }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "nav.home"));
    });
  }
});
