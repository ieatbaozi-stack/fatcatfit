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
  ])("ปฏิเสธ %j", (input) => {
    expect(adminInviteInputSchema.safeParse(input).success).toBe(false);
  });
});
