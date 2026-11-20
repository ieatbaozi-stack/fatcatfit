import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// สิทธิ์แอดมิน (ADR 0007 ข้อ 1) — ตารางแยกที่ Better Auth ไม่รู้จัก · ในแอปมีแต่ SELECT (ห้าม INSERT/UPDATE/DELETE ใน src/)
// เพิ่ม/ถอนสิทธิ์ด้วย SQL ใน Neon (docs/OPERATIONS.md) · ไม่มี DEFAULT ของ created_at (ADR 0001) · ลบบัญชี = สิทธิ์หายด้วย cascade

export const appAdmin = pgTable(
  "app_admin",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId], name: "app_admin_pkey" })],
);
