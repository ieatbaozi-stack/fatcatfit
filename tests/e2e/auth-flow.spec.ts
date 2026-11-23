import type { BrowserContext, Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { msg, waitForAuthReady, waitForServiceWorker } from "./helpers";
import { mailsTo, newInvite, randomIp, residue, signInViaUi, signUp, sql, uniqueEmail, userIdOf, applySession, waitForOtp } from "./support/auth";

// R1 (R1_AUTH_CONTRACT.md · ADR 0006) — flow บัญชีจริงทั้งเส้นบนจอมือถือและจอคอม 1280px
// ทุกเทสต์ในไฟล์นี้เริ่มแบบไม่ล็อกอิน และสร้างผู้ใช้ของตัวเอง (อีเมล @example.com ไม่ซ้ำกัน)

test.use({ auth: "none" });

const SETUP_AND_APP = ["/", "/history", "/progress", "/me", "/consent", "/onboarding"] as const;

/** ดูทุกคำขอของ context — ใช้ยืนยันว่าโค้ดเชิญไม่เคยอยู่ใน URL ใดเลย (ADR 0006 เทสต์ 8) */
function recordRequests(context: BrowserContext): string[] {
  const urls: string[] = [];
  context.on("request", (r: Request) => urls.push(r.url()));
  return urls;
}

async function fillOnboarding(page: Page, opts: { weight?: string; unit?: "metric" | "imperial" } = {}) {
  await expect(page).toHaveURL(/\/onboarding$/);
  if (opts.unit === "imperial") await page.getByRole("button", { name: msg("th", "onboarding.units.imperial") }).click();
  await page.getByLabel(msg("th", "onboarding.step1.weight"), { exact: true }).fill(opts.weight ?? "70");
  await page.getByLabel(msg("th", "onboarding.step1.height"), { exact: true }).fill(opts.unit === "imperial" ? "67" : "170");
  await page.getByLabel(msg("th", "onboarding.step1.birthYear"), { exact: true }).fill("1995");
  await page.getByRole("button", { name: msg("th", "onboarding.next") }).click();
  await page.getByRole("button", { name: msg("th", "onboarding.place.kinds.home") }).click();
  await expect(page.getByLabel(msg("th", "onboarding.place.name"))).toHaveValue(msg("th", "onboarding.place.kinds.home"));
}

/** กดแถว "ออกจากระบบ" แล้วยืนยันในแผ่น (CR2) */
async function confirmSignOut(page: Page) {
  await page.getByRole("button", { name: msg("th", "account.signOut") }).click();
  const dialog = page.getByRole("dialog", { name: msg("th", "account.signOutSheet.title") });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: msg("th", "account.signOutSheet.confirm") }).click();
}

async function cachedPages(page: Page) {
  return page.evaluate(async () => {
    const out: { url: string; body: string }[] = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith("fcf-pages")) continue;
      const c = await caches.open(name);
      for (const req of await c.keys()) out.push({ url: req.url, body: (await (await c.match(req))?.text()) ?? "" });
    }
    return out;
  });
}

/** ADR 0006 เทสต์ 5: ใน fcf-pages ไม่มี key ที่มี ? หรือ # · ไม่มีหน้า redirect · ไม่มีอีเมล/ชื่อ/โค้ดเชิญ */
async function expectCleanPageCache(page: Page, secrets: string[]) {
  const pages = await cachedPages(page);
  for (const p of pages) {
    expect(p.url, "cache key without query/hash").not.toMatch(/[?#]/);
    expect(p.body, `${p.url} is not a redirect page`).not.toContain("__next-page-redirect");
    for (const s of secrets) expect(p.body.toLowerCase(), `${p.url} must not contain ${s}`).not.toContain(s.toLowerCase());
  }
  return pages;
}

test.describe("ADR 0006 เทสต์ 1: เซิร์ฟเวอร์ตรวจแค่ cookie", () => {
  test("ไม่มี cookie → 307 ไป /welcome ทุกหน้าแอป/ตั้งค่า · /welcome และ /privacy ตอบ 200", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    for (const path of SETUP_AND_APP) {
      const res = await api.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(new URL(res.headers()["location"], baseURL).pathname, path).toBe("/welcome");
    }
    expect((await api.get("/welcome", { maxRedirects: 0 })).status()).toBe(200);
    expect((await api.get("/privacy", { maxRedirects: 0 })).status()).toBe(200);
    await api.dispose();
  });

  test("มี cookie → /welcome ยังตอบ 200 (HTML เดียวกันทุกสถานะ) และหน้าแอปไม่ redirect", async ({ playwright, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    const res = await u.api.get("/welcome", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(await res.text(), "welcome HTML has no personal data").not.toContain(u.email);
    for (const path of ["/", "/me"]) {
      const r = await u.api.get(path, { maxRedirects: 0 });
      expect(r.status(), path).toBe(200);
      expect(await r.text(), `${path} HTML has no email`).not.toContain(u.email);
    }
    // cookie ปลอม: เซิร์ฟเวอร์ไม่ตรวจความถูกต้อง (ADR) แต่ API ต้องตอบ 401
    const fake = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { cookie: "better-auth.session_token=forged.value" } });
    expect((await fake.get("/", { maxRedirects: 0 })).status()).toBe(200);
    expect((await fake.get("/api/me")).status()).toBe(401);
    await fake.dispose();
    await u.api.dispose();
  });

  test("cookie ปลอมเปิด / ในเบราว์เซอร์ → AuthGate ถาม /api/me ได้ 401 → พาไป /welcome", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "better-auth.session_token", value: "forged.value", url: baseURL! }]);
    await page.goto("/me");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "welcome.title"));
  });
});

