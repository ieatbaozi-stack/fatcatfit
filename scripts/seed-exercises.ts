// seed คลังท่ากลางลงฐานข้อมูล (R2 · contract หัวข้อ seed) — รันซ้ำได้ ผลเท่าเดิม
//   npx tsx scripts/seed-exercises.ts          (ใช้ DATABASE_URL_UNPOOLED ถ้ามี ไม่งั้น DATABASE_URL · อ่าน .env.local)
// release-migrate.ts เรียก seedExercises(db) ต่อจาก migration · ล้มเมื่อไฟล์คลังไม่ผ่านการตรวจ (ไม่เขียนอะไรลงฐาน)
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { checkCatalog, DEFAULT_CONTENT_DIR, formatSeedResult, loadCatalog, syncCatalog, type SeedResult } from "./seed-lib";

type Db = Parameters<typeof syncCatalog>[0];

/** ตรวจไฟล์คลังก่อนเสมอ แล้ว upsert — คืนผลสรุป */
export async function seedExercises(db: Db, dir: string = DEFAULT_CONTENT_DIR, now: Date = new Date()): Promise<SeedResult> {
  const { rows, errors } = loadCatalog(dir);
  const check = checkCatalog(rows, errors);
  if (check.errors.length) {
    throw new Error(`ไฟล์คลังไม่ผ่านการตรวจ ${check.errors.length} ข้อ (รัน tsx scripts/seed-check.ts ดูรายละเอียด) · ตัวอย่าง: ${check.errors[0]}`);
  }
  return syncCatalog(db, rows, now);
}

async function main(): Promise<void> {
  config({ path: ".env.local", quiet: true });
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("seed-exercises: ไม่ได้ตั้ง DATABASE_URL (หรือ DATABASE_URL_UNPOOLED)");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    console.log(formatSeedResult(await seedExercises(drizzle(pool))));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    // ไม่ log error object ทั้งก้อน (อาจมี connection string)
    const code = (err as { code?: string }).code;
    console.error(`seed-exercises ล้ม${code ? ` (${code})` : ""}: ${(err as Error).message.slice(0, 300)}`);
    process.exit(1);
  });
}
