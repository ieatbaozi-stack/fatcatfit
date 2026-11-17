import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectNoHorizontalOverflow, msg, PAGES, TABS, TOKENS } from "./helpers";

// Smoke test ของ R0 (contract: แถว qa-test + เกณฑ์ข้อ 15)
// เปิดแอป · สลับ 4 แท็บ · สลับโหมด (จำหลัง reload) · สลับภาษา (จำหลัง reload)
// ไม่มี console error · ไม่มีแถบเลื่อนแนวนอน · ใช้คีย์บอร์ดอย่างเดียวได้

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const nav = (page: Page) => page.getByRole("navigation", { name: msg("th", "nav.label") });

test.describe("smoke", () => {
  test("เปิดแอปแล้วสลับครบ 4 แท็บ โดยไม่มี error และไม่ล้นจอ", async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "th");

    for (const { path, key } of [...TABS.slice(1), TABS[0]]) {
      await nav(page).getByRole("link", { name: msg("th", `nav.${key}`), exact: true }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", `nav.${key}`));
      // แท็บที่เลือกมี aria-current และมีแท็บเดียว
      const current = nav(page).locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute("href", path);
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
  });

  test("ทุกหน้า (รวม /styleguide) โหลดตรงได้ ไม่มี error ไม่ล้นจอ ทั้งสว่างและมืด", async ({ page }) => {
    const errors = collectErrors(page);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of PAGES) {
        const res = await page.goto(path);
        expect(res?.status(), path).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await bodyBg(page), `${path} ${scheme}`).toBe(TOKENS[scheme].paper);
        await expectNoHorizontalOverflow(page);
      }
    }
    expect(errors).toEqual([]);
  });

  test("โหมด: ตามระบบเป็นค่าเริ่มต้น · เลือกเองแล้วจำหลัง reload · กลับไปตามระบบได้", async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/me");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await bodyBg(page)).toBe(TOKENS.dark.paper);
    const group = page.getByRole("group", { name: msg("th", "me.theme.label") });
    await expect(group.getByRole("button", { name: msg("th", "me.theme.system") })).toHaveAttribute("aria-pressed", "true");

    await group.getByRole("button", { name: msg("th", "me.theme.light") }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bodyBg(page)).toBe(TOKENS.light.paper);
    await expect(group.getByRole("button", { name: msg("th", "me.theme.light") })).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bodyBg(page)).toBe(TOKENS.light.paper);
    await expect(group.getByRole("button", { name: msg("th", "me.theme.light") })).toHaveAttribute("aria-pressed", "true");

    // โหมดที่เลือกใช้กับทุกหน้า
    await page.goto("/history");
    expect(await bodyBg(page)).toBe(TOKENS.light.paper);

    await page.goto("/me");
    await group.getByRole("button", { name: msg("th", "me.theme.dark") }).click();
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    expect(await bodyBg(page)).toBe(TOKENS.dark.paper);

    await group.getByRole("button", { name: msg("th", "me.theme.system") }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await bodyBg(page)).toBe(TOKENS.light.paper);
    await page.reload();
    expect(await bodyBg(page)).toBe(TOKENS.light.paper);
    expect(errors).toEqual([]);
  });

  test("ภาษา: ไทยเป็นค่าเริ่มต้น · สลับเป็นอังกฤษแล้วจำหลัง reload และใช้กับทุกแท็บ · สลับกลับได้", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/me");
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
    const langGroup = page.getByRole("group", { name: msg("th", "me.language.label") });
    await langGroup.getByRole("button", { name: msg("th", "me.language.en") }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "nav.me"));
    const enNav = page.getByRole("navigation", { name: msg("en", "nav.label") });
    for (const { key } of TABS) await expect(enNav.getByRole("link", { name: msg("en", `nav.${key}`), exact: true })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "nav.me"));

    await enNav.getByRole("link", { name: msg("en", "nav.history"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "nav.history"));
    await expect(page.getByText(msg("en", "empty.history"))).toBeVisible();

    await page.goto("/me");
    await page
      .getByRole("group", { name: msg("en", "me.language.label") })
      .getByRole("button", { name: msg("en", "me.language.th") })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "nav.me"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
    expect(errors).toEqual([]);
  });

  test("คีย์บอร์ดอย่างเดียว: Tab ไปถึงทุกปุ่ม/ลิงก์ และทุกอันมีกรอบ focus", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const expected = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"),
        );
        return els.map((el, i) => {
          el.dataset.qaId = String(i);
          return i;
        });
      });
      const reached = new Map<string, string>();
      // Tab ไปเรื่อยๆ จนวนกลับมาที่ body/ตัวแรก
      for (let i = 0; i < expected.length + 5; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const ring = cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && cs.outlineColor !== "rgba(0, 0, 0, 0)" && parseFloat(cs.outlineWidth) > 0);
          return { id: el.dataset.qaId ?? "?", ring: ring ? "ring" : `no-ring ${el.outerHTML.slice(0, 80)}` };
        });
        if (info) reached.set(info.id, info.ring);
      }
      const missing = expected.map(String).filter((id) => !reached.has(id));
      expect(missing, `${path}: elements never reached by Tab`).toEqual([]);
      const noRing = [...reached.values()].filter((v) => v !== "ring");
      expect(noRing, `${path}: focused without visible focus ring`).toEqual([]);
    }
  });

  test("คีย์บอร์ดอย่างเดียว: ลิงก์ข้ามไปเนื้อหา · เปลี่ยนแท็บด้วย Enter · สลับโหมดด้วย Space", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: msg("th", "a11y.skipToContent"), exact: true });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await nav(page).getByRole("link", { name: msg("th", "nav.me"), exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/me");
    const dark = page.getByRole("button", { name: msg("th", "me.theme.dark") });
    await dark.focus();
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