test.describe("สมัครด้วยลิงก์เชิญ → OTP → ยินยอม → แบบสอบถาม → หน้าหลัก", () => {
  test("ทางหลักครบเส้น + ลิงก์ #invite= เติมช่องแล้วหายจาก URL + ไม่มีโค้ดใน URL ของคำขอใด", async ({ page, context }) => {
    const urls = recordRequests(context);
    const code = await newInvite();
    const email = uniqueEmail("flow");
    await page.goto(`/welcome#invite=${code}`);
    const inviteField = page.getByLabel(msg("th", "welcome.invite.label"));
    await expect(inviteField).toHaveValue(code);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    expect(page.url()).not.toContain(code);

    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await expect(page.getByText(msg("th", "welcome.email.inviteSummary").replace("{code}", code))).toBeVisible();
    await page.getByLabel(msg("th", "welcome.email.label")).fill(email);
    const since = Date.now();
    await page.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "otp.title"));
    const { otp, mail } = await waitForOtp(email, since);
    // อีเมล OTP: สองภาษา (ไทยก่อน) ไม่มีลิงก์ มีแต่รหัส
    expect(mail.subject).toBe("รหัส OTP เข้าสู่ระบบ Fat Cat Fit / Your Fat Cat Fit sign-in code (OTP)");
    expect(mail.text).not.toMatch(/https?:\/\//);
    await expect(page.getByLabel(msg("th", "otp.label"))).toHaveAttribute("autocomplete", "one-time-code");
    await page.getByLabel(msg("th", "otp.label")).fill(otp); // ครบ 6 หลักส่งเอง ไม่ต้องกดปุ่ม

    await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
    const agree = page.getByRole("button", { name: msg("th", "consent.agree") });
    await expect(agree).toBeDisabled(); // ช่องติ๊กไม่ติ๊กไว้ให้
    await page.getByText(msg("th", "consent.ageCheckbox")).click();
    await page.getByText(msg("th", "consent.checkbox")).click();
    await agree.click();

    await fillOnboarding(page);
    await page.getByRole("button", { name: msg("th", "onboarding.start") }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "nav.home"));
    await expect(page.getByRole("navigation", { name: msg("th", "nav.label") }).getByRole("link")).toHaveCount(4);
    await waitForAuthReady(page);

    // ข้อมูลที่บันทึก: consent 1 แถว (เวอร์ชัน + locale) · profile + place + body_entry อย่างละ 1
    const id = await userIdOf(email);
    expect(id).not.toBeNull();
    const consent = await sql<{ notice_version: string; locale: string }>(`select * from consent_record where user_id = $1`, [id]);
    expect(consent).toHaveLength(1);
    expect(consent[0].locale).toBe("th");
    const r = await residue(id!, email);
    expect(r.profile).toBe(1);
    expect(r.place).toBe(1);
    expect(r.body_entry).toBe(1);
    const profile = await sql<{ locale: string }>(`select locale from profile where user_id = $1`, [id]);
    expect(profile[0].locale).toBe("th"); // D2: เก็บภาษาตอนสมัครไว้ใช้กับอีเมล OTP

    // session 90 วัน (เกณฑ์ 6)
    const session = (await context.cookies()).find((c) => c.name.endsWith("session_token"))!;
    const days = (session.expires * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThanOrEqual(90.01);
    expect(session.httpOnly).toBe(true);

    // ADR 0006 เทสต์ 8: ไม่มีคำขอใดมีโค้ดเชิญใน URL (รูปมีขีดและไม่มีขีด)
    const raw = code.replace("-", "");
    expect(urls.filter((u) => u.includes(code) || u.toUpperCase().includes(raw))).toEqual([]);
    // ADR 0006 เทสต์ 5 (ล็อกอินครบ)
    await waitForServiceWorker(page);
    await expectCleanPageCache(page, [email, code, raw]);
  });

  test("ปิดเบราว์เซอร์แล้วเปิดใหม่ (context ใหม่ cookie เดิม) → ยังล็อกอิน เข้าหน้าหลักได้ทันที", async ({ browser, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    const ctx = await browser.newContext({ baseURL });
    await applySession(ctx, u);
    const page = await ctx.newPage();
    await page.goto("/");
    await waitForAuthReady(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "nav.home"));
    await ctx.close();
    await u.api.dispose();
  });

  test("บัญชีเดิมเข้าใหม่ด้วย OTP โดยไม่ใส่โค้ด → ขอถี่เกิน (ภายใน 60 วิ) เห็น \"รอ mm:ss\" → พ้นเวลาแล้วเข้าได้ · ไม่เกิด user ซ้ำ", async ({ page, baseURL }) => {
    test.setTimeout(150_000);
    const u = await signUp(baseURL!, { stage: "ready" });
    const sentAt = Date.now();
    const before = await sql<{ n: number }>(`select count(*)::int as n from "user" where lower(email) = lower($1)`, [u.email]);
    // ส่งซ้ำภายใน 60 วิ → 429 + ข้อความพร้อมเวลารอ (ADR 0002 ข้อ 3 แถว "ต่ออีเมล ห่าง ≥ 60 วิ")
    await page.goto("/welcome");
    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await page.getByLabel(msg("th", "welcome.email.label")).fill(u.email);
    await page.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
    await expect(page.getByText(/ขอรหัสถี่ไปหน่อย · ลองใหม่ใน \d+:\d\d/)).toBeVisible();
    await page.waitForTimeout(Math.max(0, sentAt + 61_000 - Date.now()));
    await signInViaUi(page, u.email, {});
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await waitForAuthReady(page);
    const after = await sql<{ n: number }>(`select count(*)::int as n from "user" where lower(email) = lower($1)`, [u.email]);
    expect(after[0].n).toBe(before[0].n);
    expect(after[0].n).toBe(1);
    await u.api.dispose();
  });

  test("EN: เบราว์เซอร์ภาษาอังกฤษ → จอทุกขั้นเป็นอังกฤษ + อีเมล OTP เป็นอังกฤษ + บันทึก locale en", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
    const code = await newInvite();
    const email = uniqueEmail("en");
    await page.goto(`/welcome#invite=${code}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "welcome.title"));
    await page.getByRole("button", { name: msg("en", "welcome.useEmail") }).click();
    await page.getByLabel(msg("en", "welcome.email.label")).fill(email);
    const since = Date.now();
    await page.getByRole("button", { name: msg("en", "welcome.email.send") }).click();
    const { otp, mail } = await waitForOtp(email, since);
    expect(mail.subject).toBe("รหัส OTP เข้าสู่ระบบ Fat Cat Fit / Your Fat Cat Fit sign-in code (OTP)");
    expect(mail.text.indexOf("Your one-time sign-in code (OTP) is")).toBeLessThan(mail.text.indexOf("รหัส OTP ของคุณอยู่ด้านบน"));
    await page.getByLabel(msg("en", "otp.label")).fill(otp);
    await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "consent.title"));
    await page.getByText(msg("en", "consent.ageCheckbox")).click();
    await page.getByText(msg("en", "consent.checkbox")).click();
    await page.getByRole("button", { name: msg("en", "consent.agree") }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("en", "onboarding.step1.title"));
    const id = (await userIdOf(email))!;
    const c = await sql<{ locale: string }>(`select locale from consent_record where user_id = $1`, [id]);
    expect(c[0].locale).toBe("en");
  });
});

test.describe("โค้ดเชิญผิด / ไม่มี (เกณฑ์ 2, 3)", () => {
  for (const kind of ["ผิดรูป", "ไม่มีในระบบ", "ถูกยกเลิก"] as const) {
    test(`โค้ด${kind} → "โค้ดนี้ใช้ไม่ได้" ข้อความเดียวกัน · ไม่ส่งเมล · ไม่เกิด user`, async ({ page }) => {
      const code = kind === "ผิดรูป" ? "AB" : kind === "ไม่มีในระบบ" ? "ZZZZ-ZZZZ" : await newInvite({ revoke: true });
      const email = uniqueEmail("badinvite");
      await page.goto("/welcome");
      await page.getByLabel(msg("th", "welcome.invite.label")).fill(code);
      await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
      await page.getByLabel(msg("th", "welcome.email.label")).fill(email);
      await page.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
      await expect(page.getByText(msg("th", "welcome.invite.invalid"))).toBeVisible();
      await page.waitForTimeout(500);
      expect(await mailsTo(email)).toEqual([]);
      expect(await userIdOf(email)).toBeNull();
    });
  }

  test("ไม่มีโค้ด + อีเมลใหม่ → UI ไปขั้นรหัสเหมือนส่งจริง แต่ไม่มีเมลถูกส่ง · ใส่รหัสอะไรก็ \"รหัสไม่ตรง\" · ไม่เกิด user", async ({ page }) => {
    const email = uniqueEmail("noinvite");
    await page.goto("/welcome");
    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await expect(page.getByText(msg("th", "welcome.email.noInvite"))).toBeVisible();
    await page.getByLabel(msg("th", "welcome.email.label")).fill(email);
    await page.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "otp.title"));
    await page.waitForTimeout(1500);
    expect(await mailsTo(email), "no email sent to an address without account and invite").toEqual([]);
    await page.getByLabel(msg("th", "otp.label")).fill("123456");
    await expect(page.getByText(msg("th", "otp.wrong"))).toBeVisible();
    await expect(page.getByLabel(msg("th", "otp.label"))).toHaveValue("");
    expect(await userIdOf(email)).toBeNull();
    const v = await sql<{ n: number }>(`select count(*)::int as n from verification where identifier like '%' || $1 || '%'`, [email.toLowerCase()]);
    expect(v[0].n, "no OTP row created").toBe(0);
  });

  test("โค้ดใช้ครบแล้ว (max_uses = 1) → คนที่สองสมัครไม่ได้", async ({ page, baseURL }) => {
    const code = await newInvite({ maxUses: 1 });
    const first = uniqueEmail("one");
    await signInViaUi(page, first, { invite: code });
    await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
    const ctx2 = await page.context().browser()!.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    const p2 = await ctx2.newPage();
    const second = uniqueEmail("two");
    await p2.goto("/welcome");
    await p2.getByLabel(msg("th", "welcome.invite.label")).fill(code);
    await p2.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await p2.getByLabel(msg("th", "welcome.email.label")).fill(second);
    await p2.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
    await expect(p2.getByText(msg("th", "welcome.invite.invalid"))).toBeVisible();
    expect(await mailsTo(second)).toEqual([]);
    expect(await userIdOf(second)).toBeNull();
    await ctx2.close();
  });

  test("รหัส OTP ผิด → \"รหัสไม่ตรง\" ช่องถูกล้าง โฟกัสกลับ · รหัสถูกหลังจากนั้นยังเข้าได้", async ({ page }) => {
    const code = await newInvite();
    const email = uniqueEmail("wrongotp");
    await page.goto("/welcome");
    await page.getByLabel(msg("th", "welcome.invite.label")).fill(code);
    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await page.getByLabel(msg("th", "welcome.email.label")).fill(email);
    const since = Date.now();
    await page.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
    const { otp } = await waitForOtp(email, since);
    const wrong = otp === "000000" ? "111111" : "000000";
    const input = page.getByLabel(msg("th", "otp.label"));
    await input.fill(wrong);
    await expect(page.getByText(msg("th", "otp.wrong"))).toBeVisible();
    await expect(input).toHaveValue("");
    await input.fill(otp);
    await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
  });

  // บั๊กที่ qa-test พบ (รายงาน Lead ใน R1 ขั้น 5): otp-panel.tsx เรียก inputRef.focus() ตอนช่องยัง disabled (ก่อน React render ใหม่)
  // → โฟกัสไม่กลับ · บนมือถือคีย์บอร์ดหุบ ต้องแตะช่องใหม่ · test.fail = คาดว่าล้มจนกว่าจะแก้ (แก้แล้วเทสต์นี้จะแดง ให้ลบ test.fail ออก)
  test("BUG R1-QA-1: รหัสผิดแล้วโฟกัสกลับไปที่ช่องรหัส", async ({ page }) => {
    const code = await newInvite();
    const email = uniqueEmail("focus");
    await page.goto(`/welcome#invite=${code}`);
    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await page.getByLabel(msg("th", "welcome.email.label")).fill(email);
    const since = Date.now();
    await page.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
    const { otp } = await waitForOtp(email, since);
    const input = page.getByLabel(msg("th", "otp.label"));
    await input.fill(otp === "000000" ? "111111" : "000000");
    await expect(page.getByText(msg("th", "otp.wrong"))).toBeVisible();
    await expect(input).toBeFocused({ timeout: 3_000 });
  });
});

