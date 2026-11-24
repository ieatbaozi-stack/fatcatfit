import { describe, expect, it } from "vitest";
import { addSetToBests, computeBests, emptyBests, evaluateSession, recordsFor, type StatKind, type StatSet } from "./bests";

let n = 0;
const S = (o: Partial<StatSet> & { at?: number }): StatSet => ({
  id: `s${++n}`,
  completed_at: new Date(Date.UTC(2026, 0, 1, 10, 0, o.at ?? n)).toISOString(),
  position: n,
  set_kind: "normal",
  weight_kg: null,
  reps: null,
  duration_s: null,
  distance_m: null,
  incline_pct: null,
  ...o,
});
const ext: StatKind = { track_type: "weight_reps", load_mode: "external" };
const bw: StatKind = { track_type: "weight_reps", load_mode: "bodyweight_plus" };
const asst: StatKind = { track_type: "weight_reps", load_mode: "assisted" };
const run: StatKind = { track_type: "distance_duration", load_mode: "external" };
const tread: StatKind = { track_type: "incline_speed_duration", load_mode: "external" };

describe("weight_reps external", () => {
  const prior = computeBests(ext, [S({ weight_kg: 60, reps: 8 }), S({ weight_kg: 50, reps: 12 })]);
  it("น้ำหนักสูงสุด: มากกว่าชนะ · เท่ากันไม่นับ", () => {
    expect(recordsFor(ext, prior, S({ weight_kg: 62.5, reps: 1 }))).toContain("max_weight");
    expect(recordsFor(ext, prior, S({ weight_kg: 60, reps: 1 }))).not.toContain("max_weight");
  });
  it("ครั้งมากสุดที่น้ำหนัก ≥ เดิม: เทียบเฉพาะเซ็ตที่หนักเท่ากันหรือกว่า", () => {
    expect(recordsFor(ext, prior, S({ weight_kg: 60, reps: 9 }))).toEqual(["reps_at_weight"]);
    expect(recordsFor(ext, prior, S({ weight_kg: 60, reps: 8 }))).toEqual([]);
    // 55 kg × 9: เซ็ตฐานที่ ≥ 55 คือ 60×8 → ชนะ
    expect(recordsFor(ext, prior, S({ weight_kg: 55, reps: 9 }))).toEqual(["reps_at_weight"]);
    // 50 kg × 11: ฐาน ≥ 50 มี 50×12 → ไม่ชนะ
    expect(recordsFor(ext, prior, S({ weight_kg: 50, reps: 11 }))).toEqual([]);
  });
  it("หนักกว่าทุกเซ็ตฐาน: ไม่มีเซ็ตให้เทียบครั้ง → ได้แค่ max_weight", () => {
    expect(recordsFor(ext, prior, S({ weight_kg: 100, reps: 1 }))).toEqual(["max_weight"]);
  });
  it("frontier ตัดจุดที่ถูกข่มทิ้ง", () => {
    const b = computeBests(ext, [S({ weight_kg: 50, reps: 10 }), S({ weight_kg: 60, reps: 10 })]);
    expect(b.reps_at_weight).toEqual([{ weight_kg: 60, reps: 10 }]);
    const c = computeBests(ext, [S({ weight_kg: 50, reps: 12 }), S({ weight_kg: 60, reps: 10 })]);
    expect(c.reps_at_weight).toHaveLength(2);
  });
  it("วอร์มอัพไม่นับ ทั้งชนะและเป็นฐาน", () => {
    expect(recordsFor(ext, prior, S({ weight_kg: 200, reps: 20, set_kind: "warmup" }))).toEqual([]);
    expect(addSetToBests(ext, prior, S({ weight_kg: 200, reps: 20, set_kind: "warmup" }))).toBe(prior);
  });
  it("lb→kg ที่เท่ากันภายใน epsilon ไม่นับ", () => {
    expect(recordsFor(ext, prior, S({ weight_kg: 60 + 1e-9, reps: 1 }))).not.toContain("max_weight");
  });
});

