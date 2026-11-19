import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../src/db/testing/pglite";
import { isInviteActive } from "../src/lib/auth/invite-store";
import { normalizeInviteCode } from "../src/lib/auth/invite-code";
import { runInvite } from "./invite";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const NOW = new Date("2026-11-18T10:00:00.000Z");
function run(...argv: string[]) {
  const lines: string[] = [];
  const errs: string[] = [];
  return runInvite(argv, t.db, NOW, { log: (l) => lines.push(l), err: (l) => errs.push(l) }, { BETTER_AUTH_URL: "https://app.example.com/" }).then(
    (code) => ({ code, lines, errs }),
  );
}

describe("scripts/invite.ts", () => {
  it("create: พิมพ์โค้ดครั้งเดียว + ลิงก์แบบ fragment · โค้ดใช้ได้จริง", async () => {
    const r = await run("create", "--uses", "3", "--days", "7", "--label", "เพื่อนกลุ่มแรก");
    expect(r.code).toBe(0);
    const link = r.lines.find((l) => l.startsWith("link:"))!;
    expect(link).toMatch(/^link:\s+https:\/\/app\.example\.com\/welcome#invite=[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(link).not.toContain("?invite");
    const code = normalizeInviteCode(link.split("#invite=")[1]);
    expect(code).not.toBeNull();
    expect(await isInviteActive(t.db, code!, NOW)).toBe(true);
  });

  it("list: ไม่แสดงโค้ดดิบ แสดงสถานะ/ใช้แล้ว/ป้าย", async () => {
    const c = await run("create", "--uses", "1", "--days", "1", "--label", "for-list");
    const raw = c.lines[0].split(/\s+/)[1];
    const l = await run("list");
    const text = l.lines.join("\n");
    expect(text).toContain("for-list");
    expect(text).toContain("active");
    expect(text).not.toContain(raw);
    expect(text).not.toContain(raw.replace("-", ""));
  });

  it("revoke ด้วย --code และ --id · ยกเลิกซ้ำคืน exit 1", async () => {
    const c = await run("create", "--uses", "1", "--days", "1", "--label", "rv1");
    const display = c.lines[0].split(/\s+/)[1];
    expect((await run("revoke", "--code", display)).code).toBe(0);
    expect(await isInviteActive(t.db, normalizeInviteCode(display)!, NOW)).toBe(false);
    expect((await run("revoke", "--code", display)).code).toBe(1);

    const c2 = await run("create", "--uses", "1", "--days", "1", "--label", "rv2");
    const id = c2.lines.find((x) => x.includes("id:"))!.split("id:")[1].trim();
    expect((await run("revoke", "--id", id)).code).toBe(0);
  });

  it("อาร์กิวเมนต์ผิด → exit 2 ไม่แตะฐานข้อมูล", async () => {
    for (const argv of [["create"], ["create", "--uses", "0", "--days", "1", "--label", "x"], ["create", "--uses", "1", "--days", "-1", "--label", "x"], ["create", "--uses", "1", "--days", "1"], ["revoke"], ["revoke", "--id", "a", "--code", "b"], ["nope"], []]) {
      expect((await run(...argv)).code, argv.join(" ")).toBe(2);
    }
  });
});
