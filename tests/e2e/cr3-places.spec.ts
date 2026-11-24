import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoHorizontalOverflow, msg, presetTheme, setLocale, TOKENS } from "./helpers";
import { applySession, residue, signUp, sql, userIdOf, type TestUser } from "./support/auth";
import { audit, contrast } from "./support/design-audit";

// CR3 ลิงก์ Google Maps + ลบสถานที่ (CR3_PLACE_MAP_DELETE_CONTRACT.md เกณฑ์ 4, 6) — จอ 360 px · TH/EN · สว่าง/มืด
// เกณฑ์ 5 (migration บนฐาน R2) อยู่ใน cr3-migration.spec.ts · ลิงก์ในเทสต์เป็นรูปลิงก์สมมติ ไม่ใช่สถานที่จริงของใคร

test.use({ auth: "none", viewport: { width: 360, height: 760 } });

const SHARE_LINK = "https://maps.app.goo.gl/QaExample123";
const WEB_LINK = "https://www.google.com/maps/place/QA+Gym/@13.7,100.5,17z";

type L = "th" | "en";
type Result = { status: string; code?: string };

async function push(u: TestUser, ops: Array<{ entity: string; id: string; action: "upsert" | "delete"; data?: unknown }>): Promise<Result[]> {
  const res = await u.api.post("/api/sync/push", {
    data: { v: 1, ops: ops.map((o) => ({ ...o, op_id: randomUUID(), client_updated_at: new Date().toISOString() })) },
  });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}

async function asUser(page: Page, baseURL: string, l: L, theme: "light" | "dark") {
  const u = await signUp(baseURL, { locale: l });
  await setLocale(page.context(), baseURL, l);
  await presetTheme(page, theme);
  await applySession(page.context(), u);
  return u;
}

const toast = (page: Page, l: L, key: string) => page.getByRole("status").filter({ hasText: msg(l, key) });
const chip = (page: Page) => page.getByRole("button", { name: /^(At |เล่นที่)/ });

async function expectPinLink(page: Page, l: L, place: string, href: string) {
  const pin = page.getByRole("link", { name: msg(l, "places.openMap").replace("{place}", place) });
  await expect(pin).toHaveAttribute("href", href);
  await expect(pin).toHaveAttribute("target", "_blank");
  await expect(pin).toHaveAttribute("rel", "noopener noreferrer");
  const box = (await pin.boundingBox())!;
  expect(box.width, "pin ≥ 44px").toBeGreaterThanOrEqual(44);
  expect(box.height, "pin ≥ 44px").toBeGreaterThanOrEqual(44);
}

async function expectDesign(page: Page, l: L, theme: "light" | "dark", where: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(TOKENS[theme].paper);
  await expectNoHorizontalOverflow(page);
  const a = await audit(page);
  const problems: string[] = [];
  for (const t of a.texts) {
    if (t.size < 14) problems.push(`font < 14px: "${t.text}" ${t.size}px`);
    if (!t.disabled && contrast(t.color, t.bg) < 4.5) problems.push(`contrast ${contrast(t.color, t.bg).toFixed(2)}: "${t.text}" (${t.cls})`);
  }
  expect(problems, `${where}: text`).toEqual([]);
  expect(a.small, `${where}: touch targets < 44px`).toEqual([]);
  expect(a.orange.length, `${where}: orange outside the cat: ${a.orange.join(" | ")}`).toBeLessThanOrEqual(1);
  if (l === "en") expect(a.visibleText.match(/[฀-๿][^\n]{0,30}/g) ?? [], `${where}: Thai text on an English screen`).toEqual([]);
}

