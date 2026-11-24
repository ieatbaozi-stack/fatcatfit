import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { searchExercises, type SearchableExercise } from "./exercise-search";

// ค้นบนคลังจริง (content/exercises/*.json) — ตรวจเกณฑ์ contract ข้อ 4 กับข้อมูลที่จะ seed จริง

type Raw = { id: string; name: string; name_th: string; search_terms: string[] };
const dir = path.resolve(process.cwd(), "content", "exercises");
const catalog: SearchableExercise[] = ["free-exercise-db.json", "fatcatfit.json"].flatMap((f) =>
  (JSON.parse(readFileSync(path.join(dir, f), "utf8")).exercises as Raw[]).map((r) => ({
    id: r.id,
    name: r.name,
    name_th: r.name_th,
    search_terms: r.search_terms.length ? r.search_terms.join("|") : null,
    owner_user_id: null,
    category: "other",
    archived_at: null,
  })),
);
const top = (q: string, n = 3) => searchExercises(catalog, q, { limit: n }).map((e) => e.name);
const BENCH = "Barbell Bench Press - Medium Grip";

describe("ค้นบนคลังจริง", () => {
  it("คลังโหลดได้ครบ (>= 750 แถว)", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(750);
  });

  it('"bench" → Barbell Bench Press - Medium Grip อยู่ 3 อันดับแรก · ไม่มี Squat To A Bench นำหน้าท่าเพรส', () => {
    const r = searchExercises(catalog, "bench").map((e) => e.name);
    expect(r.slice(0, 3)).toContain(BENCH);
    const firstSquat = r.findIndex((n) => /Squat To A Bench/.test(n));
    const lastPress = Math.max(...["Barbell Bench Press - Medium Grip", "Dumbbell Bench Press", "Machine Bench Press"].map((n) => r.indexOf(n)));
    expect(firstSquat).toBeGreaterThan(lastPress);
  });

  it('"เบนช์" "เบ็นช์เพรส" "เบนช เพรส" "bench press" เจอท่าเบนช์เพรสบาร์เบลเดียวกัน (3 อันดับแรก)', () => {
    for (const q of ["bench", "bench press", "เบนช์", "เบ็นช์เพรส", "เบนช เพรส"]) expect(top(q), q).toContain(BENCH);
    expect(top("bench press", 1)).toEqual([BENCH]);
  });

  it('"squat" → Barbell Squat ก่อน Squat Jerk', () => {
    const r = searchExercises(catalog, "squat").map((e) => e.name);
    expect(r.indexOf("Barbell Squat")).toBeGreaterThanOrEqual(0);
    expect(r.indexOf("Barbell Squat")).toBeLessThan(r.indexOf("Squat Jerk"));
    expect(top("squat")).toContain("Barbell Squat");
  });

  it('"deadlift" → Barbell Deadlift ก่อน Deadlift with Bands', () => {
    const r = searchExercises(catalog, "deadlift").map((e) => e.name);
    expect(r.indexOf("Barbell Deadlift")).toBeLessThan(r.indexOf("Deadlift with Bands"));
    expect(top("deadlift")).toContain("Barbell Deadlift");
  });

  it('"วิดพื้น" → Pushups ก่อน Drop Push · "แบด" → Badminton', () => {
    const r = searchExercises(catalog, "วิดพื้น").map((e) => e.name);
    expect(r[0]).toBe("Pushups");
    const drop = r.indexOf("Drop Push");
    if (drop !== -1) expect(r.indexOf("Pushups")).toBeLessThan(drop);
    expect(top("แบด", 1)).toEqual(["Badminton"]);
  });

  it("พิมพ์ชื่ออังกฤษเต็มของท่า → ท่านั้นอยู่อันดับ 1 (ทุกแถว)", () => {
    const misses = catalog.filter((e) => searchExercises(catalog, e.name, { limit: 1 })[0].name !== e.name);
    // ชื่อซ้ำหลัง normalize (ต่างแค่วรรคตอน) ยอมได้ แต่ต้องไม่เกิน 1% ของคลัง
    expect(misses.length / catalog.length).toBeLessThan(0.01);
  });
});
