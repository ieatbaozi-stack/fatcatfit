import { describe, expect, it } from "vitest";
import { normalizeQuery, searchExercises, type SearchableExercise } from "./exercise-search";

let n = 0;
const ex = (name: string, name_th: string | null, terms: string | null, over: Partial<SearchableExercise> = {}): SearchableExercise => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  name,
  name_th,
  search_terms: terms,
  owner_user_id: null,
  category: "chest",
  archived_at: null,
  ...over,
});

const bench = ex("Barbell Bench Press", "เบนช์เพรส", "เบนช์|เบ็นช์เพรส|เบนซเพรส|bench");
const catalog = [
  ex("Dumbbell Bench Press", "ดัมเบลเบนช์เพรส", "เบนช์|ดัมเบล"),
  bench,
  ex("Incline Bench Press", "อินคไลน์เบนช์เพรส", "เบนช์เอียง"),
  ex("Reverse Grip Bench Press", "รีเวิร์สกริปเบนช์เพรส", null),
  ex("Badminton", "แบดมินตัน", "แบด|ตีแบด", { category: "sport" }),
  ex("Squat", "สควอท", null, { category: "legs" }),
  ex("Old Move", "ท่าเก่า", null, { archived_at: "2026-01-01T00:00:00.000Z" }),
];

const names = (r: SearchableExercise[]) => r.map((e) => e.name);

describe("normalizeQuery", () => {
  it("ตัดช่องว่าง ขีด วรรคตอน วรรณยุกต์ไทย และทำเป็นตัวเล็ก", () => {
    expect(normalizeQuery("  Bench-Press! ")).toBe("benchpress");
    expect(normalizeQuery("เบนช์")).toBe("เบนช");
    expect(normalizeQuery("เบ็นช์เพรส")).toBe("เบนชเพรส");
    expect(normalizeQuery("เบนช เพรส")).toBe("เบนชเพรส");
    expect(normalizeQuery("   ")).toBe("");
  });
  it("NFC: สระ/วรรณยุกต์ที่พิมพ์คนละลำดับรหัสไม่ทำให้พลาด", () => {
    expect(normalizeQuery("é")).toBe(normalizeQuery("é"));
  });
});

describe("searchExercises", () => {
  it('"bench" → Barbell Bench Press อยู่ 3 อันดับแรก', () => {
    const r = names(searchExercises(catalog, "bench"));
    expect(r.indexOf("Barbell Bench Press")).toBeLessThan(3);
    expect(r).toContain("Incline Bench Press");
    expect(r).not.toContain("Squat");
  });
  it('"เบนช์" "เบ็นช์เพรส" "เบนช เพรส" เจอท่าเดียวกัน', () => {
    for (const q of ["เบนช์", "เบ็นช์เพรส", "เบนช เพรส"]) {
      expect(names(searchExercises(catalog, q))).toContain("Barbell Bench Press");
    }
    const withVariant = [bench, ex("Squat", "สควอท", null)];
    for (const q of ["เบนช์", "เบ็นช์เพรส", "เบนช เพรส", "เบนซ"]) {
      expect(names(searchExercises(withVariant, q))).toEqual(["Barbell Bench Press"]);
    }
  });
  it('"แบด" → แบดมินตัน', () => {
    expect(names(searchExercises(catalog, "แบด"))).toEqual(["Badminton"]);
  });
  it("คำที่ 0 > คำถัดไป > กลางคำ (ตัดคำอุปกรณ์หน้าชื่อก่อนนับ)", () => {
    const list = [ex("Cable Row", null, null, { name_th: "เคเบิลโรว์" }), ex("Rowing", "พาย", null), ex("Arrow", "y", null)];
    expect(names(searchExercises(list, "row"))).toEqual(["Cable Row", "Rowing", "Arrow"]);
  });
  it("ตรงทั้งชื่อ (อังกฤษ/ไทย) ขึ้นก่อน · แล้วชื่อสั้นกว่า · แล้วตัวอักษร (ชื่อจริงในคลัง)", () => {
    const real = [
      ex("Drop Push", "ดรอปพุช (วิดพื้นหย่อนลงระหว่างกล่อง)", "วิดพื้นกล่อง|plyo pushup box"),
      ex("Pushups", "วิดพื้น", "พุชอัพ|ดันพื้น|push up"),
      ex("Squat Jerk", "สควอทเจิร์ก", "สควอตเจิร์ก"),
      ex("Barbell Squat", "บาร์เบลสควอท", "สควอทหลัง|back squat"),
      ex("Deadlift with Bands", "เดดลิฟต์ ใช้ยางยืด", "เดดลิฟท์ ใช้แบนด์"),
      ex("Barbell Deadlift", "บาร์เบลเดดลิฟต์", "เดดลิฟ|ยกเดดลิฟ"),
    ];
    expect(names(searchExercises(real, "วิดพื้น"))[0]).toBe("Pushups");
    expect(names(searchExercises(real, "pushups"))[0]).toBe("Pushups");
    expect(names(searchExercises(real, "squat"))).toEqual(["Barbell Squat", "Squat Jerk"]);
    expect(names(searchExercises(real, "deadlift"))).toEqual(["Barbell Deadlift", "Deadlift with Bands"]);
    expect(names(searchExercises(real, "deadlift"))[0]).toBe("Barbell Deadlift");
    // เสมอกัน: สั้นกว่าก่อน แล้วตัวอักษร
    const tie = [ex("Zzz Press", null, null), ex("Aaa Press", null, null), ex("Press Up Long Name", null, null), ex("Press Up", null, null)];
    expect(names(searchExercises(tie, "press"))).toEqual(["Press Up", "Press Up Long Name", "Aaa Press", "Zzz Press"]);
  });
  it("ท่าของฉันที่ตรงเท่ากันขึ้นก่อนคลัง", () => {
    const mine = ex("Bench Press Custom", "ของฉัน", null, { owner_user_id: "11111111-1111-4111-8111-111111111111" });
    const lib = ex("Bench Press Alpha", "คลัง", null);
    expect(names(searchExercises([lib, mine], "bench press"))[0]).toBe("Bench Press Custom");
    // อันดับดีกว่ายังชนะแม้เป็นท่าคลัง
    const lib2 = ex("Bench", "b", null);
    const mine2 = ex("My Bench", "ของฉัน2", null, { owner_user_id: "11111111-1111-4111-8111-111111111111" });
    expect(names(searchExercises([mine2, lib2], "bench"))[0]).toBe("Bench");
  });
  it("ซ่อนท่าที่เก็บเข้ากรุ เว้นแต่ขอ · กรองหมวด · คำค้นว่าง = ทุกท่าในหมวด", () => {
    expect(names(searchExercises(catalog, "ท่าเก่า"))).toEqual([]);
    expect(names(searchExercises(catalog, "ท่าเก่า", { includeArchived: true }))).toEqual(["Old Move"]);
    expect(names(searchExercises(catalog, "", { category: "legs" }))).toEqual(["Squat"]);
    expect(searchExercises(catalog, "  ")).toHaveLength(catalog.length - 1);
    expect(searchExercises(catalog, "", { limit: 2 })).toHaveLength(2);
  });
  it("ไม่พังเมื่อ name_th/search_terms เป็น null", () => {
    expect(names(searchExercises([ex("Plank", null, null)], "plank"))).toEqual(["Plank"]);
  });
});