test.describe("ไม่ยินยอม / ออกจากระบบ / ลบบัญชี", () => {
  test("ไม่ยินยอม → อธิบายว่าใช้แอปไม่ได้ → ออกจากระบบและลบบัญชี → ไม่เหลือข้อมูล · กลับจอยินดีต้อนรับ", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "signed_in" });
    const id = (await userIdOf(u.email))!;
    await applySession(context, u);
    await page.goto("/");
    await expect(page).toHaveURL(/\/consent$/);
    // API ข้อมูลกั้นด้วย consent (เกณฑ์ 7)
    const blocked = await page.evaluate(async () => {
      const r = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      return { status: r.status, body: await r.json() };
    });
    expect(blocked).toEqual({ status: 403, body: { code: "consent_required" } });

    await page.getByRole("button", { name: msg("th", "consent.decline") }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "consent.declineTitle"));
    await page.getByRole("button", { name: msg("th", "consent.declineConfirm") }).click();
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
    const left = await residue(id, u.email);
    expect(Object.values(left).every((n) => n === 0), JSON.stringify(left)).toBe(true);
    expect((await u.api.get("/api/me")).status()).toBe(401);
    await u.api.dispose();
  });

  test("ออกจากระบบ → session ใช้ไม่ได้ · cache หน้าของผู้ใช้ถูกล้าง · hint ถูกล้าง · ช่องโค้ดเชิญซ่อน (เครื่องที่เคยเข้า)", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    await applySession(context, u);
    await page.goto("/");
    await waitForServiceWorker(page);
    for (const p of ["/history", "/progress", "/me"]) await page.goto(p);
    await waitForAuthReady(page);
    await expect(page.getByText(u.email)).toBeVisible();
    await expect.poll(async () => (await cachedPages(page)).map((p) => new URL(p.url).pathname).sort(), { timeout: 20_000 }).toEqual(
      expect.arrayContaining(["/", "/history", "/me", "/progress"]),
    );
    await expectCleanPageCache(page, [u.email]);

    await confirmSignOut(page);
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
    // cookie เดิมใช้ไม่ได้แล้ว (session ถูกเพิกถอนที่เซิร์ฟเวอร์ ไม่ใช่แค่ลบ cookie ในเบราว์เซอร์)
    expect((await u.api.get("/api/me")).status()).toBe(401);
    expect(await page.evaluate(() => localStorage.getItem("fcf:auth"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("fcf:known-device"))).toBe("1");
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toHaveCount(0);
    // หลังออก: หน้าแอปที่อยู่ใน cache (ถ้า SW เติมกลับ) ต้องเป็นของคนไม่ล็อกอิน — ไม่มีอีเมล
    await page.waitForTimeout(1500);
    const after = await expectCleanPageCache(page, [u.email]);
    expect(after.map((p) => new URL(p.url).pathname)).toContain("/welcome");
    await page.goto("/me");
    await expect(page).toHaveURL(/\/welcome$/);
    await u.api.dispose();
  });

  test("CR2: ออกจากระบบต้องยืนยัน · ยกเลิก/Esc/แตะพื้นหลัง = ยังอยู่ในระบบ โฟกัสกลับแถว · ยืนยัน = /welcome", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    await applySession(context, u);
    await page.goto("/me");
    await waitForAuthReady(page);
    const row = page.getByRole("button", { name: msg("th", "account.signOut") });
    const dialog = page.getByRole("dialog", { name: msg("th", "account.signOutSheet.title") });
    const signOuts: string[] = [];
    page.on("request", (r) => r.url().includes("/api/auth/sign-out") && signOuts.push(r.method()));

    await row.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(msg("th", "account.signOutSheet.body"))).toBeVisible();
    await dialog.getByRole("button", { name: msg("th", "account.signOutSheet.cancel") }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();

    await row.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();

    await row.click();
    await page.mouse.click(10, 10); // พื้นมืดเหนือแผ่น
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();

    expect(signOuts).toEqual([]);
    expect((await u.api.get("/api/me")).status()).toBe(200);
    await expect(page).toHaveURL(/\/me$/);

    await confirmSignOut(page);
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
    expect((await u.api.get("/api/me")).status()).toBe(401);
    await u.api.dispose();
  });

  test("CR2: กดยืนยันซ้ำระหว่างรอ = ส่งคำขอเดียว · ปุ่มขึ้น 'กำลังออก…'", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    await applySession(context, u);
    await page.goto("/me");
    await waitForAuthReady(page);
    let count = 0;
    await page.route("**/api/auth/sign-out", async (r) => {
      count++;
      await new Promise((res) => setTimeout(res, 1500));
      await r.continue();
    });
    await page.getByRole("button", { name: msg("th", "account.signOut") }).click();
    const dialog = page.getByRole("dialog", { name: msg("th", "account.signOutSheet.title") });
    await dialog.getByRole("button", { name: msg("th", "account.signOutSheet.confirm") }).dblclick();
    await expect(dialog.getByRole("button", { name: msg("th", "account.signingOut") })).toBeVisible();
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
    expect(count).toBe(1);
    await u.api.dispose();
  });

  test("ลบบัญชี: ปุ่มลบกดไม่ได้จนกว่าจะติ๊ก · ลบแล้วไม่เหลือแถวใดของคนนั้น · session ใช้ไม่ได้ · กลับหน้าแรกเห็นช่องโค้ดเชิญ", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    const other = await signUp(baseURL!, { stage: "ready" });
    const id = (await userIdOf(u.email))!;
    await applySession(context, u);
    await page.goto("/me");
    await waitForAuthReady(page);
    expect(Object.values(await residue(id, u.email)).some((n) => n > 0)).toBe(true);

    await page.getByRole("button", { name: msg("th", "account.delete") }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 1 })).toHaveText(msg("th", "account.deleteScreen.title"));
    const confirm = dialog.getByRole("button", { name: msg("th", "account.deleteScreen.confirm") });
    await expect(confirm).toBeDisabled();
    // ยกเลิกได้ ไม่ลบอะไร
    await dialog.getByRole("button", { name: msg("th", "account.deleteScreen.cancel") }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await u.api.get("/api/me")).status()).toBe(200);

    await page.getByRole("button", { name: msg("th", "account.delete") }).click();
    await dialog.getByText(msg("th", "account.deleteScreen.understand")).click();
    await expect(confirm).toBeEnabled();
    await confirm.dblclick(); // กดซ้ำเร็วๆ ต้องไม่พัง
    await expect(dialog.getByRole("heading", { level: 1 })).toHaveText(msg("th", "account.deleteScreen.doneTitle"), { timeout: 15_000 });

    const left = await residue(id, u.email);
    expect(Object.values(left).every((n) => n === 0), JSON.stringify(left)).toBe(true);
    expect((await u.api.get("/api/me")).status()).toBe(401);
    // ผู้ใช้อื่นไม่ถูกแตะ
    expect((await other.api.get("/api/me")).status()).toBe(200);
    expect(await page.evaluate(() => [localStorage.getItem("fcf:auth"), localStorage.getItem("fcf:known-device")])).toEqual([null, null]);

    await dialog.getByRole("button", { name: msg("th", "account.deleteScreen.doneButton") }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toBeVisible();
    await u.api.dispose();
    await other.api.dispose();
  });
});

