import { describe, expect, it } from "vitest";
import { clamp, decimalsOf, formatNumber, parseNumber, roundTo, stepValue } from "./number-field";

describe("parseNumber", () => {
  it("รับเลขปกติ ทศนิยม และจุลภาค", () => {
    expect(parseNumber("62")).toBe(62);
    expect(parseNumber("62.5")).toBe(62.5);
    expect(parseNumber(" 62,5 ")).toBe(62.5);
    expect(parseNumber("-3")).toBe(-3);
  });
  it("รับตอนกำลังพิมพ์ ('62.' และ '.5')", () => {
    expect(parseNumber("62.")).toBe(62);
    expect(parseNumber(".5")).toBe(0.5);
  });
  it("ปฏิเสธข้อความที่ไม่ใช่เลข", () => {
    for (const bad of ["", "abc", "1e3", "1.2.3", "--1", "12kg", "Infinity"]) {
      expect(parseNumber(bad), bad).toBeNull();
    }
  });
});

describe("stepValue", () => {
  it("เพิ่ม/ลดตาม step โดยไม่มีเศษทศนิยมลอย", () => {
    expect(stepValue(0.1, 1, 0.1)).toBe(0.2);
    expect(stepValue(0.2, 1, 0.1)).toBe(0.3);
    expect(stepValue(62.5, 1, 2.5)).toBe(65);
    expect(stepValue(62.5, -1, 2.5)).toBe(60);
  });
  it("ไม่เกิน min/max", () => {
    expect(stepValue(0, -1, 1, 0, 100)).toBe(0);
    expect(stepValue(100, 1, 1, 0, 100)).toBe(100);
  });
  it("ค่าว่างเริ่มจาก min หรือ 0", () => {
    expect(stepValue(null, 1, 1, 0)).toBe(1);
    expect(stepValue(null, 1, 2.5)).toBe(2.5);
    expect(stepValue(null, -1, 1, 5)).toBe(5);
  });
});

describe("helper", () => {
  it("decimalsOf", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(2.5)).toBe(1);
    expect(decimalsOf(0.125)).toBe(3);
  });
  it("roundTo / clamp / formatNumber", () => {
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(5)).toBe(5);
    expect(formatNumber(null, 1)).toBe("");
    expect(formatNumber(60, 1)).toBe("60");
    expect(formatNumber(62.5, 1)).toBe("62.5");
  });
});
