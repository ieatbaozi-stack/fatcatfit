import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoHorizontalOverflow, msg, presetTheme, setLocale, TOKENS, waitForAuthReady } from "./helpers";
import { signUp, applySession, sql, userIdOf } from "./support/auth";
import { audit, contrast } from "./support/design-audit";

// จอใหม่ของ R1 เทียบ DESIGN.md / UX.md (contract เกณฑ์ 1 แถว "ปุ่ม ≥ 44px + คอนทราสต์ทั้งสองโหมด" · เกณฑ์ 14)
// ทุกจอ × สว่าง/มืด × TH/EN: คอนทราสต์ ≥ 4.5 · ฟอนต์ ≥ 14px · ปุ่ม/ลิงก์/ช่อง ≥ 44px · ไม่ล้นจอ · ส้มไม่เกินหนึ่งที่นอกแมว
// · ภาษาอังกฤษไม่มีตัวอักษรไทยหลุด · ภาพหน้าจอ: ดู SHOTS_DIR

test.use({ auth: "none" });

const THEMES = ["light", "dark"] as const;
const LOCALES = ["th", "en"] as const;
type L = (typeof LOCALES)[number];

type Screen = {
  name: string;
  /** พาไปจอนั้น (สร้างผู้ใช้เองถ้าต้องการ) */
  open: (page: Page, l: L, baseURL: string) => Promise<void>;
};

async function asUser(page: Page, baseURL: string, stage: "signed_in" | "consented" | "ready", l: L) {
  const u = await signUp(baseURL, { stage, locale: l });
  await applySession(page.context(), u);
  return u;
}

/** ผู้ใช้ที่ใช้งานอยู่แล้ว แต่ยินยอมไว้กับประกาศฉบับก่อน (R1.5) */
async function asExistingUser(page: Page, baseURL: string, l: L) {
  const u = await asUser(page, baseURL, "ready", l);
  await sql(`update consent_record set notice_version = '2000-01-01' where user_id = $1`, [await userIdOf(u.email)]);
  return u;
}