test.describe("แบบสอบถาม (เกณฑ์ 9)", () => {
  test("ช่องบังคับว่าง → ไปต่อไม่ได้ · ค่าเกินช่วงบอกใต้ช่อง · ส่งไม่สำเร็จค่ายังอยู่และลองใหม่ได้ · กดซ้ำไม่เกิดแถวซ้ำ", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "consented" });
    const id = (await userIdOf(u.email))!;
    await applySession(context, u);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding$/);
    const next = page.getByRole("button", { name: msg("th", "onboarding.next") });
    await expect(next).toBeDisabled();

    const weight = page.getByLabel(msg("th", "onboarding.step1.weight"), { exact: true });
    await weight.fill("5");
    await weight.blur();
    await expect(page.getByText(msg("th", "onboarding.errors.outOfRange"))).toBeVisible();
    await weight.fill("-70");
    await weight.blur();
    await expect(next).toBeDisabled();
    await weight.fill("70.5");
    await page.getByLabel(msg("th", "onboarding.step1.height"), { exact: true }).fill("170");
    await page.getByLabel(msg("th", "onboarding.step1.birthYear"), { exact: true }).fill("1800");
    await page.getByLabel(msg("th", "onboarding.step1.birthYear"), { exact: true }).blur();
    await expect(next).toBeDisabled();
    await page.getByLabel(msg("th", "onboarding.step1.birthYear"), { exact: true }).fill("1995");
    await next.click();
    const start = page.getByRole("button", { name: msg("th", "onboarding.start") });
    await expect(start).toBeDisabled(); // ยังไม่มีชื่อสถานที่
    await page.getByLabel(msg("th", "onboarding.place.name")).fill("ยิม ABC");

    // ส่งครั้งแรกล้ม (เซิร์ฟเวอร์ตอบ 500) → ข้อความ + ค่ายังอยู่
    let calls = 0;
    await page.route("**/api/onboarding", async (route) => {
      calls += 1;
      if (calls === 1) await route.fulfill({ status: 500, contentType: "application/json", body: '{"code":"server_error"}' });
      else await route.continue();
    });
    await start.click();
    await expect(page.getByText(msg("th", "onboarding.saveFailed"))).toBeVisible();
    await expect(page.getByLabel(msg("th", "onboarding.place.name"))).toHaveValue("ยิม ABC");
    await page.getByRole("button", { name: msg("th", "onboarding.back") }).click();
    await expect(page.getByLabel(msg("th", "onboarding.step1.weight"), { exact: true })).toHaveValue("70.5");
    await page.getByRole("button", { name: msg("th", "onboarding.next") }).click();
    await page.getByRole("button", { name: msg("th", "onboarding.retry") }).dblclick();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    const r = await residue(id, u.email);
    expect([r.profile, r.place, r.body_entry]).toEqual([1, 1, 1]);
    const w = await sql<{ weight_kg: number }>(`select weight_kg from body_entry where user_id = $1`, [id]);
    expect(w[0].weight_kg).toBeCloseTo(70.5, 5);
    await u.api.dispose();
  });

  test("หน่วย lb · in → เก็บเป็น kg · m ถูกต้อง", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "consented" });
    const id = (await userIdOf(u.email))!;
    await applySession(context, u);
    await page.goto("/onboarding");
    await fillOnboarding(page, { unit: "imperial", weight: "154" });
    await page.getByRole("button", { name: msg("th", "onboarding.start") }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    const b = await sql<{ weight_kg: number; weight_input: number; weight_unit: string }>(`select * from body_entry where user_id = $1`, [id]);
    expect(b[0].weight_unit).toBe("lb");
    expect(b[0].weight_input).toBe(154);
    expect(b[0].weight_kg).toBeCloseTo(154 * 0.45359237, 4);
    const p = await sql<{ height_m: number; height_unit: string }>(`select height_m, height_unit from profile where user_id = $1`, [id]);
    expect(p[0].height_unit).toBe("in");
    expect(p[0].height_m).toBeCloseTo(67 * 0.0254, 4);
    await u.api.dispose();
  });

  test("ออฟไลน์ตอนจะส่ง → ปุ่มเริ่มใช้กดไม่ได้ + แถบเน็ตหลุด · กลับมาออนไลน์ส่งได้", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "consented" });
    await applySession(context, u);
    await page.goto("/onboarding");
    await fillOnboarding(page);
    await context.setOffline(true);
    const start = page.getByRole("button", { name: msg("th", "onboarding.start") });
    await expect(start).toBeDisabled();
    await expect(page.getByText(msg("th", "offline.bar"))).toBeVisible();
    await context.setOffline(false);
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await u.api.dispose();
  });
});