describe("น้ำหนักตัว / เครื่องช่วย", () => {
  it("bodyweight_plus: น้ำหนักถ่วง null = 0 · ถ่วงสูงสุดต้อง > 0 · ครั้งมากสุดที่ถ่วง ≥ เดิม", () => {
    const prior = computeBests(bw, [S({ weight_kg: null, reps: 10 }), S({ weight_kg: 10, reps: 6 })]);
    expect(recordsFor(bw, prior, S({ weight_kg: null, reps: 11 }))).toEqual(["reps_at_weight"]);
    expect(recordsFor(bw, prior, S({ weight_kg: 12.5, reps: 5 }))).toEqual(["max_extra_weight"]);
    expect(recordsFor(bw, prior, S({ weight_kg: 10, reps: 7 }))).toEqual(["reps_at_weight"]);
    const zero = computeBests(bw, [S({ weight_kg: null, reps: 10 })]);
    expect(recordsFor(bw, zero, S({ weight_kg: null, reps: 10 }))).toEqual([]);
  });
  it("assisted: ช่วยน้อยกว่าชนะ · ครั้งมากสุดที่ช่วย ≤ เดิม", () => {
    const prior = computeBests(asst, [S({ weight_kg: 30, reps: 8 }), S({ weight_kg: 20, reps: 5 })]);
    expect(recordsFor(asst, prior, S({ weight_kg: 15, reps: 3 }))).toEqual(["min_assist"]);
    expect(recordsFor(asst, prior, S({ weight_kg: 20, reps: 6 }))).toEqual(["reps_at_weight"]);
    expect(recordsFor(asst, prior, S({ weight_kg: 20, reps: 5 }))).toEqual([]);
    // ช่วยมากกว่า (30) แต่ ≤ ไม่เจอฐานที่ ≤ 30 ที่ครั้งน้อยกว่า: 30×8 vs ฐาน ≤30 = {8, 5} → 9 ชนะ
    expect(recordsFor(asst, prior, S({ weight_kg: 30, reps: 9 }))).toEqual(["reps_at_weight"]);
  });
});

describe("ชนิดอื่น", () => {
  it("reps_only / duration", () => {
    const r: StatKind = { track_type: "reps_only", load_mode: "external" };
    const d: StatKind = { track_type: "duration", load_mode: "external" };
    expect(recordsFor(r, computeBests(r, [S({ reps: 20 })]), S({ reps: 21 }))).toEqual(["max_reps"]);
    expect(recordsFor(r, computeBests(r, [S({ reps: 20 })]), S({ reps: 20 }))).toEqual([]);
    expect(recordsFor(d, computeBests(d, [S({ duration_s: 60 })]), S({ duration_s: 61 }))).toEqual(["max_duration"]);
  });
  it("weight_duration: น้ำหนัก ↑ · เวลามากสุดที่น้ำหนัก ≥ เดิม", () => {
    const k: StatKind = { track_type: "weight_duration", load_mode: "external" };
    const prior = computeBests(k, [S({ weight_kg: 20, duration_s: 30 })]);
    expect(recordsFor(k, prior, S({ weight_kg: 20, duration_s: 31 }))).toEqual(["duration_at_weight"]);
    expect(recordsFor(k, prior, S({ weight_kg: 25, duration_s: 10 }))).toEqual(["max_weight"]);
  });
  it("วิ่ง: ไกลสุด · นานสุด · เพซเฉพาะ ≥ 1 km · เซ็ตไม่มีระยะไม่นับระยะ/เพซ", () => {
    const prior = computeBests(run, [S({ distance_m: 5000, duration_s: 1800 })]); // 6:00/km
    expect(recordsFor(run, prior, S({ distance_m: 5001, duration_s: 1800 })).sort()).toEqual(["best_pace", "max_distance"]);
    expect(recordsFor(run, prior, S({ distance_m: 5000, duration_s: 1799 }))).toEqual(["best_pace"]);
    expect(recordsFor(run, prior, S({ distance_m: 5000, duration_s: 1800 }))).toEqual([]);
    // 500 m เร็วมากแต่ไม่ถึง 1 km → เพซไม่นับ
    expect(recordsFor(run, prior, S({ distance_m: 500, duration_s: 100 }))).toEqual([]);
    // ไม่มีระยะ แต่นานกว่า
    expect(recordsFor(run, prior, S({ distance_m: null, duration_s: 2000 }))).toEqual(["max_duration"]);
    expect(prior.best_pace_s_per_km).toBeCloseTo(360, 9);
    expect(computeBests(run, [S({ distance_m: 999, duration_s: 100 })]).best_pace_s_per_km).toBeNull();
  });
  it("ลู่วิ่ง: เวลามากสุดที่ความชัน ≥ เดิม", () => {
    const prior = computeBests(tread, [S({ duration_s: 600, incline_pct: 5 }), S({ duration_s: 900, incline_pct: 1 })]);
    expect(recordsFor(tread, prior, S({ duration_s: 601, incline_pct: 5 }))).toEqual(["duration_at_incline"]);
    expect(recordsFor(tread, prior, S({ duration_s: 800, incline_pct: 3 }))).toEqual(["duration_at_incline"]);
    expect(recordsFor(tread, prior, S({ duration_s: 600, incline_pct: 5 }))).toEqual([]);
    expect(recordsFor(tread, prior, S({ duration_s: 5000, incline_pct: 10 }))).toEqual([]);
  });
});

