import { expect, test } from "./fixtures";
import { msg } from "./helpers";
import { mailsTo, newInvite, uniqueEmail, userIdOf } from "./support/auth";

// บั๊กจาก R1: เครื่องที่เคยเข้า (fcf:known-device) ซ่อนช่องโค้ดเชิญ → โค้ดผิด/ถูกยกเลิกจากลิงก์ล้มเหลวเงียบๆ
// แก้ใน R1.5: ช่องต้องโผล่เมื่อมีโค้ดจากลิงก์ / มี error ของโค้ด / ผู้ใช้กด "ใส่โค้ด"-"แก้"

test.use({ auth: "none" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fcf:known-device", "1"));
});

test.describe("เครื่องที่เคยเข้า: ช่องโค้ดเชิญ", () => {
  test("ไม่มีโค้ดจากลิงก์ → ซ่อนช่องบนหน้าแรก (พฤติกรรมเดิม)", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("button", { name: msg("th", "welcome.useEmail") })).toBeVisible();
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toHaveCount(0);
  });

  test("โค้ดถูกยกเลิกจากลิงก์ + อีเมล → กลับหน้าแรกพร้อมช่องและข้อความ \"โค้ดนี้ใช้ไม่ได้\" · ไม่ส่งเมล", async ({ page }) => {
    const code = await newInvite({ revoke: true });
    const email = uniqueEmail("knownrevoked");
    await page.goto(`/welcome#invite=${code}`);
    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await page.getByLabel(msg("th", "welcome.email.label")).fill(email);
    await page.getByRole("button", { name: msg("th", "welcome.email.send") }).click();
    const field = page.getByLabel(msg("th", "welcome.invite.label"));
    await expect(field).toBeVisible();
    await expect(page.getByText(msg("th", "welcome.invite.invalid"))).toBeVisible();
    // ล้างข้อความแล้วช่องต้องไม่หายไป
    await field.fill("");
    await expect(field).toBeVisible();
    await page.waitForTimeout(500);
    expect(await mailsTo(email)).toEqual([]);
    expect(await userIdOf(email)).toBeNull();
  });

  test("โค้ดถูกยกเลิกจากลิงก์ + กด Google → ช่องโผล่พร้อมข้อความผิด", async ({ page }) => {
    const code = await newInvite({ revoke: true });
    await page.goto(`/welcome#invite=${code}`);
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toHaveValue(code);
    await page.getByRole("button", { name: msg("th", "welcome.google.label") }).click();
    await expect(page.getByText(msg("th", "welcome.invite.invalid"))).toBeVisible();
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toBeVisible();
  });

  test("callback ?error=invite_required → ช่องโผล่พร้อมข้อความ \"ต้องมีโค้ดเชิญ\"", async ({ page }) => {
    await page.goto("/welcome?error=invite_required");
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toBeVisible();
    await expect(page.getByText(msg("th", "welcome.invite.required"))).toBeVisible();
  });

  test("ขั้นอีเมล → \"ใส่โค้ด\" → ช่องโค้ดโผล่บนหน้าแรก", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await page.getByRole("button", { name: msg("th", "welcome.email.addInvite") }).click();
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toBeVisible();
  });

  test("ขั้นอีเมลมีโค้ดจากลิงก์ → \"แก้\" → ช่องโค้ดโผล่พร้อมโค้ดเดิม", async ({ page }) => {
    const code = await newInvite();
    await page.goto(`/welcome#invite=${code}`);
    await page.getByRole("button", { name: msg("th", "welcome.useEmail") }).click();
    await page.getByRole("button", { name: msg("th", "welcome.email.edit") }).click();
    await expect(page.getByLabel(msg("th", "welcome.invite.label"))).toHaveValue(code);
  });
});
