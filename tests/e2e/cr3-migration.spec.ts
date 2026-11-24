import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "@playwright/test";
import { seedExercises } from "../../scripts/seed-exercises";

// CR3 เกณฑ์ 5: migration 0004 บนฐานที่มีข้อมูล R2 อยู่แล้ว → แถวเดิมครบ · map_url = null · CHECK ใหม่ใช้ได้
// ไม่ใช้เบราว์เซอร์/เซิร์ฟเวอร์แอป: PGlite ในโปรเซสเทสต์ + migration จริงจาก drizzle/ (ตัด journal ให้หยุดที่ 0003 ก่อน)

const SRC = path.resolve(process.cwd(), "drizzle");
const UPGRADE = "0004_r3_place_map_url";

/** โฟลเดอร์ migration ชั่วคราวที่มีเฉพาะรายการก่อน tag ที่ให้ (journal + ไฟล์ sql) */
function foldersUpTo(tag: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fcf-mig-"));
  cpSync(SRC, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const i = journal.entries.findIndex((e) => e.tag === tag);
  expect(i, `migration ${tag} อยู่ใน journal`).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, i);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

test("CR3 เกณฑ์ 5: migrate 0004 บนฐาน R2 ที่มีข้อมูล → สถานที่/ท่าเดิมครบ · map_url = null · CHECK 1–500", async ({}, info) => {
  test.skip(info.project.name !== "mobile", "ไม่ขึ้นกับจอ — รันครั้งเดียว");
  const before = foldersUpTo(UPGRADE);
  const pg = new PGlite();
  try {
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: before });
    expect((await pg.query(`select 1 from information_schema.columns where table_name = 'place' and column_name = 'map_url'`)).rows).toHaveLength(0);

    // ข้อมูลแบบ R2: ผู้ใช้ 2 คน · สถานที่ใช้งาน/ในกรุ/ลบแล้ว · ท่าของฉัน + คลัง
    await seedExercises(db as unknown as Parameters<typeof seedExercises>[0]);
    const now = new Date("2026-11-20T10:00:00.000Z").toISOString();
    const users = [randomUUID(), randomUUID()];
    for (const [i, u] of users.entries()) {
      await pg.query(`insert into "user"(id, name, email, created_at, updated_at) values ($1, $2, $3, $4, $4)`, [u, `QA ${i}`, `qa-mig-${i}@example.com`, now]);
    }
    const places = [
      { id: randomUUID(), user: users[0], name: "บ้าน", last: now, archived: null, deleted: null },
      { id: randomUUID(), user: users[0], name: "ยิมในกรุ", last: null, archived: now, deleted: null },
      { id: randomUUID(), user: users[0], name: "ยิมที่ลบ", last: null, archived: null, deleted: now },
      { id: randomUUID(), user: users[1], name: "Office gym", last: now, archived: null, deleted: null },
    ];
    for (const p of places) {
      await pg.query(
        `insert into place(id, user_id, name, last_used_at, archived_at, created_at, updated_at, client_updated_at, deleted_at) values ($1,$2,$3,$4,$5,$6,$6,$6,$7)`,
        [p.id, p.user, p.name, p.last, p.archived, now, p.deleted],
      );
    }
    const mine = randomUUID();
    await pg.query(
      `insert into exercise(id, owner_user_id, name, track_type, load_mode, is_unilateral, category, created_at, updated_at, client_updated_at) values ($1,$2,'QA ท่า','weight_reps','external',false,'chest',$3,$3,$3)`,
      [mine, users[0], now],
    );
    const snapPlaces = (await pg.query(`select * from place order by id`)).rows;
    const snapExercises = (await pg.query(`select count(*)::int as n, max(updated_at)::text as m from exercise`)).rows;

    // อัปเกรด: migration ทั้งหมดของ repo (0004 ต่อจากที่มี)
    await migrate(db, { migrationsFolder: SRC });
    const after = (await pg.query<Record<string, unknown>>(`select * from place order by id`)).rows;
    expect(
      after.map((r) => {
        const rest = { ...r };
        delete rest.map_url;
        return rest;
      }),
    ).toEqual(snapPlaces);
    expect(after.map((r) => r.map_url)).toEqual(after.map(() => null));
    expect((await pg.query(`select count(*)::int as n, max(updated_at)::text as m from exercise`)).rows).toEqual(snapExercises);

    // CHECK ใหม่: ว่าง/ยาวเกิน 500 = ผิด · 500 ตัวพอดี = ได้
    const set = (v: string) => pg.query(`update place set map_url = $1 where id = $2`, [v, places[0].id]);
    await expect(set("")).rejects.toThrow(/place_map_url_check/);
    await expect(set("x".repeat(501))).rejects.toThrow(/place_map_url_check/);
    await set("x".repeat(500));
    // migrate ซ้ำ = ไม่ทำอะไร
    await migrate(db, { migrationsFolder: SRC });
    expect((await pg.query(`select count(*)::int as n from place`)).rows).toEqual([{ n: 4 }]);
  } finally {
    await pg.close();
    rmSync(before, { recursive: true, force: true });
  }
});
