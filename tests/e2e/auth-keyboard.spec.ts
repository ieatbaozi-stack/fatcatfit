import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { msg } from "./helpers";
import { newInvite, uniqueEmail, waitForOtp } from "./support/auth";

// เกณฑ์ 14: จอคอม 1280px (และจอมือถือที่ต่อคีย์บอร์ด) ใช้ได้ด้วยคีย์บอร์ดอย่างเดียว — สมัครครบเส้นโดยไม่แตะเมาส์ (Tab / Shift+Tab / Enter / Space / พิมพ์)

test.use({ auth: "none" });

/** กด Tab จนโฟกัสอยู่ที่ element ที่ตรงเงื่อนไข (ไม่เกิน 30 ครั้ง) */
async function tabTo(page: Page, match: (el: { tag: string; text: string; label: string }) => boolean, what: string) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return { tag: "", text: "", label: "" };
      const lbl = a.id ? (document.querySelector(`label[for="${a.id}"]`)?.textContent ?? "") : "";
      return { tag: a.tagName.toLowerCase(), text: (a.textContent ?? "").trim(), label: (a.getAttribute("aria-label") ?? lbl).trim() };
    });
    if (match(el)) {
      // ทุกจุดที่ได้โฟกัสต้องเห็นกรอบโฟกัส
      const ring = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        const cs = getComputedStyle(a);
        const box = a.closest("label") ? getComputedStyle(a.closest("label")!.querySelector("span")!) : cs;
        return cs.outlineStyle !== "none" || cs.boxShadow !== "none" || box.boxShadow !== "none" || a.tagName === "INPUT";
      });
      expect(ring, `focus visible on ${what}`).toBe(true);
      return;
    }
  }
  throw new Error(`could not Tab to ${what}`);
}

test("คีย์บอร์ดอย่างเดียว: โค้ดเชิญ → อีเมล → OTP → ยินยอม → แบบสอบถาม 2 ขั้น → หน้าหลัก", async ({ page }) => {
  const code = await newInvite();
  const email = uniqueEmail("kbd");
  const t = (k: string) => msg("th", k);
  await page.goto("/welcome");

  await tabTo(page, (e) => e.label === t("welcome.invite.label"), "invite field");
  await page.keyboard.type(code.replace("-", "").toLowerCase()); // พิมพ์ตัวเล็กไม่มีขีด → จัดรูปให้เอง
  await expect(page.getByLabel(t("welcome.invite.label"))).toHaveValue(code);
  await tabTo(page, (e) => e.text === t("welcome.useEmail"), "use email");
  await page.keyboard.press("Enter");
  await tabTo(page, (e) => e.label === t("welcome.email.label"), "email field");
  await page.keyboard.type(email);
  const since = Date.now();
  await page.keyboard.press("Enter"); // Enter ในช่องอีเมล = ส่งรหัส
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("otp.title"));
  const { otp } = await waitForOtp(email, since);
  await expect(page.getByLabel(t("otp.label"))).toBeFocused(); // autoFocus
  await page.keyboard.type(otp);

  await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
  await tabTo(page, (e) => e.tag === "input" && e.label.includes(t("consent.ageCheckbox")), "age checkbox");
  await page.keyboard.press("Space");
  await tabTo(page, (e) => e.tag === "input" && e.label.includes(t("consent.checkbox")), "consent checkbox");
  await page.keyboard.press("Space");
  await tabTo(page, (e) => e.text === t("consent.agree"), "agree");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });
  await tabTo(page, (e) => e.label === t("onboarding.step1.weight"), "weight");
  await page.keyboard.type("72.5");
  await tabTo(page, (e) => e.label === t("onboarding.step1.height"), "height");
  await page.keyboard.type("168");
  await tabTo(page, (e) => e.label === t("onboarding.step1.birthYear"), "birth year");
  await page.keyboard.type("1990");
  await tabTo(page, (e) => e.text === t("onboarding.next"), "next");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("onboarding.step2.title"));
  // หลังเปลี่ยนขั้น โฟกัสอาจอยู่ท้ายหน้า → Shift+Tab ย้อนก็ได้ ใช้ Tab วนต่อ
  await tabTo(page, (e) => e.text === t("onboarding.place.kinds.park"), "place chip");
  await page.keyboard.press("Space");
  await expect(page.getByLabel(t("onboarding.place.name"))).toHaveValue(t("onboarding.place.kinds.park"));
  await tabTo(page, (e) => e.text === t("onboarding.start"), "start");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("nav.home"));
});
