import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { createTestDb, type TestDb } from "../src/db/testing/pglite";
import { exercise, user } from "../src/db/schema";
import { catalogId, checkCatalog, flattenFiles, uuidV5, loadCatalog, loadCatalogFiles, mapRaw, syncCatalog, type CatalogRow, type RawExercise } from "./seed-lib";
import { runCheck } from "./seed-check";
import { seedExercises } from "./seed-exercises";
import { convertFreeExerciseDb, convertOwn, serializeFile } from "./seed-convert";
import { buildSearchTerms, composeNameTh } from "./seed-name-th";

const raw = (o: Partial<RawExercise> & { name: string }): RawExercise => ({ id: o.name.replace(/\W+/g, "_"), category: "strength", equipment: "barbell", force: "push", primaryMuscles: ["chest"], ...o });

describe("แมป track_type / load_mode (ADR 0008 ข้อ 4)", () => {
  const m = (o: Partial<RawExercise> & { name: string }) => mapRaw(raw(o));
  it("ท่าเวททั่วไป = weight_reps/external", () => {
    expect(m({ name: "Barbell Bench Press" })).toMatchObject({ track_type: "weight_reps", load_mode: "external", category: "chest", equipment: "barbell" });
  });
  it("assisted → weight_reps/assisted (ข้อ 1)", () => {
    expect(m({ name: "Band Assisted Pull-Up", equipment: "bands" })).toMatchObject({ track_type: "weight_reps", load_mode: "assisted" });
  });
  it("treadmill → incline_speed_duration (ข้อ 2) และไม่เป็นทีละข้าง", () => {
    expect(m({ name: "Running, Treadmill", category: "cardio", equipment: "machine" })).toMatchObject({ track_type: "incline_speed_duration", is_unilateral: false });
  });
  it("คาร์ดิโอวิ่ง/ปั่น/พาย = distance_duration (ข้อ 3) · เชือก = duration (ข้อ 6)", () => {
    expect(m({ name: "Recumbent Bike", category: "cardio" }).track_type).toBe("distance_duration");
    expect(m({ name: "Rope Jumping", category: "cardio" }).track_type).toBe("duration");
  });
  it("farmer/carry/yoke = weight_duration (ข้อ 4)", () => {
    expect(m({ name: "Farmer's Walk", category: "strongman", equipment: "other" }).track_type).toBe("weight_duration");
  });
  it("stretching / force static / plank = duration (ข้อ 5) แต่ Hanging Leg Raise และ Hang Clean ไม่ใช่", () => {
    expect(m({ name: "Calf Stretch", category: "stretching", equipment: null }).track_type).toBe("duration");
    expect(m({ name: "Plank", equipment: "body only", force: "static" }).track_type).toBe("duration");
    expect(m({ name: "Hanging Leg Raise", equipment: "body only", force: "pull" }).track_type).toBe("reps_only");
    expect(m({ name: "Hang Clean", category: "olympic weightlifting" }).track_type).toBe("weight_reps");
    expect(m({ name: "One Handed Hang", equipment: "body only", force: "pull" }).track_type).toBe("duration");
  });
  it("pull-up/chin-up/dip น้ำหนักตัว = bodyweight_plus (ข้อ 7) · น้ำหนักตัวอื่น = reps_only (ข้อ 8)", () => {
    expect(m({ name: "Pullups", equipment: "body only" })).toMatchObject({ track_type: "weight_reps", load_mode: "bodyweight_plus" });
    expect(m({ name: "Parallel Bar Dip", equipment: "body only" }).load_mode).toBe("bodyweight_plus");
    expect(m({ name: "Pushups", equipment: "body only" })).toMatchObject({ track_type: "reps_only", load_mode: "external" });
  });
  it("is_unilateral ตามคำในชื่อ ไม่นับ alternating", () => {
    expect(m({ name: "One-Arm Dumbbell Row" }).is_unilateral).toBe(true);
    expect(m({ name: "Single-Leg Press" }).is_unilateral).toBe(true);
    expect(m({ name: "Kettlebell One-Legged Deadlift" }).is_unilateral).toBe(true);
    expect(m({ name: "Alternating Kettlebell Press" }).is_unilateral).toBe(false);
  });
  it("แมปหมวด/อุปกรณ์ตามกติกา", () => {
    expect(m({ name: "x", category: "stretching", equipment: "foam roll" })).toMatchObject({ category: "mobility", equipment: "other" });
    expect(m({ name: "x", category: "strongman", equipment: "e-z curl bar" })).toMatchObject({ category: "full_body", equipment: "barbell" });
    expect(m({ name: "x", primaryMuscles: ["lats"], equipment: null })).toMatchObject({ category: "back", equipment: null });
    expect(m({ name: "x", primaryMuscles: [] }).category).toBe("other");
  });
  it("overrides แก้ค่าได้ และถอย load_mode ให้ตรง CHECK / ปิด unilateral ของ distance", () => {
    const r = raw({ name: "One-Arm Thing", id: "t1" });
    const out = mapRaw(r, { t1: { reason: "ทดสอบ", track_type: "distance_duration", load_mode: "bodyweight_plus" } });
    expect(out).toMatchObject({ track_type: "distance_duration", load_mode: "external", is_unilateral: false });
  });
});

