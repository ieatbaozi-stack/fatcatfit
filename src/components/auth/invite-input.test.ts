import { describe, expect, it } from "vitest";
import { classifyCallbackError, compactInvite, formatInviteInput, isInviteShapeValid, readInviteFromHash } from "./invite-input";

describe("ช่องโค้ดเชิญ", () => {
  it("จัดรูปเป็น XXXX-XXXX ตัวพิมพ์ใหญ่ ตัดตัวอักษรนอกชุด", () => {
    expect(formatInviteInput("mewp4823")).toBe("MEWP-4823");
    expect(formatInviteInput("mewp-48")).toBe("MEWP-48");
    expect(formatInviteInput("me")).toBe("ME");
    // I L O 0 1 ไม่อยู่ในชุดตัวอักษร
    expect(compactInvite("IL0O1-abcd")).toBe("ABCD");
    expect(compactInvite("ABCDEFGHJK")).toBe("ABCDEFGH");
  });

  it("ตรวจรูปแบบครบ 8 ตัว", () => {
    expect(isInviteShapeValid("MEWP-4823")).toBe(true);
    expect(isInviteShapeValid("MEWP-482")).toBe(false);
    expect(isInviteShapeValid("")).toBe(false);
  });

  it("อ่านโค้ดจาก #invite= (รวม URL-encode) · ไม่มี/ว่าง = null", () => {
    expect(readInviteFromHash("#invite=MEWP-4823")).toBe("MEWP-4823");
    expect(readInviteFromHash("#invite=mewp4823")).toBe("MEWP-4823");
    expect(readInviteFromHash("#invite=MEWP%2D4823")).toBe("MEWP-4823");
    expect(readInviteFromHash("#invite=")).toBeNull();
    expect(readInviteFromHash("#other=1")).toBeNull();
    expect(readInviteFromHash("")).toBeNull();
  });

  it("แยกชนิด error จาก callback", () => {
    expect(classifyCallbackError("invite_required")).toBe("invite_required");
    expect(classifyCallbackError("INVITE_REQUIRED")).toBe("invite_required");
    expect(classifyCallbackError("access_denied")).toBe("generic");
    expect(classifyCallbackError(null)).toBeNull();
  });
});