test.describe("ออฟไลน์ก่อนล็อกอิน (เกณฑ์ 13 · ADR 0006 เทสต์ 3, 4)", () => {
  async function expectOfflineWelcome(page: Page) {
    await expect(page.getByRole("button", { name: msg("th", "offline.signInClosed") })).toBeDisabled();
    await expect(page.locator('[data-pose="offline"]')).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/\bOffline\b/);
  }

  test("เปิด /welcome ออนไลน์ครั้งเดียว → ออฟไลน์ → เปิด / → จอยินดีต้อนรับแบบออฟไลน์ (ไม่ใช่ 503)", async ({ page, context }) => {
    await page.goto("/welcome");
    await waitForServiceWorker(page);
    await expect.poll(async () => (await cachedPages(page)).map((p) => new URL(p.url).pathname), { timeout: 20_000 }).toContain("/welcome");
    await page.close();
    await context.setOffline(true);
    const app = await context.newPage();
    const res = await app.goto("/");
    expect(res?.status()).not.toBe(503);
    await expectOfflineWelcome(app);
    for (const path of ["/me", "/welcome"]) {
      await app.goto(path);
      await expectOfflineWelcome(app);
    }
  });

  test("ล็อกอินครบ → ออกจากระบบ → ออฟไลน์ → เปิด / → จอยินดีต้อนรับแบบออฟไลน์", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    await applySession(context, u);
    await page.goto("/me");
    await waitForServiceWorker(page);
    await waitForAuthReady(page);
    await confirmSignOut(page);
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
    await expect.poll(async () => (await cachedPages(page)).map((p) => new URL(p.url).pathname), { timeout: 20_000 }).toContain("/welcome");
    await page.close();
    await context.setOffline(true);
    const app = await context.newPage();
    const res = await app.goto("/");
    expect(res?.status()).not.toBe(503);
    await expectOfflineWelcome(app);
    await u.api.dispose();
  });

  test("ADR เทสต์ 4: ล็อกอินครบ → ออฟไลน์ → เปิดทุกแท็บได้หน้าแอป", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "ready" });
    await applySession(context, u);
    await page.goto("/");
    await waitForServiceWorker(page);
    await waitForAuthReady(page);
    for (const p of ["/history", "/progress", "/me"]) await page.goto(p);
    await expect.poll(async () => (await cachedPages(page)).map((p) => new URL(p.url).pathname).sort(), { timeout: 20_000 }).toEqual(
      expect.arrayContaining(["/", "/history", "/me", "/progress"]),
    );
    await context.setOffline(true);
    for (const [path, key] of [["/", "home"], ["/history", "history"], ["/progress", "progress"], ["/me", "me"]] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", `nav.${key}`));
      await expect(page.getByText(msg("th", "offline.bar"))).toBeVisible();
    }
    await u.api.dispose();
  });

  test("ADR เทสต์ 4: ยังไม่กรอกแบบสอบถาม → ออฟไลน์เปิด / → จอยินดีต้อนรับแบบออฟไลน์ ไม่วน", async ({ page, context, baseURL }) => {
    const u = await signUp(baseURL!, { stage: "consented" });
    await applySession(context, u);
    await page.goto("/");
    await waitForServiceWorker(page);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/onboarding$/);
    await context.setOffline(true);
    await page.goto("/");
    await expectOfflineWelcome(page);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/$/); // ไม่ถูกพาไปไหน (ออฟไลน์ไม่เปลี่ยนหน้า)
    await expectCleanPageCache(page, [u.email]);
    await u.api.dispose();
  });
});