describe("ร่างชื่อไทย/คำค้น", () => {
  it("ทับศัพท์สม่ำเสมอ และใช้ override ของชื่อพิเศษ", () => {
    expect(composeNameTh("Barbell Bench Press - Medium Grip").text).toBe("บาร์เบลเบนช์เพรส กริปกลาง");
    expect(composeNameTh("Pushups").text).toBe("วิดพื้น");
    expect(composeNameTh("Dumbbell Curl").missing).toEqual([]);
  });
  it("คำที่ไม่รู้จักถูกรายงานใน missing", () => {
    expect(composeNameTh("Flurbo Press").missing).toEqual(["flurbo"]);
  });
  it("คำค้นสะกดอื่นมาจากชื่อไทยสำเร็จรูป (ไม่แปลคำใหม่)", () => {
    expect(buildSearchTerms("Barbell Squat", "บาร์เบลสควอท")).toContain("บาร์เบลล์สควอต");
    for (const t of buildSearchTerms("Linear Depth Jump", "ลิเนียร์เดปธ์จัมพ์")) expect(t).not.toMatch(/เส้นตรง/);
  });
  it("คำค้นมีตัวย่ออังกฤษและไม่มีชื่อหลักซ้ำ", () => {
    const t = buildSearchTerms("Dumbbell Bench Press", "ดัมเบลเบนช์เพรส");
    expect(t).toContain("db bench press");
    expect(t).not.toContain("ดัมเบลเบนช์เพรส");
  });
});

describe("แปลงชุดข้อมูล: id คงที่เมื่อรันซ้ำ และไม่นำ instructions/รูป", () => {
  const rows: RawExercise[] = [raw({ name: "Barbell Curl", primaryMuscles: ["biceps"] }), raw({ name: "Dumbbell Squat", primaryMuscles: ["quadriceps"], equipment: "dumbbell" })];
  it("รอบสองจับคู่ด้วย source_ref ได้ id/name_th/search_terms เดิม แม้แก้มือ", () => {
    const first = convertFreeExerciseDb(rows, [], {}).rows;
    first[0]!.name_th = "แก้มือ";
    const second = convertFreeExerciseDb([...rows].reverse(), first, {}).rows;
    for (const r of first) expect(second.find((x) => x.source_ref === r.source_ref)).toEqual(r);
  });
  it("แถวของทีมเองคง id ตาม slug", () => {
    const a = convertOwn();
    expect(convertOwn()).toEqual(a);
    for (const r of a) expect(r.id).toBe(catalogId("fatcatfit", r.source_ref));
  });
  it("ไฟล์ที่เขียนไม่มีช่องต้องห้าม", () => {
    const file = serializeFile({
      source_dataset: "free-exercise-db",
      license: "Unlicense",
      attribution: "x",
      upstream_commit: "0".repeat(40),
      upstream_url: null,
      exercises: convertFreeExerciseDb(rows, [], {}).rows,
    });
    expect(file).not.toMatch(/instructions|images/);
    expect(() => JSON.parse(file)).not.toThrow();
  });
});

