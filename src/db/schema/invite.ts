import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// โค้ดเชิญ (ADR 0002 ข้อ 2 · ADR 0003 ข้อ 3) — เก็บเฉพาะ hash ของโค้ด ไม่มี user_id
// สถานะ (active/exhausted/expired/revoked) คำนวณจากคอลัมน์ ไม่เก็บซ้ำ

const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

export const inviteCode = pgTable(
  "invite_code",
  {
    id: uuid("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    label: text("label").notNull(),
    maxUses: integer("max_uses").notNull(),
    usesCount: integer("uses_count").notNull().default(0),
    expiresAt: instant("expires_at").notNull(),
    revokedAt: instant("revoked_at"),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("invite_code_code_hash_unique").on(t.codeHash),
    index("invite_code_expires_at_idx").on(t.expiresAt),
    check("invite_code_max_uses_check", sql`${t.maxUses} >= 1`),
    check("invite_code_uses_count_check", sql`${t.usesCount} >= 0 AND ${t.usesCount} <= ${t.maxUses}`),
  ],
);