test.describe("CR3 สถานที่: ลิงก์แผนที่ + ลบ · จอ 360 px", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "เกณฑ์ 4 เป็นจอมือถือ 360 px");
  });

  for (const [l, theme] of [
    ["th", "light"],
    ["en", "dark"],
    ["th", "dark"],
    ["en", "light"],
  ] as const) {
    test(`${l} · ${theme}: วางลิงก์ → หมุด href/target/rel · ลิงก์ผิดเห็นข้อความ · แก้/ล้างลิงก์ · ลบ → ยืนยัน → หายจากรายการและชิป`, async ({ page, baseURL }) => {
      const u = await asUser(page, baseURL!, l, theme);
      const uid = (await userIdOf(u.email))!;
      const home = (await (await u.api.get("/api/bootstrap")).json()).places[0] as { id: string; name: string };

      await page.goto("/me/places");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "places.title"));

      // เพิ่มสถานที่ + ลิงก์ผิดก่อน
      await page.getByRole("button", { name: `+ ${msg(l, "places.add")}` }).click();
      let sheet = page.getByRole("dialog");
      await sheet.getByLabel(msg(l, "places.name")).fill("QA Gym");
      const field = sheet.getByLabel(msg(l, "places.mapUrl"));
      const add = sheet.getByRole("button", { name: msg(l, "places.addButton"), exact: true });
      for (const bad of ["http://maps.app.goo.gl/x", "javascript:alert(1)", "https://google.com.evil.com/maps/x", "https://evil.com/?q=google.com/maps", "https://maps.app.goo.gl/" + "a".repeat(480)]) {
        await field.fill(bad);
        await field.blur();
        await expect(sheet.getByRole("alert")).toHaveText(msg(l, "places.mapUrlInvalid"));
        await expect(field).toHaveAttribute("aria-invalid", "true");
        await expect(add).toBeDisabled();
      }
      if (theme === "light" && l === "th") await expectDesign(page, l, theme, "add-sheet-invalid");
      // วางลิงก์ที่มีช่องว่างหัวท้าย (คัดลอกมาจากแอปอื่น) = ตัดแล้วใช้ได้
      await field.fill(`  ${SHARE_LINK}  `);
      await expect(sheet.getByRole("alert")).toHaveCount(0);
      await add.click();
      await expect(toast(page, l, "toast.added")).toBeVisible();
      const [row] = await sql<{ id: string; map_url: string }>(`select id, map_url from place where user_id = $1 and name = 'QA Gym'`, [uid]);
      expect(row.map_url).toBe(SHARE_LINK);
      await expectPinLink(page, l, "QA Gym", SHARE_LINK);
      // สถานที่ที่ไม่มีลิงก์ = ไม่มีหมุด
      await expect(page.getByRole("link", { name: msg(l, "places.openMap").replace("{place}", home.name) })).toHaveCount(0);
      await expectDesign(page, l, theme, "places-with-pin");

      // แก้ลิงก์ (ลิงก์เว็บ) · แตะหมุดเปิดแท็บใหม่ (ตัดทางไป Google ไม่ให้ออกเน็ตจริง)
      await page.context().route(/https:\/\/(www\.)?google\.com\/.*|https:\/\/maps\.app\.goo\.gl\/.*/, (r) => r.fulfill({ status: 200, body: "stub" }));
      await page.getByRole("button", { name: "QA Gym" }).click();
      sheet = page.getByRole("dialog");
      await expect(sheet.getByLabel(msg(l, "places.mapUrl"))).toHaveValue(SHARE_LINK);
      await expectDesign(page, l, theme, "edit-sheet");
      await sheet.getByLabel(msg(l, "places.mapUrl")).fill(WEB_LINK);
      await sheet.getByRole("button", { name: msg(l, "places.save") }).click();
      await expect(toast(page, l, "toast.saved")).toBeVisible();
      await expectPinLink(page, l, "QA Gym", WEB_LINK);
      const popup = page.waitForEvent("popup");
      await page.getByRole("link", { name: msg(l, "places.openMap").replace("{place}", "QA Gym") }).click();
      const tab = await popup;
      expect(tab.url()).toBe(WEB_LINK);
      expect(await tab.evaluate(() => window.opener)).toBeNull();
      await tab.close();

      // หมุดในแผ่นเลือกบนหน้าหลัก + เลือก QA Gym เป็นที่ปัจจุบัน
      await page.goto("/");
      await chip(page).click();
      sheet = page.getByRole("dialog");
      await expectPinLink(page, l, "QA Gym", WEB_LINK);
      await expectDesign(page, l, theme, "picker-with-pin");
      await sheet.getByRole("button", { name: /^QA Gym/ }).click();
      await expect(chip(page)).toHaveAttribute("aria-label", msg(l, "placePicker.chipLabel").replace("{place}", "QA Gym"));

      // ล้างลิงก์ = หมุดหาย
      await page.goto("/me/places");
      await page.getByRole("button", { name: /^QA Gym/ }).click();
      sheet = page.getByRole("dialog");
      await sheet.getByLabel(msg(l, "places.mapUrl")).fill("");
      await sheet.getByRole("button", { name: msg(l, "places.save") }).click();
      await expect(toast(page, l, "toast.saved")).toBeVisible();
      await expect(page.getByRole("link", { name: msg(l, "places.openMap").replace("{place}", "QA Gym") })).toHaveCount(0);
      expect((await sql<{ map_url: string | null }>(`select map_url from place where id = $1`, [row.id]))[0].map_url).toBeNull();

      // ลบ (ที่ที่เลือกอยู่บนหน้าหลัก) → ยกเลิกได้ → ยืนยัน → หายจากรายการและชิปเปลี่ยนเป็นที่ถัดไป
      await page.getByRole("button", { name: /^QA Gym/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.delete") }).click();
      sheet = page.getByRole("dialog");
      await expect(sheet.getByRole("heading")).toHaveText(msg(l, "places.deleteTitle").replace("{name}", "QA Gym"));
      await expectDesign(page, l, theme, "delete-confirm");
      await sheet.getByRole("button", { name: msg(l, "places.cancel") }).click();
      await expect(page.getByRole("dialog").getByLabel(msg(l, "places.name"))).toHaveValue("QA Gym"); // กลับแผ่นแก้ ยังไม่ลบ
      expect((await sql<{ d: string | null }>(`select deleted_at::text as d from place where id = $1`, [row.id]))[0].d).toBeNull();
      await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.delete") }).click();
      await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.deleteConfirm"), exact: true }).dblclick(); // กดซ้ำเร็วๆ ต้องไม่พัง
      await expect(toast(page, l, "toast.deleted")).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^QA Gym/ })).toHaveCount(0);
      expect((await sql<{ d: string | null }>(`select deleted_at::text as d from place where id = $1`, [row.id]))[0].d).not.toBeNull();
      await page.goto("/");
      await expect(chip(page)).toHaveAttribute("aria-label", msg(l, "placePicker.chipLabel").replace("{place}", home.name));
      await chip(page).click();
      await expect(page.getByRole("dialog").getByRole("button", { name: /^QA Gym/ })).toHaveCount(0);

      // แห่งสุดท้าย: ปุ่มลบปิด
      await page.goto("/me/places");
      await page.getByRole("button", { name: new RegExp(`^${home.name}`) }).click();
      await expect(page.getByRole("dialog").getByRole("button", { name: msg(l, "places.delete") })).toBeDisabled();
      await u.api.dispose();
    });
  }

  test("ที่ในกรุลบได้ · ลบจากเครื่องอื่นแล้วเครื่องนี้ลบซ้ำ = ไม่พัง หายไป", async ({ page, baseURL }) => {
    const l = "en";
    const u = await asUser(page, baseURL!, l, "light");
    const archivedId = randomUUID();
    const otherId = randomUUID();
    expect((await push(u, [
      { entity: "place", id: archivedId, action: "upsert", data: { name: "QA Archived", archived_at: new Date().toISOString() } },
      { entity: "place", id: otherId, action: "upsert", data: { name: "QA Other device" } },
    ])).map((r) => r.status)).toEqual(["applied", "applied"]);
    await page.goto("/me/places");
    await page.getByRole("button", { name: msg(l, "places.archivedSection").replace("{count}", "1") }).click();
    await page.getByRole("button", { name: "QA Archived" }).click();
    await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.delete") }).click();
    await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.deleteConfirm"), exact: true }).click();
    await expect(toast(page, l, "toast.deleted")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Archived ·/ })).toHaveCount(0);

    // อีกเครื่องลบไปก่อน แล้วเครื่องนี้ (ยังเห็นแถวเก่า) กดลบ
    await page.getByRole("button", { name: /^QA Other device/ }).click();
    expect((await push(u, [{ entity: "place", id: otherId, action: "delete" }])).map((r) => r.status)).toEqual(["applied"]);
    await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.delete") }).click();
    await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.deleteConfirm"), exact: true }).click();
    await expect(toast(page, l, "toast.deleted")).toBeVisible();
    await expect(page.getByRole("button", { name: /^QA Other device/ })).toHaveCount(0);
    await u.api.dispose();
  });
});

