import { describe, expect, it } from "vitest";
import type { WirePlace } from "@/lib/data/shared/sync";
import { activeCount, archivedPlaces, atPlaceLimit, canArchive, currentPlace, isDuplicatePlace, placeNameValid, sortActive } from "./place-logic";

const p = (id: string, over: Partial<WirePlace> = {}): WirePlace => ({
  id,
  name: id,
  last_used_at: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  client_updated_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

const ARCHIVED = "2026-01-02T00:00:00.000Z";

describe("sortActive / currentPlace", () => {
  it("ใช้ล่าสุดก่อน · ไม่เคยใช้ตามหลังเรียงตามเวลาสร้าง · ไม่รวมในกรุ", () => {
    const list = [
      p("old", { created_at: "2026-01-01T00:00:00.000Z" }),
      p("newer", { created_at: "2026-02-01T00:00:00.000Z" }),
      p("used1", { last_used_at: "2026-03-01T00:00:00.000Z" }),
      p("used2", { last_used_at: "2026-04-01T00:00:00.000Z" }),
      p("gone", { archived_at: ARCHIVED, last_used_at: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(sortActive(list).map((x) => x.id)).toEqual(["used2", "used1", "old", "newer"]);
    expect(currentPlace(list)?.id).toBe("used2");
  });
  it("ไม่มีค่าใช้เลย = ที่สร้างก่อนสุด · ไม่มีที่ใช้งาน = null", () => {
    expect(currentPlace([p("b", { created_at: "2026-02-01T00:00:00.000Z" }), p("a")])?.id).toBe("a");
    expect(currentPlace([p("x", { archived_at: ARCHIVED })])).toBeNull();
  });
});

describe("กฎสถานที่ (D7)", () => {
  it("นับเฉพาะที่ไม่อยู่ในกรุ · ครบ 30 = เต็ม", () => {
    const many = Array.from({ length: 30 }, (_, i) => p(`p${i}`));
    expect(activeCount(many)).toBe(30);
    expect(atPlaceLimit(many)).toBe(true);
    expect(atPlaceLimit([...many.slice(1), p("z", { archived_at: ARCHIVED })])).toBe(false);
  });
  it("เก็บเข้ากรุได้เมื่อเหลือที่ใช้งานอย่างน้อย 1", () => {
    expect(canArchive([p("a")], "a")).toBe(false);
    expect(canArchive([p("a"), p("b")], "a")).toBe(true);
    expect(canArchive([p("a"), p("b", { archived_at: ARCHIVED })], "a")).toBe(false);
  });
  it("ชื่อซ้ำรวมในกรุ ไม่สนตัวพิมพ์ ไม่นับตัวเอง", () => {
    const list = [p("a", { name: "Home Gym" }), p("b", { name: "ออฟฟิศ", archived_at: ARCHIVED })];
    expect(isDuplicatePlace(" home gym ", list, null)).toBe(true);
    expect(isDuplicatePlace("ออฟฟิศ", list, null)).toBe(true);
    expect(isDuplicatePlace("home gym", list, "a")).toBe(false);
    expect(isDuplicatePlace("  ", list, null)).toBe(false);
  });
  it("ชื่อ 1–60 ตัว", () => {
    expect(placeNameValid("")).toBe(false);
    expect(placeNameValid("a")).toBe(true);
    expect(placeNameValid("ก".repeat(60))).toBe(true);
    expect(placeNameValid("ก".repeat(61))).toBe(false);
  });
  it("archivedPlaces เรียงตามชื่อ", () => {
    expect(archivedPlaces([p("b", { archived_at: ARCHIVED }), p("a", { archived_at: ARCHIVED }), p("c")]).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
