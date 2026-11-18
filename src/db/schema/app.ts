import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// ตารางของแอปใน R1 (ADR 0003 ข้อ 3) — กติกา ADR 0001: id เป็น uuid สร้างในโค้ด · เวลาเป็น timestamptz(3) ·
// enum เป็น text + CHECK · ไม่มี default ที่เป็นฟังก์ชันฝั่ง DB
// ทุกตารางที่มี user_id ถูกลบเมื่อลบ user (ON DELETE CASCADE) — เกตเทสต์ลบบัญชีวนตารางเหล่านี้อัตโนมัติ

const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

/** ตัวนับของ rate limit ที่ Better Auth ทำให้ไม่ได้ (ADR 0002 ข้อ 3) — key เป็น hash ไม่เก็บอีเมล/IP ดิบ */
export const authThrottle = pgTable(
  "auth_throttle",
  {
    key: text("key").primaryKey(),
    windowStartedAt: instant("window_started_at").notNull(),
    count: integer("count").notNull(),
    expiresAt: instant("expires_at").notNull(),
  },
  (t) => [index("auth_throttle_expires_at_idx").on(t.expiresAt), check("auth_throttle_count_check", sql`${t.count} >= 0`)],
);

export const consentRecord = pgTable(
  "consent_record",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    noticeVersion: text("notice_version").notNull(),
    acceptedAt: instant("accepted_at").notNull(),
    locale: text("locale").notNull(),
  },
  (t) => [
    // บันทึกซ้ำเวอร์ชันเดิมไม่เกิดแถวใหม่ (upsert)
    unique("consent_record_user_version_unique").on(t.userId, t.noticeVersion),
    check("consent_record_locale_check", sql`${t.locale} IN ('th', 'en')`),
  ],
);

export const profile = pgTable(
  "profile",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // ภาษาของอีเมล OTP ครั้งถัดไป (boss D2) — ภาษาของแอปยังผูกกับเบราว์เซอร์
    locale: text("locale").notNull(),
    weightUnit: text("weight_unit").notNull(),
    lengthUnit: text("length_unit").notNull(),
    distanceUnit: text("distance_unit").notNull(),
    theme: text("theme").notNull().default("system"),
    restSeconds: integer("rest_seconds").notNull().default(90),
    birthYear: integer("birth_year").notNull(),
    heightM: doublePrecision("height_m").notNull(),
    heightInput: doublePrecision("height_input").notNull(),
    heightUnit: text("height_unit").notNull(),
    // JSON array ของคีย์เป้าหมาย เก็บเป็น text (ADR 0003: ข้อยกเว้นเดียวของ JSON) · parse ด้วย zod
    goals: text("goals").notNull(),
    experience: text("experience"),
    onboardedAt: instant("onboarded_at").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    clientUpdatedAt: instant("client_updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId], name: "profile_pkey" }),
    check("profile_locale_check", sql`${t.locale} IN ('th', 'en')`),
    check("profile_weight_unit_check", sql`${t.weightUnit} IN ('kg', 'lb')`),
    check("profile_length_unit_check", sql`${t.lengthUnit} IN ('cm', 'in')`),
    check("profile_distance_unit_check", sql`${t.distanceUnit} IN ('km', 'mi')`),
    check("profile_height_unit_check", sql`${t.heightUnit} IN ('cm', 'in')`),
    check("profile_theme_check", sql`${t.theme} IN ('system', 'light', 'dark')`),
    check("profile_experience_check", sql`${t.experience} IS NULL OR ${t.experience} IN ('new', 'some', 'regular')`),
    check("profile_rest_seconds_check", sql`${t.restSeconds} >= 0`),
  ],
);

export const place = pgTable(
  "place",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastUsedAt: instant("last_used_at"),
    archivedAt: instant("archived_at"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    clientUpdatedAt: instant("client_updated_at").notNull(),
    deletedAt: instant("deleted_at"),
  },
  (t) => [
    // ให้ลูก (workout_session ใน R3) ผูก composite FK (place_id, user_id) ได้
    unique("place_id_user_id_unique").on(t.id, t.userId),
    index("place_user_id_updated_at_idx").on(t.userId, t.updatedAt),
  ],
);

export const bodyEntry = pgTable(
  "body_entry",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    measuredAt: instant("measured_at").notNull(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    weightInput: doublePrecision("weight_input").notNull(),
    weightUnit: text("weight_unit").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    clientUpdatedAt: instant("client_updated_at").notNull(),
    deletedAt: instant("deleted_at"),
  },
  (t) => [
    unique("body_entry_id_user_id_unique").on(t.id, t.userId),
    index("body_entry_user_id_updated_at_idx").on(t.userId, t.updatedAt),
    index("body_entry_user_id_local_date_idx").on(t.userId, t.localDate),
    check("body_entry_weight_unit_check", sql`${t.weightUnit} IN ('kg', 'lb')`),
  ],
);

