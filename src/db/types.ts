import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** ชนิดกลางของ db ที่ใช้ได้ทั้ง node-postgres (แอป) และ PGlite (เทสต์) — โค้ดใน lib รับชนิดนี้ ไม่ผูก driver */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;