test.describe("สิทธิ์ข้อมูลข้ามผู้ใช้ (เกณฑ์ 11) — ทุก endpoint ใหม่ผูกกับ session ไม่รับ user id จากคำขอ", () => {
  test("A เห็นแต่ของ A · ส่งค่า user id ของ B มาก็ไม่มีผล · A ลบบัญชีแล้ว B ยังอยู่ครบ", async ({ baseURL }) => {
    const a = await signUp(baseURL!, { stage: "ready" });
    const b = await signUp(baseURL!, { stage: "ready" });
    const bId = (await userIdOf(b.email))!;
    const meA = await (await a.api.get(`/api/me?userId=${bId}`)).json();
    expect(meA.user.email).toBe(a.email);
    expect(meA.user.id).not.toBe(bId);

    // ส่ง userId ของ B ใน body ของทุก endpoint ที่เขียน — ต้องไม่แตะ B
    const consent = await a.api.post("/api/consent", { data: { noticeVersion: meA.noticeVersion, locale: "en", userId: bId } });
    expect(consent.status()).toBeLessThan(500);
    const bConsent = await sql<{ locale: string }>(`select locale from consent_record where user_id = $1`, [bId]);
    expect(bConsent.map((c) => c.locale)).toEqual(["th"]);
    const ob = await a.api.post("/api/onboarding", { data: { userId: bId } });
    expect([400, 409]).toContain(ob.status());
    const before = await residue(bId, b.email);

    const del = await a.api.delete(`/api/me?userId=${bId}`, { data: { userId: bId } });
    expect(del.status()).toBe(200);
    expect((await a.api.get("/api/me")).status()).toBe(401);
    const meB = await b.api.get("/api/me");
    expect(meB.status()).toBe(200);
    expect((await meB.json()).user.email).toBe(b.email);
    expect(await residue(bId, b.email)).toEqual(before);
    await a.api.dispose();
    await b.api.dispose();
  });

  test("ไม่มี session → ทุก endpoint ข้อมูลตอบ 401 · Origin ต่างโดเมน → 403", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get("/api/me")).status()).toBe(401);
    expect((await anon.delete("/api/me")).status()).toBe(401);
    expect((await anon.post("/api/consent", { data: { noticeVersion: "x", locale: "th" } })).status()).toBe(401);
    expect((await anon.post("/api/onboarding", { data: {} })).status()).toBe(401);
    await anon.dispose();
    const u = await signUp(baseURL!, { stage: "ready" });
    const evil = await u.api.delete("/api/me", { headers: { origin: "https://evil.example.com" } });
    expect(evil.status()).toBe(403);
    expect((await u.api.get("/api/me")).status()).toBe(200);
    await u.api.dispose();
  });
});

