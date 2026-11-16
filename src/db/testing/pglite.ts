import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "../schema";

// ฐานข้อมูลชั่วคราวสำหรับเทสต์ (S1): PGlite ในโปรเซส + รัน migration จริงจาก drizzle/ ทุกครั้ง
// ใช้ใน *.test.ts เท่านั้น — ห้าม import จากโค้ดของแอป

export type TestDb = {
  db: PgliteDatabase<typeof schema>;
  client: PGlite;
  close: () => Promise<void>;
};

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return { db, client, close: () => client.close() };
}
