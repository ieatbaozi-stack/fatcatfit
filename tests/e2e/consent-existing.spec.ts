import type { Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { msg, setLocale, waitForAuthReady } from "./helpers";
import { applySession, residue, signInViaUi, signUp, sql, userIdOf } from "./support/auth";

// R1.5 (R1_5_ADMIN_INVITES_CONTRACT.md บันทึก 2026-11-20 "boss ตัดสิน" · commit ffad0fe) — qa-test
// ผู้ใช้เดิม (มี profile) ที่ต้องยินยอมใหม่เพราะประกาศเปลี่ยนเวอร์ชัน กด "ไม่ยินยอม":
//   ข้อมูลยังอยู่ · เลือก ออกจากระบบ (ไม่ลบ) / ลบบัญชีพร้อมข้อมูลทั้งหมด (ยืนยันอีกขั้น) / กลับไปอ่านอีกที
// ผู้ใช้ใหม่ (ไม่มี profile) พฤติกรรมเดิม · ทุกเทสต์ × TH/EN × project mobile/desktop

test.use({ auth: "none" });

const LOCALES = ["th", "en"] as const;
type L = (typeof LOCALES)[number];
/** "—" = DELETED_INVITE_LABEL (server-only) — ค่าที่ boss อนุมัติใน contract */
const DELETED_LABEL = "—";
const OLD_VERSION = "2000-01-01";

/** ข้อมูลของบัญชีที่ต้องไม่เปลี่ยน (ไม่นับ session ซึ่งเปลี่ยนตามการเข้า/ออก) */
async function snapshot(id: string) {
  const q = async (table: string) => JSON.stringify(await sql(`select * from ${table} where user_id = $1 order by id`, [id]));
  return {
    user: JSON.stringify(await sql(`select id, email, invite_code_id from "user" where id = $1`, [id])),
    profile: JSON.stringify(await sql(`select * from profile where user_id = $1`, [id])),
    place: await q("place"),
    body_entry: await q("body_entry"),
    consent_record: JSON.stringify(await sql(`select notice_version, locale from consent_record where user_id = $1 order by accepted_at`, [id])),
  };
}

/** ผู้ใช้ที่ใช้งานอยู่แล้ว (ยินยอม + แบบสอบถาม) แต่ยินยอมไว้กับประกาศฉบับก่อน */
async function existingUser(baseURL: string, locale: L, code?: string) {
  const u = await signUp(baseURL, { stage: "ready", locale, code });
  const signedUpAt = Date.now();
  const id = (await userIdOf(u.email))!;
  await sql(`update consent_record set notice_version = $2 where user_id = $1`, [id, OLD_VERSION]);
  const me = (await (await u.api.get("/api/me")).json()) as { state: string; noticeVersion: string; profile: unknown };
  expect(me.state).toBe("consent_required");
  expect(me.profile, "existing user has a profile").not.toBeNull();
  return { u, id, signedUpAt, current: me.noticeVersion };
}

async function openDecision(page: Page, locale: L) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.title"));
  await page.getByRole("button", { name: msg(locale, "consent.decline") }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.existing.title"));
}

const btn = (page: Page, locale: L, key: string) => page.getByRole("button", { name: msg(locale, key), exact: true });

for (const locale of LOCALES) {
  test.describe(`ผู้ใช้เดิมกดไม่ยินยอม · ${locale}`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await setLocale(context, baseURL!, locale);
    });

    test("1: หน้าตัดสินใจ — บอกว่าข้อมูลยังอยู่ · ไม่มี \"ที่เพิ่งสร้าง/just created\" · ไม่มีอีเมล · 3 ทางเลือก · กลับไปอ่านได้ · DB ไม่เปลี่ยน", async ({ page, context, baseURL }) => {
      const { u, id } = await existingUser(baseURL!, locale);
      const before = await snapshot(id);
      await applySession(context, u);
      await openDecision(page, locale);

      await expect(page.getByText(msg(locale, "consent.existing.body"))).toBeVisible();
      await expect(page.getByText(msg(locale, "consent.existing.signOutHint"))).toBeVisible();
      const text = await page.locator("body").innerText();
      expect(text).not.toContain("ที่เพิ่งสร้าง");
      expect(text.toLowerCase()).not.toContain("just created");
      expect(text).not.toContain(msg(locale, "consent.declineBody"));
      expect(text).not.toContain(msg(locale, "consent.declineConfirm"));
      expect(text.toLowerCase()).not.toContain(u.email.toLowerCase());
      expect(await page.content(), "email not in the DOM at all").not.toContain(u.email);
      if (locale === "en") expect(text.match(/[฀-๿]+/g) ?? [], "no Thai on the English screen").toEqual([]);

      for (const key of ["consent.existing.signOut", "consent.existing.delete", "consent.declineBack"]) await expect(btn(page, locale, key)).toBeEnabled();
      await expect(btn(page, locale, "consent.declineConfirm")).toHaveCount(0);

      // กลับไปอ่านอีกที → หน้ายินยอมเดิม (ช่องติ๊กยังไม่ติ๊ก)
      await btn(page, locale, "consent.declineBack").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.title"));
      await expect(page.getByRole("button", { name: msg(locale, "consent.agree") })).toBeDisabled();

      expect(await snapshot(id)).toEqual(before);
      expect(((await (await u.api.get("/api/me")).json()) as { state: string }).state).toBe("consent_required");
      await u.api.dispose();
    });

    test("2: ออกจากระบบ (ข้อมูลยังอยู่) → /welcome · เข้าใหม่ด้วย OTP → ข้อมูลเดิมครบ → ยินยอม → หน้าหลัก ready", async ({ page, context, baseURL }) => {
      test.setTimeout(150_000);
      const { u, id, signedUpAt, current } = await existingUser(baseURL!, locale);
      const before = await snapshot(id);
      const residueBefore = await residue(id, u.email);
      await applySession(context, u);
      await openDecision(page, locale);

      const signOuts: string[] = [];
      page.on("request", (r: Request) => {
        if (r.url().includes("/api/auth/sign-out")) signOuts.push(r.method());
        if (r.url().endsWith("/api/me") && r.method() === "DELETE") signOuts.push("DELETE /api/me");
      });
      await btn(page, locale, "consent.existing.signOut").dblclick();
      await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
      expect(signOuts, "one sign-out request, never a delete").toEqual(["POST"]);
      expect((await u.api.get("/api/me")).status(), "old session is gone").toBe(401);
      expect(await snapshot(id), "data kept after sign-out").toEqual(before);
      const afterOut = await residue(id, u.email);
      expect(afterOut.session).toBe(0);
      expect({ ...afterOut, session: 0, "verification(email)": 0 }).toEqual({ ...residueBefore, session: 0, "verification(email)": 0 });

      // เข้าใหม่ด้วยอีเมล + OTP (ไม่ต้องใช้โค้ดเชิญ) — รอให้พ้นช่วงห้ามขอรหัสถี่ 60 วิ นับจากตอนสมัคร
      await page.waitForTimeout(Math.max(0, signedUpAt + 61_000 - Date.now()));
      await signInViaUi(page, u.email, { locale });
      await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
      expect(await snapshot(id), "still the same account and data").toEqual(before);
      await page.getByText(msg(locale, "consent.ageCheckbox")).click();
      await page.getByText(msg(locale, "consent.checkbox")).click();
      await page.getByRole("button", { name: msg(locale, "consent.agree") }).click();
      await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "nav.home"));
      await waitForAuthReady(page);

      const after = await snapshot(id);
      for (const k of ["user", "profile", "place", "body_entry"] as const) expect(after[k], `${k} kept`).toBe(before[k]);
      const rows = JSON.parse(after.consent_record) as { notice_version: string; locale: string }[];
      expect(rows.filter((r) => r.notice_version === current)).toEqual([{ notice_version: current, locale }]);
      expect(await sql(`select 1 from "user" where lower(email) = lower($1)`, [u.email]), "no duplicate user").toHaveLength(1);
      const state = await page.evaluate(async () => ((await (await fetch("/api/me")).json()) as { state: string }).state);
      expect(state).toBe("ready");
      await u.api.dispose();
    });

    test("3: ลบ → ยกเลิก → DB ไม่เปลี่ยน · ลบ → ลบถาวร (กดซ้ำเร็ว) → ไม่เหลือข้อมูลทุกตาราง + ป้ายโค้ดเชิญเป็น \"—\"", async ({ page, context, baseURL }) => {
      test.setTimeout(120_000);
      // โค้ดที่แอดมินออกพร้อมป้าย (ทางเดียวกับ admin-invites.spec.ts: แอดมินได้สิทธิ์ด้วย INSERT ในฐานทดสอบ)
      const admin = await signUp(baseURL!, { stage: "ready" });
      await sql(`insert into app_admin (user_id, created_at) values ($1, now())`, [await userIdOf(admin.email)]);
      const label = `เพื่อน-${locale}-${Date.now().toString(36)}`;
      const created = await admin.api.post("/api/admin/invites", { data: { label, days: 3, maxUses: 1 } });
      expect(created.status()).toBe(201);
      const invite = (await created.json()) as { id: string; code: string };

      const { u, id } = await existingUser(baseURL!, locale, invite.code);
      expect((await sql<{ invite_code_id: string }>(`select invite_code_id from "user" where id = $1`, [id]))[0].invite_code_id).toBe(invite.id);
      const before = await snapshot(id);
      const residueBefore = await residue(id, u.email);
      await applySession(context, u);
      await openDecision(page, locale);

      // ลบ → ขั้นยืนยัน → ยกเลิก ไม่ลบ
      await btn(page, locale, "consent.existing.delete").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.existing.confirmTitle"));
      await expect(page.getByText(msg(locale, "consent.existing.confirmBody"))).toBeVisible();
      await btn(page, locale, "consent.existing.confirmBack").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.existing.title"));
      expect(await snapshot(id), "cancel changes nothing").toEqual(before);
      expect(await residue(id, u.email)).toEqual(residueBefore);
      expect((await u.api.get("/api/me")).status()).toBe(200);
      expect((await sql<{ label: string }>(`select label from invite_code where id = $1`, [invite.id]))[0].label).toBe(label);

      // ลบ → ลบถาวรเลย (ดับเบิลคลิก = คำขอเดียว)
      const deletes: string[] = [];
      page.on("request", (r: Request) => {
        if (new URL(r.url()).pathname === "/api/me" && r.method() === "DELETE") deletes.push(r.url());
      });
      await btn(page, locale, "consent.existing.delete").click();
      await btn(page, locale, "consent.existing.confirmDelete").dblclick();
      await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
      expect(deletes, "one DELETE /api/me").toHaveLength(1);
      const left = await residue(id, u.email);
      expect(Object.values(left).every((n) => n === 0), JSON.stringify(left)).toBe(true);
      expect((await u.api.get("/api/me")).status()).toBe(401);
      expect((await sql<{ label: string }>(`select label from invite_code where id = $1`, [invite.id]))[0].label).toBe(DELETED_LABEL);
      const list = (await (await admin.api.get("/api/admin/invites")).json()) as { invites: { id: string; label: string }[] };
      expect(list.invites.find((r) => r.id === invite.id)?.label).toBe(DELETED_LABEL);
      // แอดมินยังอยู่
      expect((await admin.api.get("/api/me")).status()).toBe(200);
      await u.api.dispose();
      await admin.api.dispose();
    });

    test("4: ผู้ใช้ใหม่ (ไม่มี profile) → ข้อความและปุ่มเดิม · ลบบัญชีที่เพิ่งสร้าง", async ({ page, context, baseURL }) => {
      const u = await signUp(baseURL!, { stage: "signed_in", locale });
      const id = (await userIdOf(u.email))!;
      expect(((await (await u.api.get("/api/me")).json()) as { profile: unknown }).profile).toBeNull();
      await applySession(context, u);
      await page.goto("/");
      await expect(page).toHaveURL(/\/consent$/, { timeout: 15_000 });
      await page.getByRole("button", { name: msg(locale, "consent.decline") }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.declineTitle"));
      await expect(page.getByText(msg(locale, "consent.declineBody"))).toBeVisible();
      const text = await page.locator("body").innerText();
      for (const k of ["title", "body", "signOut", "delete", "signOutHint"]) expect(text, `no consent.existing.${k}`).not.toContain(msg(locale, `consent.existing.${k}`));
      await expect(btn(page, locale, "consent.declineBack")).toBeEnabled();
      await btn(page, locale, "consent.declineConfirm").click();
      await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
      const left = await residue(id, u.email);
      expect(Object.values(left).every((n) => n === 0), JSON.stringify(left)).toBe(true);
      await u.api.dispose();
    });

    test("5: ออฟไลน์ที่หน้าตัดสินใจ/ขั้นยืนยัน → ออกจากระบบ/ลบ/ลบถาวร ปิด · กลับไปอ่าน/ยกเลิก ยังกดได้ · ต่อเน็ตแล้วเปิดคืน", async ({ page, context, baseURL }) => {
      const { u, id } = await existingUser(baseURL!, locale);
      const before = await snapshot(id);
      await applySession(context, u);
      await openDecision(page, locale);

      await context.setOffline(true);
      await expect(page.getByRole("status").filter({ hasText: msg(locale, "consent.offline") })).toBeVisible();
      await expect(btn(page, locale, "consent.existing.signOut")).toBeDisabled();
      await expect(btn(page, locale, "consent.existing.delete")).toBeDisabled();
      await expect(btn(page, locale, "consent.declineBack")).toBeEnabled();
      await context.setOffline(false);
      await expect(btn(page, locale, "consent.existing.signOut")).toBeEnabled();
      await expect(btn(page, locale, "consent.existing.delete")).toBeEnabled();

      await btn(page, locale, "consent.existing.delete").click();
      await context.setOffline(true);
      await expect(page.getByRole("status").filter({ hasText: msg(locale, "consent.offline") })).toBeVisible();
      await expect(btn(page, locale, "consent.existing.confirmDelete")).toBeDisabled();
      await expect(btn(page, locale, "consent.existing.confirmBack")).toBeEnabled();
      await btn(page, locale, "consent.existing.confirmBack").click();
      await expect(btn(page, locale, "consent.existing.signOut")).toBeDisabled();
      await context.setOffline(false);
      expect(await snapshot(id)).toEqual(before);
      await u.api.dispose();
    });

    test("ทางผิด: ออกจากระบบ/ลบ ล้มเหลว (เซิร์ฟเวอร์ 500 · เน็ตหลุดกลางคำขอ) → ขึ้นข้อความ · อยู่หน้าเดิม · ลองใหม่ได้ · ข้อมูลไม่หาย", async ({ page, context, baseURL }) => {
      const { u, id } = await existingUser(baseURL!, locale);
      const before = await snapshot(id);
      await applySession(context, u);
      await openDecision(page, locale);

      await page.route("**/api/auth/sign-out", (r) => r.abort("internetdisconnected"));
      await btn(page, locale, "consent.existing.signOut").click();
      await expect(page.locator("p[role=alert]")).toHaveText(msg(locale, "consent.existing.signOutFailed"));
      await expect(page).toHaveURL(/\/consent$/);
      await expect(btn(page, locale, "consent.existing.signOut")).toBeEnabled();
      await expect(btn(page, locale, "consent.existing.delete")).toBeEnabled();
      await page.unroute("**/api/auth/sign-out");

      await page.route("**/api/me", (r) => (r.request().method() === "DELETE" ? r.fulfill({ status: 500, body: "{}" }) : r.continue()));
      await btn(page, locale, "consent.existing.delete").click();
      await btn(page, locale, "consent.existing.confirmDelete").click();
      await expect(page.locator("p[role=alert]")).toHaveText(msg(locale, "consent.deleteFailed"));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.existing.confirmTitle"));
      await expect(btn(page, locale, "consent.existing.confirmDelete")).toBeEnabled();
      // ยกเลิกหลังลบไม่สำเร็จ → ข้อความ "ลบไม่สำเร็จ" ไม่ตามกลับมาหน้าตัดสินใจ
      // (ข้อความ "ออกจากระบบไม่สำเร็จ" จากครั้งก่อนยังค้างอยู่ — รายงาน Lead แล้ว ไม่ตรวจที่นี่)
      await btn(page, locale, "consent.existing.confirmBack").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(locale, "consent.existing.title"));
      await expect(page.getByText(msg(locale, "consent.deleteFailed"))).toHaveCount(0);
      await page.unroute("**/api/me");
      expect(await snapshot(id), "failed attempts change nothing").toEqual(before);
      expect((await u.api.get("/api/me")).status()).toBe(200);

      // ลองออกจากระบบอีกครั้งได้จริง
      await btn(page, locale, "consent.existing.signOut").click();
      await expect(page).toHaveURL(/\/welcome$/, { timeout: 15_000 });
      expect(await snapshot(id)).toEqual(before);
      await u.api.dispose();
    });
  });
}