describe("UUID v5 ของคลัง", () => {
  it("ตรงเวกเตอร์มาตรฐาน RFC (DNS namespace · python.org)", () => {
    expect(uuidV5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
  });
  it("id คงที่ต่อ dataset:ref และทุกแถวในไฟล์จริงเป็น v5 ที่คำนวณได้", () => {
    expect(catalogId("free-exercise-db", "Plank")).toBe(catalogId("free-exercise-db", "Plank"));
    expect(catalogId("free-exercise-db", "Plank")).not.toBe(catalogId("fatcatfit", "Plank"));
    for (const r of loadCatalog().rows) {
      expect(r.id[14]).toBe("5");
      expect(r.id).toBe(catalogId(r.source_dataset, r.source_ref));
    }
  });
});

describe("ตรวจคลัง (checkCatalog)", () => {
  const good = (i: number, over: Partial<CatalogRow> = {}): CatalogRow => ({
    id: catalogId("fatcatfit", `r${i}`),
    source_dataset: "fatcatfit",
    source_ref: `r${i}`,
    license: "original",
    attribution: "Fat Cat Fit",
    name: `Move ${i}`,
    name_th: `ท่า${"ก".repeat(1)}${"ข".repeat(i % 5)}${i}`,
    search_terms: [],
    track_type: "weight_reps",
    load_mode: "external",
    is_unilateral: false,
    category: "chest",
    equipment: null,
    ...over,
  });
  const set = (n: number, cs = 60) => [
    ...Array.from({ length: n }, (_, i) => good(i + 1, { name_th: `ท่าเวท${String.fromCharCode(0x0e01 + (i % 40))}${String.fromCharCode(0x0e01 + Math.floor(i / 40))}` })),
    ...Array.from({ length: cs }, (_, i) => good(1000 + i, { category: "sport", track_type: "duration", name_th: `กีฬา${String.fromCharCode(0x0e01 + (i % 40))}${String.fromCharCode(0x0e01 + Math.floor(i / 40))}` })),
  ];
  it("ชุดที่ถูกต้องผ่าน", () => {
    const r = checkCatalog(set(750));
    expect(r.errors).toEqual([]);
    expect(r.stats).toMatchObject({ weights: 750, sport: 60 });
  });
  it("จับข้อผิดตามเกณฑ์", () => {
    const base = set(750);
    const bad = (over: Partial<CatalogRow>) => checkCatalog([{ ...base[0]!, ...over }, ...base.slice(1)]).errors.join("\n");
    expect(bad({ id: "not-a-uuid" })).toMatch(/UUID v5/);
    expect(bad({ id: "00000000-0000-4000-8000-000000000001" })).toMatch(/UUID v5/);
    expect(bad({ id: base[1]!.id })).toMatch(/ไม่ตรงกับ v5/);
    expect(checkCatalog([...base, base[0]!]).errors.join(" ; ")).toMatch(/id ซ้ำ/);
    expect(bad({ name: base[1]!.name })).toMatch(/name ซ้ำ/);
    expect(bad({ name: "x".repeat(61) })).toMatch(/1–60/);
    expect(bad({ name_th: "" })).toMatch(/name_th/);
    expect(bad({ name_th: "abc" })).toMatch(/อักษรไทย/);
    expect(bad({ track_type: "nope" as never })).toMatch(/track_type/);
    expect(bad({ category: "nope" as never })).toMatch(/category/);
    expect(bad({ equipment: "nope" as never })).toMatch(/equipment/);
    expect(bad({ load_mode: "assisted", track_type: "duration" })).toMatch(/weight_reps/);
    expect(bad({ license: "MIT" })).toMatch(/license/);
    expect(bad({ search_terms: ["a|b"] })).toMatch(/ตัวคั่น/);
  });
  it("distance_duration / incline_speed_duration ห้ามเป็นทีละข้าง", () => {
    const base = set(750);
    for (const tt of ["distance_duration", "incline_speed_duration"] as const) {
      const r = checkCatalog([{ ...base[0]!, track_type: tt, is_unilateral: true }, ...base.slice(1)]);
      expect(r.errors.join("\n")).toMatch(/is_unilateral ต้องเป็น false/);
    }
  });
  it("จำนวนท่าเวทน้อยกว่า 750 / คาร์ดิโอ+กีฬานอก 60–100 ไม่ผ่าน", () => {
    expect(checkCatalog(set(700)).errors.join()).toMatch(/ท่าเวท 700/);
    expect(checkCatalog(set(750, 101)).errors.join()).toMatch(/คาร์ดิโอ\+กีฬา 101/);
    expect(checkCatalog(set(750, 59)).errors.join()).toMatch(/คาร์ดิโอ\+กีฬา 59/);
  });
  it("ไฟล์ที่มี instructions/images หรือชุดข้อมูลไม่รู้จัก = ผิด", () => {
    const meta = { source_dataset: "fatcatfit", license: "original", attribution: "Fat Cat Fit", upstream_commit: null, upstream_url: null };
    const { errors } = flattenFiles([
      { file: "a.json", data: { ...meta, instructions: ["x"], exercises: [{ ...good(1), images: ["i.jpg"] }] } },
      { file: "b.json", data: { ...meta, source_dataset: "wger", exercises: [] } },
    ]);
    expect(errors.join("\n")).toMatch(/ช่องต้องห้าม "instructions"/);
    expect(errors.join("\n")).toMatch(/ช่องต้องห้าม "images"/);
    expect(errors.join("\n")).toMatch(/wger/);
  });
});

describe("ไฟล์คลังจริงใน content/exercises", () => {
  it("ผ่านเกณฑ์ผ่านข้อ 3 ทั้งหมด", () => {
    const r = runCheck();
    expect(r.lines.filter((l) => l.startsWith("ผิด"))).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("ล็อก commit ของต้นทางและไม่มีช่อง instructions/รูปในไฟล์ดิบ", () => {
    const files = loadCatalogFiles();
    const fe = files[0]!.data as { upstream_commit: string };
    expect(fe.upstream_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(JSON.stringify(files)).not.toMatch(/"instructions"|"images"/);
  });
});

describe("seed ลงฐานข้อมูล (PGlite · migration จริง)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("ฐานเปล่า: seed รอบแรกเพิ่มทุกแถว รอบสองเปลี่ยน 0 แถว และ updated_at/catalog_version เท่าเดิม", async () => {
    const total = loadCatalog().rows.length;
    const r1 = await seedExercises(t.db, undefined, new Date("2026-11-23T00:00:00Z"));
    expect(r1).toMatchObject({ inserted: total, updated: 0, archived: 0, changed: total });
    const version = async () => {
      const rows = await t.db.select().from(exercise).where(isNull(exercise.ownerUserId));
      return `${rows.length}-${Math.max(...rows.map((r) => r.updatedAt.getTime()))}`;
    };
    const v1 = await version();
    const r2 = await seedExercises(t.db, undefined, new Date("2026-11-24T00:00:00Z"));
    expect(r2).toMatchObject({ inserted: 0, updated: 0, archived: 0, unarchived: 0, changed: 0, unchanged: total });
    expect(await version()).toBe(v1);
  });

  it("แถวที่ลงฐานตรงกับไฟล์: ครบทุกช่องที่คลังต้องมี และ met = null", async () => {
    const rows = await t.db.select().from(exercise).where(isNull(exercise.ownerUserId));
    for (const r of rows) {
      expect(r.nameTh && r.sourceDataset && r.sourceRef && r.license && r.attribution).toBeTruthy();
      expect(r.met).toBeNull();
      expect(r.deletedAt).toBeNull();
      expect(r.clientUpdatedAt.getTime()).toBe(r.updatedAt.getTime());
    }
  });

  it("แก้เนื้อหา 1 แถว = แตะเฉพาะแถวนั้น · แถวที่หายจากไฟล์ = archived_at ไม่ลบ · กลับมา = เอาออกจากกรุ", async () => {
    const { rows } = loadCatalog();
    const edited = rows.map((r, i) => (i === 0 ? { ...r, name_th: `${r.name_th}แก้` } : r)).slice(0, rows.length - 1);
    const now = new Date("2026-11-25T00:00:00Z");
    const res = await syncCatalog(t.db, edited, now);
    expect(res).toMatchObject({ updated: 1, archived: 1, inserted: 0 });
    const touched = (await t.db.select().from(exercise).where(eq(exercise.updatedAt, now))).length;
    expect(touched).toBe(2);
    const gone = await t.db.select().from(exercise).where(eq(exercise.id, rows[rows.length - 1]!.id));
    expect(gone[0]?.archivedAt).not.toBeNull();

    const back = await syncCatalog(t.db, rows, new Date("2026-11-26T00:00:00Z"));
    expect(back).toMatchObject({ updated: 1, unarchived: 1 });
    const again = await syncCatalog(t.db, rows, new Date("2026-11-27T00:00:00Z"));
    expect(again.changed).toBe(0);
  });

  it("id คลังชนกับแถวของผู้ใช้ = ล้มพร้อมข้อความชัด ไม่เขียนอะไร", async () => {
    const fresh = await createTestDb();
    try {
      const now = new Date("2026-11-23T00:00:00Z");
      const uid = crypto.randomUUID();
      await fresh.db.insert(user).values({ id: uid, name: "t", email: "t@example.com", createdAt: now, updatedAt: now });
      const rows = loadCatalog().rows;
      await fresh.db.insert(exercise).values({
        id: rows[0]!.id, ownerUserId: uid, name: "Mine", trackType: "reps_only", loadMode: "external", isUnilateral: false, category: "core",
        createdAt: now, updatedAt: now, clientUpdatedAt: now,
      });
      await expect(syncCatalog(fresh.db, rows, now)).rejects.toThrow(/ชนกับแถวของผู้ใช้/);
      expect((await fresh.db.select().from(exercise)).length).toBe(1);
    } finally {
      await fresh.close();
    }
  });

  it("ไฟล์ที่ไม่ผ่านการตรวจ = ไม่เขียนอะไรลงฐาน", async () => {
    const before = (await t.db.select().from(exercise)).length;
    await expect(seedExercises(t.db, "scripts/__does_not_exist__")).rejects.toThrow();
    expect((await t.db.select().from(exercise)).length).toBe(before);
  });
});