// R1.5 M1 ทาง ก. (boss 2026-11-20): เปลี่ยน PRIVACY_NOTICE_VERSION → ผู้ใช้เดิมต้องยินยอมใหม่ 1 ครั้ง
// เวอร์ชันปัจจุบันอ่านจาก /api/me (แหล่งเดียว = PRIVACY_NOTICE_VERSION) · "เวอร์ชันเก่า" = ค่าใดๆ ที่ไม่ใช่เวอร์ชันปัจจุบัน
test.describe("ผู้ใช้เดิมที่ยินยอมประกาศเวอร์ชันเก่า", () => {
  for (const locale of ["th", "en"] as const) {
    test(`${locale}: เปิดแอป → ถูกพาไปหน้ายินยอม (เห็นเวอร์ชันใหม่) → ยินยอม → กลับหน้าหลัก ข้อมูลเดิมครบ ไม่ต้องกรอกแบบสอบถามใหม่`, async ({ browser, baseURL }) => {
      const u = await signUp(baseURL!, { stage: "ready", locale });
      const id = (await userIdOf(u.email))!;
      const current = ((await (await u.api.get("/api/me")).json()) as { noticeVersion: string }).noticeVersion;
      expect(current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const before = await residue(id, u.email);
      // จำลองว่ายินยอมไว้ตอนประกาศฉบับก่อน: แถวยินยอมที่มีอยู่เป็นของเวอร์ชันอื่น
      await sql(`update consent_record set notice_version = '2000-01-01' where user_id = $1`, [id]);
      const me = (await (await u.api.get("/api/me")).json()) as { state: string; noticeVersion: string };
      expect(me).toMatchObject({ state: "consent_required", noticeVersion: current });
      // API ข้อมูลถูกกันจนกว่าจะยินยอม
      const blocked = await u.api.post("/api/onboarding", { data: {} });
      expect(blocked.status()).toBe(403);
      expect(await blocked.json()).toMatchObject({ code: "consent_required" });
      // ยินยอมด้วยเวอร์ชันเก่า (เช่นหน้าที่เปิดค้างไว้) → ไม่ผ่าน
      expect((await u.api.post("/api/consent", { data: { noticeVersion: "2000-01-01", locale } })).status()).not.toBe(200);

      const ctx = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 }, locale: locale === "en" ? "en-US" : "th-TH", colorScheme: locale === "en" ? "dark" : "light" });
      if (locale === "en") await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
      await applySession(ctx, u);
      const page = await ctx.newPage();
      await page.goto("/");
      await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.title"));
      await expect(page.getByRole("link", { name: msg(locale, "consent.readFull").replace("{version}", current) })).toHaveAttribute("href", "/privacy");
      // แท็บอื่นก็พากลับมาหน้ายินยอม
      await page.goto("/me");
      await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
      await page.getByText(msg(locale, "consent.ageCheckbox")).click();
      await page.getByText(msg(locale, "consent.checkbox")).click();
      await page.getByRole("button", { name: msg(locale, "consent.agree") }).click();
      // มีโปรไฟล์อยู่แล้ว → ไปหน้าหลัก ไม่ใช่แบบสอบถาม
      await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "nav.home"));
      await expect(page.getByRole("navigation", { name: msg(locale, "nav.label") }).getByRole("link")).toHaveCount(4);
      await page.goto("/me");
      await expect(page.getByText(u.email)).toBeVisible();

      expect(((await (await u.api.get("/api/me")).json()) as { state: string }).state).toBe("ready");
      const rows = await sql<{ notice_version: string; locale: string }>(`select notice_version, locale from consent_record where user_id = $1 order by accepted_at`, [id]);
      expect(rows.filter((r) => r.notice_version === current), "exactly one consent row for the current version").toHaveLength(1);
      expect(rows.find((r) => r.notice_version === current)!.locale).toBe(locale);
      const after = await residue(id, u.email);
      for (const t of ["profile", "place", "body_entry"]) expect(after[t], `${t} kept`).toBe(before[t]);
      await ctx.close();
      await u.api.dispose();
    });
  }
});