const SCREENS: Screen[] = [
  {
    name: "welcome",
    open: async (page, l) => {
      await page.goto("/welcome");
      await expect(page.getByRole("button", { name: msg(l, "welcome.useEmail") })).toBeVisible();
    },
  },
  {
    name: "welcome-email",
    open: async (page, l) => {
      await page.goto("/welcome");
      await page.getByRole("button", { name: msg(l, "welcome.useEmail") }).click();
      await page.getByLabel(msg(l, "welcome.email.label")).fill("bad");
      await page.getByRole("button", { name: msg(l, "welcome.email.send") }).click();
      await expect(page.getByText(msg(l, "welcome.email.invalid"))).toBeVisible();
    },
  },
  {
    name: "welcome-otp",
    open: async (page, l) => {
      await page.goto("/welcome");
      await page.getByRole("button", { name: msg(l, "welcome.useEmail") }).click();
      await page.getByLabel(msg(l, "welcome.email.label")).fill(`design-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
      await page.getByRole("button", { name: msg(l, "welcome.email.send") }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "otp.title"));
      await page.getByLabel(msg(l, "otp.label")).fill("000000");
      await expect(page.getByText(msg(l, "otp.wrong"))).toBeVisible();
    },
  },
  {
    name: "welcome-offline",
    open: async (page, l) => {
      await page.goto("/welcome");
      await page.context().setOffline(true);
      await expect(page.getByRole("button", { name: msg(l, "offline.signInClosed") })).toBeVisible();
    },
  },
  {
    name: "privacy",
    open: async (page, l) => {
      await page.goto("/privacy");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "privacy.title"));
    },
  },
  {
    name: "consent",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "signed_in", l);
      await page.goto("/consent");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "consent.title"));
    },
  },
  {
    name: "consent-checked",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "signed_in", l);
      await page.goto("/consent");
      await page.getByText(msg(l, "consent.ageCheckbox")).click();
      await page.getByText(msg(l, "consent.checkbox")).click();
      await expect(page.getByRole("button", { name: msg(l, "consent.agree") })).toBeEnabled();
    },
  },
  {
    name: "consent-decline",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "signed_in", l);
      await page.goto("/consent");
      await page.getByRole("button", { name: msg(l, "consent.decline") }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "consent.declineTitle"));
    },
  },
  {
    // R1.5 (boss 2026-11-20): ผู้ใช้เดิมที่ประกาศเปลี่ยนเวอร์ชันกด "ไม่ยินยอม" → หน้า 3 ทางเลือก
    name: "consent-existing-decline",
    open: async (page, l, baseURL) => {
      await asExistingUser(page, baseURL, l);
      await page.goto("/consent");
      await page.getByRole("button", { name: msg(l, "consent.decline") }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "consent.existing.title"));
    },
  },
  {
    name: "consent-existing-confirm",
    open: async (page, l, baseURL) => {
      await asExistingUser(page, baseURL, l);
      await page.goto("/consent");
      await page.getByRole("button", { name: msg(l, "consent.decline") }).click();
      await page.getByRole("button", { name: msg(l, "consent.existing.delete") }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "consent.existing.confirmTitle"));
    },
  },
  {
    name: "onboarding-1",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "consented", l);
      await page.goto("/onboarding");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "onboarding.step1.title"));
      const w = page.getByLabel(msg(l, "onboarding.step1.weight"), { exact: true });
      await w.fill("5");
      await w.blur();
      await expect(page.getByText(msg(l, "onboarding.errors.outOfRange"))).toBeVisible();
    },
  },
  {
    name: "onboarding-2",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "consented", l);
      await page.goto("/onboarding");
      await page.getByLabel(msg(l, "onboarding.step1.weight"), { exact: true }).fill("70");
      await page.getByLabel(msg(l, "onboarding.step1.height"), { exact: true }).fill("170");
      await page.getByLabel(msg(l, "onboarding.step1.birthYear"), { exact: true }).fill("1995");
      await page.getByRole("button", { name: msg(l, "onboarding.next") }).click();
      await page.getByRole("button", { name: msg(l, "onboarding.place.kinds.gym") }).click();
      await page.getByRole("button", { name: msg(l, "onboarding.goals.fitter") }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "onboarding.step2.title"));
    },
  },
  {
    name: "me-account",
    open: async (page, l, baseURL) => {
      const u = await asUser(page, baseURL, "ready", l);
      await page.goto("/me");
      await waitForAuthReady(page);
      await expect(page.getByText(u.email)).toBeVisible();
      await page.getByRole("heading", { name: msg(l, "account.title") }).scrollIntoViewIfNeeded();
    },
  },
  {
    name: "me-offline",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "ready", l);
      await page.goto("/me");
      await waitForAuthReady(page);
      await page.context().setOffline(true);
      await expect(page.getByText(msg(l, "account.needNet"))).toBeVisible();
    },
  },
  {
    name: "delete-confirm",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "ready", l);
      await page.goto("/me");
      await waitForAuthReady(page);
      await page.getByRole("button", { name: msg(l, "account.delete") }).click();
      await page.getByRole("dialog").getByText(msg(l, "account.deleteScreen.understand")).click();
    },
  },
  {
    name: "delete-done",
    open: async (page, l, baseURL) => {
      await asUser(page, baseURL, "ready", l);
      await page.goto("/me");
      await waitForAuthReady(page);
      await page.getByRole("button", { name: msg(l, "account.delete") }).click();
      const d = page.getByRole("dialog");
      await d.getByText(msg(l, "account.deleteScreen.understand")).click();
      await d.getByRole("button", { name: msg(l, "account.deleteScreen.confirm") }).click();
      await expect(d.getByRole("heading", { level: 1 })).toHaveText(msg(l, "account.deleteScreen.doneTitle"));
    },
  },
];


/** ภาพหน้าจอไว้ดูด้วยตา: ตั้ง SHOTS_DIR เป็นโฟลเดอร์นอก repo ในเครื่องตัวเองชั่วคราว (ห้าม commit ภาพ) */
const SHOTS_DIR: string | null = null;

async function shot(page: Page, info: TestInfo, name: string) {
  const dir = SHOTS_DIR;
  if (!dir) return;
  // จอเต็มซ้อน (dialog fixed) และแถบล่าง fixed: fullPage จะวาดผิดตำแหน่ง → เก็บเท่าจอ + เลื่อนลงสุดอีกภาพ
  const fixedOverlay = (await page.getByRole("dialog").count()) > 0;
  await page.screenshot({ path: path.join(dir, `${info.project.name}-${name}.png`), fullPage: !fixedOverlay });
  await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (d) d.scrollTop = d.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
  });
  await page.screenshot({ path: path.join(dir, `${info.project.name}-${name}-bottom.png`) });
}

for (const theme of THEMES) {
  for (const locale of LOCALES) {
    test.describe(`R1 จอใหม่ · ${theme} · ${locale}`, () => {
      test.beforeEach(async ({ page, context, baseURL }) => {
        await setLocale(context, baseURL!, locale);
        await presetTheme(page, theme);
      });

      for (const s of SCREENS) {
        test(`${s.name}: คอนทราสต์ · ฟอนต์ · ปุ่ม ≥ 44px · ไม่ล้นจอ · ส้ม ≤ 1 ที่ · ${locale === "en" ? "ไม่มีไทยหลุด" : "ภาษาไทย"}`, async ({ page, baseURL }, info) => {
          await s.open(page, locale, baseURL!);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
          expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(TOKENS[theme].paper);
          await expectNoHorizontalOverflow(page);
          const a = await audit(page);
          await shot(page, info, `${s.name}-${theme}-${locale}`);

          const problems: string[] = [];
          for (const t of a.texts) {
            if (t.size < 14) problems.push(`font < 14px: "${t.text}" ${t.size}px`);
            if (!t.disabled) {
              const ratio = contrast(t.color, t.bg);
              if (ratio < 4.5) problems.push(`contrast ${ratio.toFixed(2)}: "${t.text}" ${t.color} on ${t.bg} (${t.cls})`);
            }
          }
          expect(problems, "text").toEqual([]);
          expect(a.small, "touch targets < 44px").toEqual([]);
          // "ส้มที่เดียวต่อจอ" (DESIGN): นับ element ส้มนอกตัวแมว — ยอมให้เป็นชิ้นเดียว (เช่นเส้นความคืบหน้า หรือช่องติ๊กที่ติ๊กแล้ว)
          expect(a.orange.length, `orange outside the cat: ${a.orange.join(" | ")}`).toBeLessThanOrEqual(1);
          if (locale === "en") {
            const thai = a.visibleText.match(/[฀-๿][^\n]{0,30}/g) ?? [];
            expect(thai, "Thai text on an English screen").toEqual([]);
          }
        });
      }
    });
  }
}

test.describe("ป้ายแท็บที่ซูม 200% (งานค้าง R0 · เกณฑ์ 15)", () => {
  test.use({ auth: "ready" });
  for (const locale of LOCALES) {
    test(`${locale}: ตัวอักษร 200% (root font-size) ที่จอ 390px และจอคอม 1280 ซูม 200% (= 640px) → ป้ายบรรทัดเดียว ไม่ล้น`, async ({ page, context, baseURL }) => {
      await setLocale(context, baseURL!, locale);
      for (const [width, fontScale] of [
        [390, 2],
        [640, 1],
        [320, 1],
      ] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/progress");
        if (fontScale !== 1) await page.addStyleTag({ content: `html{font-size:${fontScale * 100}% !important}` });
        await page.waitForTimeout(200);
        await expectNoHorizontalOverflow(page);
        const labels = await page.evaluate(() =>
          Array.from(document.querySelectorAll("nav a span")).map((s) => {
            const cs = getComputedStyle(s);
            const r = s.getBoundingClientRect();
            const link = s.closest("a")!.getBoundingClientRect();
            return { text: s.textContent, lines: Math.round(r.height / parseFloat(cs.lineHeight)), fits: r.left >= link.left - 0.5 && r.right <= link.right + 0.5, name: s.closest("a")!.getAttribute("aria-label") };
          }),
        );
        expect(labels).toHaveLength(4);
        for (const l of labels) {
          expect(l.lines, `${l.text} at ${width}px ×${fontScale}`).toBe(1);
          expect(l.fits, `${l.text} fits at ${width}px ×${fontScale}`).toBe(true);
          expect(l.name, "full tab name stays available to screen readers").toBe(l.text);
        }
      }
    });
  }

  // BUG R1-QA-3: R1 ใส่ `truncate` (overflow:hidden) ให้ป้ายแท็บเพื่อแก้ซูม 200% → เส้นใต้ wavy ของแท็บที่เลือก
  // (text-underline-offset 5px อยู่นอกกล่องบรรทัด) ถูกตัดเหลือแค่จุด · สถานะแท็บที่เลือกต้องไม่พึ่งสีอย่างเดียว
  test("BUG R1-QA-3: เส้นใต้ของแท็บที่เลือกไม่ถูกตัด", async ({ page }) => {
    await page.goto("/me");
    const clip = await page.evaluate(() => {
      const s = document.querySelector('nav a[aria-current="page"] span')!;
      const cs = getComputedStyle(s);
      const clips = cs.overflowY !== "visible";
      const room = parseFloat(cs.paddingBottom) - parseFloat(cs.textUnderlineOffset) - 3; // เส้น wavy สูงราว 3px
      return { clips, room, overflowY: cs.overflowY };
    });
    expect(!clip.clips || clip.room >= 0, JSON.stringify(clip)).toBe(true);
  });
});
