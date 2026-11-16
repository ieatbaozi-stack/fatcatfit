import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// รัน migration ใน drizzle/ — ใช้ DATABASE_URL_UNPOOLED ถ้ามี ไม่พิมพ์ connection string
config({ path: ".env.local", quiet: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("db:migrate: DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log("db:migrate: done");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // ไม่ log ทั้ง error object เพราะอาจมี connection string
  const code = (err as { code?: string }).code;
  console.error(`db:migrate failed${code ? ` (${code})` : ""}: ${(err as Error).name}`);
  process.exit(1);
});
