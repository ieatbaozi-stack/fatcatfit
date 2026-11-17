import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ตารางของ Better Auth (ADR 0002) — ชื่อ property ตรงกับ model/field ที่ Better Auth ใช้
// ตามกติกา ADR 0001: id เป็น uuid · เวลาเป็น timestamptz(3) · ไม่มี default ที่เป็นฟังก์ชันฝั่ง DB
// Better Auth สร้าง id และ createdAt/updatedAt ในโค้ดเอง (advanced.database.generateId = () => crypto.randomUUID() ใน src/lib/auth/server.ts
// ไม่ใช้ค่า "uuid" เพราะโหมดนั้นให้ DB สร้างผ่าน gen_random_uuid())

const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

export const user = pgTable("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey(),
    expiresAt: instant("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: instant("access_token_expires_at"),
    refreshTokenExpiresAt: instant("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// rate limit เก็บในฐานข้อมูล (ADR 0002 ข้อ 3)
// lastRequest เป็น epoch ms (เกิน int32) — Better Auth CLI ปกติสร้างเป็น bigint
// ที่นี่ใช้ double precision (ชนิดตัวเลขใน ADR 0001) เก็บจำนวนเต็มถึง 2^53 ได้แม่นยำ
export const rateLimit = pgTable("rate_limit", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: doublePrecision("last_request").notNull(),
});
