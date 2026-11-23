import { describe, expect, it } from "vitest";
import { adminInviteInputSchema } from "./admin-invite";

describe("adminInviteInputSchema", () => {
  it("trim label และคงค่า", () => {
    const r = adminInviteInputSchema.parse({ label: "  แมว  ", days: 3, maxUses: 10 });
    expect(r).toEqual({ label: "แมว", days: 3, maxUses: 10 });
  });
  it.each([
    [{ label: "a", days: 0, maxUses: 1 }],
    [{ label: "a", days: 30, maxUses: 1 }],
    [{ label: "a", days: 7, maxUses: 11 }],
    [{ label: "a\tb", days: 7, maxUses: 1 }],
    [{ label: "a\u0085b", days: 7, maxUses: 1 }],
    [{ label: "a", days: 7, maxUses: 1, x: 1 }],
    [{ label: "a\u202eb", days: 7, maxUses: 1 }],
    [{ label: "\u200b", days: 7, maxUses: 1 }],
    [{ label: "\u200b\u200b", days: 7, maxUses: 1 }],
    [{ label: "a\u2066b", days: 7, maxUses: 1 }],
    [{ label: "a\u2069b", days: 7, maxUses: 1 }],
    [{ label: "a\u2028b", days: 7, maxUses: 1 }],
    [{ label: "a\u2029b", days: 7, maxUses: 1 }],
    // ZWJ (U+200D) เป็น Cf: ตัดสินใจไม่รองรับ emoji แบบ ZWJ sequence ในป้าย
    [{ label: "👨\u200d👩\u200d👧", days: 7, maxUses: 1 }],
  ])("ปฏิเสธ %j", (input) => {
    expect(adminInviteInputSchema.safeParse(input).success).toBe(false);
  });
  it.each(["พี่แมว", "น้ำหนัก ก๊อก", "เพื่อน 🐱", "ทีม 💪 A", "❤️ ok"])("ยอมรับ %s", (label) => {
    expect(adminInviteInputSchema.safeParse({ label, days: 7, maxUses: 1 }).success).toBe(true);
  });
});
