import { describe, expect, it } from "vitest";
import { buildInviteLink, clampUses, formatInviteDate, labelLength, splitWait } from "./invite-format";

describe("buildInviteLink", () => {
  it("ใช้ origin + /welcome#invite=โค้ด", () => {
    expect(buildInviteLink("https://fatcat.example.com", "ABCD-2345")).toBe("https://fatcat.example.com/welcome#invite=ABCD-2345");
  });
});

describe("formatInviteDate", () => {
  const now = new Date(2026, 10, 20, 9, 0);
  const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).toISOString();

  it("ปีปัจจุบัน: ไม่แสดงปี · 24 ชม.", () => {
    const th = formatInviteDate(at(2026, 10, 23, 14, 5), "th", now);
    expect(th).toContain("23");
    expect(th).toContain("14:05");
    expect(th).not.toContain("2026");
    expect(th).not.toContain("2569");
  });

  it("ปีอื่น: แสดงปี ค.ศ. (ไม่ใช่ พ.ศ.) ทั้งสองภาษา", () => {
    expect(formatInviteDate(at(2027, 0, 2, 0, 30), "th", now)).toContain("2027");
    expect(formatInviteDate(at(2027, 0, 2, 0, 30), "th", now)).not.toContain("2570");
    expect(formatInviteDate(at(2027, 0, 2, 0, 30), "en", now)).toContain("2027");
  });

  it("เที่ยงคืนเป็น 00:xx ไม่ใช่ 24:xx", () => {
    expect(formatInviteDate(at(2026, 10, 21, 0, 7), "th", now)).toContain("00:07");
  });

  it("ค่าที่อ่านไม่ได้ = ข้อความว่าง", () => {
    expect(formatInviteDate("nope", "th", now)).toBe("");
  });
});

describe("splitWait", () => {
  it("แยกตามช่วง และปัดนาทีขึ้น", () => {
    expect(splitWait(0)).toEqual({ kind: "underMinute" });
    expect(splitWait(59)).toEqual({ kind: "underMinute" });
    expect(splitWait(60)).toEqual({ kind: "minutes", m: 1 });
    expect(splitWait(61)).toEqual({ kind: "minutes", m: 2 });
    expect(splitWait(3599)).toEqual({ kind: "hoursMinutes", h: 1, m: 0 });
    expect(splitWait(3 * 3600 + 5 * 60)).toEqual({ kind: "hoursMinutes", h: 3, m: 5 });
  });
});

describe("clampUses / labelLength", () => {
  it("ดึงเข้าช่วง 1..10 · ว่าง = null", () => {
    expect(clampUses(null)).toBeNull();
    expect(clampUses(0)).toBe(1);
    expect(clampUses(99)).toBe(10);
    expect(clampUses(4)).toBe(4);
  });
  it("นับป้ายเป็นอักขระหลังตัดช่องว่าง", () => {
    expect(labelLength("  abc  ")).toBe(3);
    expect(labelLength("😀😀")).toBe(2);
    expect(labelLength("   ")).toBe(0);
  });
});