test.describe("CR3 API (end-to-end ผ่านแอปจริง)", () => {
  test("map_url: ตัวตรวจฝั่งเซิร์ฟเวอร์ · B ลบ/แก้ลิงก์สถานที่ของ A ไม่ได้ · ลิงก์ไม่รั่วไป bootstrap ของคนอื่น", async ({ baseURL }) => {
    const [a, b] = await Promise.all([signUp(baseURL!), signUp(baseURL!)]);
    const pa = randomUUID();
    expect((await push(a, [{ entity: "place", id: pa, action: "upsert", data: { name: "QA A", map_url: SHARE_LINK } }]))[0].status).toBe("applied");
    const bad = ["javascript:alert(1)", "http://maps.app.goo.gl/x", "https://google.com.evil.com/maps", "https://evil.com/?q=google.com/maps", "https://maps.app.goo.gl/" + "a".repeat(480), "", " ", "https://user:pw@maps.google.com/", "https://maps.google.com:8443/"];
    const r = await push(a, bad.map((map_url) => ({ entity: "place", id: randomUUID(), action: "upsert" as const, data: { name: "QA bad", map_url } })));
    expect(r.map((x) => `${x.status}:${x.code}`), JSON.stringify(bad)).toEqual(bad.map(() => "rejected:invalid"));
    expect((await push(b, [
      { entity: "place", id: pa, action: "delete" },
      { entity: "place", id: pa, action: "upsert", data: { name: "QA A", map_url: null } },
    ])).map((x) => `${x.status}:${x.code}`)).toEqual(["rejected:id_conflict", "rejected:id_conflict"]);
    expect(await sql(`select map_url, deleted_at from place where id = $1`, [pa])).toEqual([{ map_url: SHARE_LINK, deleted_at: null }]);
    expect(JSON.stringify(await (await b.api.get("/api/bootstrap")).json())).not.toContain(SHARE_LINK);
    // ไม่ส่ง map_url = คงเดิม
    expect((await push(a, [{ entity: "place", id: pa, action: "upsert", data: { name: "QA A renamed" } }]))[0].status).toBe("applied");
    expect(await sql(`select name, map_url from place where id = $1`, [pa])).toEqual([{ name: "QA A renamed", map_url: SHARE_LINK }]);
    await Promise.all([a.api.dispose(), b.api.dispose()]);
  });

  test("เกณฑ์ 6: ลบบัญชี → ไม่เหลือแถว place ของคนนั้น (รวมที่ลบแล้ว/ในกรุ/มีลิงก์)", async ({ baseURL }) => {
    const [u, other] = await Promise.all([signUp(baseURL!), signUp(baseURL!)]);
    const uid = (await userIdOf(u.email))!;
    const oid = (await userIdOf(other.email))!;
    const [p1, p2, p3] = [randomUUID(), randomUUID(), randomUUID()];
    await push(u, [
      { entity: "place", id: p1, action: "upsert", data: { name: "QA link", map_url: WEB_LINK } },
      { entity: "place", id: p2, action: "upsert", data: { name: "QA archived", archived_at: new Date().toISOString() } },
      { entity: "place", id: p3, action: "upsert", data: { name: "QA deleted" } },
    ]);
    expect((await push(u, [{ entity: "place", id: p3, action: "delete" }]))[0].status).toBe("applied");
    expect(await sql(`select count(*)::int as n, count(deleted_at)::int as d from place where user_id = $1`, [uid])).toEqual([{ n: 4, d: 1 }]);
    const otherBefore = await residue(oid, other.email);
    expect((await u.api.delete("/api/me")).status()).toBe(200);
    const left = await residue(uid, u.email);
    expect(left.place).toBe(0);
    expect(Object.values(left).every((n) => n === 0), JSON.stringify(left)).toBe(true);
    expect(await sql(`select count(*)::int as n from place where id = any($1::uuid[])`, [[p1, p2, p3]])).toEqual([{ n: 0 }]);
    expect(await residue(oid, other.email)).toEqual(otherBefore);
    await Promise.all([u.api.dispose(), other.api.dispose()]);
  });
});
