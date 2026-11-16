// รัน migration ของ drizzle/ ตอน build บน Vercel Production (ก่อน next build) — ดู docs/OPERATIONS.md หัวข้อ "migration ตอน deploy"
//
// ไม่ทำอะไรเลยจนกว่าจะตั้งครบทั้งสองข้อ:
//   1. MIGRATE_ON_DEPLOY=1                (boss ตั้งเองใน Vercel เฉพาะสภาพแวดล้อม Production)
//   2. VERCEL_ENV=production              (Vercel ตั้งให้เอง · preview/development ไม่มีทางรัน)
// ใช้ DATABASE_URL_UNPOOLED เท่านั้น (ไม่ถอยไปใช้ pooled เพราะ advisory lock และ migration ต้องการ session จริง)
// migration ล้ม = exit 1 = build ล้ม = Vercel ไม่สลับไปรุ่นใหม่ (รุ่นเดิมยังให้บริการอยู่)
// ไม่พิมพ์ connection string หรือ error object (log ของ Vercel ของ repo สาธารณะอาจถูกแชร์ได้)
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

export type Decision = { run: false; reason: string } | { run: true; url: string } | { run: false; error: string };

export function decide(env: Record<string, string | undefined>): Decision {
  if (env.MIGRATE_ON_DEPLOY !== "1") return { run: false, reason: "MIGRATE_ON_DEPLOY ไม่ได้ตั้งเป็น 1" };
  if (env.VERCEL_ENV !== "production") return { run: false, reason: `VERCEL_ENV=${env.VERCEL_ENV ?? "(ไม่มี)"} ไม่ใช่ production` };
  if (!env.DATABASE_URL_UNPOOLED) return { run: false, error: "ตั้ง MIGRATE_ON_DEPLOY=1 แล้วแต่ไม่มี DATABASE_URL_UNPOOLED" };
  return { run: true, url: env.DATABASE_URL_UNPOOLED };
}

// เลขคงที่ของ advisory lock กัน build สองตัวรัน migration พร้อมกัน
const LOCK_KEY = 482_031_17;

async function main(): Promise<void> {
  const decision = decide(process.env);
  if (!decision.run) {
    if ("error" in decision) {
      console.error(`release-migrate: ${decision.error}`);
      process.exit(1);
    }
    console.log(`release-migrate: ข้าม (${decision.reason})`);
    return;
  }
  const pool = new Pool({ connectionString: decision.url, max: 1 });
  try {
    await pool.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
      console.log("release-migrate: migration เสร็จ");
    } finally {
      await pool.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    const code = (err as { code?: string }).code;
    console.error(`release-migrate: migration ล้ม${code ? ` (${code})` : ""}: ${(err as Error).name}`);
    process.exit(1);
  });
}
