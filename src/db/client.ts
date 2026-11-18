import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// ไฟล์เดียวที่ต้องแก้ถ้าเปลี่ยน driver (ADR 0001 ข้อ 5)
// สร้างแบบ lazy เพื่อให้ import ได้โดยไม่ต้องมี DATABASE_URL (เช่นตอน build)

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let instance: Database | undefined;

export function getDb(): Database {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // timeout สั้นกว่า 5 วิ: /api/health ต้องตอบ 503 ภายใน 5 วิเมื่อฐานข้อมูลไม่ตอบ (R0 งานค้าง) · ต่อไม่ได้/query ค้างแล้วล้มเร็ว
    pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 4000, query_timeout: 4000 });
    // กัน error ของ client ที่ว่างอยู่ทำให้โปรเซสล้ม (ไม่ log ข้อความที่อาจมี connection string)
    pool.on("error", () => {
      console.error("database pool error");
    });
    instance = drizzle(pool, { schema });
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  const p = pool;
  pool = undefined;
  instance = undefined;
  if (p) await p.end();
}