describe("evaluateSession: ฉลอง", () => {
  it("เซสชันแรก (ไม่มีประวัติ) ไม่ฉลองและไม่มีดาว", () => {
    const ev = evaluateSession(ext, [], [S({ position: 0, weight_kg: 20, reps: 5 }), S({ position: 1, weight_kg: 30, reps: 5 })]);
    expect(ev.every((e) => !e.celebrate && e.records.length === 0)).toBe(true);
  });
  it("ประวัติมีแต่วอร์มอัพ = นับเป็นครั้งแรก", () => {
    const ev = evaluateSession(ext, [S({ weight_kg: 100, reps: 5, set_kind: "warmup" })], [S({ position: 0, weight_kg: 20, reps: 5 })]);
    expect(ev[0].records).toEqual([]);
  });
  it("ฉลองเซ็ตแรกที่ชนะเท่านั้น เซ็ตที่ชนะต่อมาได้แค่ดาว · วอร์มอัพไม่ฉลองและไม่เป็นฐาน", () => {
    const history = [S({ weight_kg: 60, reps: 8 })];
    const ev = evaluateSession(
      ext,
      history,
      [
        S({ position: 0, weight_kg: 100, reps: 1, set_kind: "warmup" }),
        S({ position: 1, weight_kg: 60, reps: 8 }),
        S({ position: 2, weight_kg: 62.5, reps: 5 }),
        S({ position: 3, weight_kg: 65, reps: 5 }),
        S({ position: 4, weight_kg: 65, reps: 5 }),
      ],
    );
    expect(ev.map((e) => e.celebrate)).toEqual([false, false, true, false, false]);
    expect(ev.map((e) => e.records.length > 0)).toEqual([false, false, true, true, false]);
  });
  it("เรียงตาม position ก่อน แล้ว completed_at (แม้ส่งมาสลับ)", () => {
    const a = S({ position: 1, weight_kg: 70, reps: 5, at: 5 });
    const b = S({ position: 0, weight_kg: 65, reps: 5, at: 9 });
    const ev = evaluateSession(ext, [S({ weight_kg: 60, reps: 5 })], [a, b]);
    expect(ev.map((e) => e.set.position)).toEqual([0, 1]);
    expect(ev[0].celebrate).toBe(true);
  });
  it("computeBests ของชุดว่าง = emptyBests", () => {
    expect(computeBests(ext, [])).toEqual(emptyBests());
  });
});
