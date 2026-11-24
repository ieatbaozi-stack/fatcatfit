import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { CATEGORIES, EQUIPMENT, LOAD_MODES, TRACK_TYPES, sqlList } from "../../lib/data/shared/exercise-meta";
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
    // CR3: ลิงก์ Google Maps (ตรวจ host ที่แอป/เซิร์ฟเวอร์) · null = ไม่ได้ใส่
    mapUrl: text("map_url"),
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
    check("place_map_url_check", sql`${t.mapUrl} IS NULL OR char_length(${t.mapUrl}) BETWEEN 1 AND 500`),
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


// ท่าออกกำลังกาย (R2 · ADR 0003 ข้อ 2–3 · contract R2) — owner_user_id null = คลังกลาง (อ่านได้ทุกคน เขียนผ่านสคริปต์ seed เท่านั้น)
// ท่าของฉัน = owner_user_id ของผู้ใช้ · ลบบัญชีแล้วหายด้วย cascade · คลังกลางไม่เคยลบ (เลิกใช้ = archived_at)
export const exercise = pgTable(
  "exercise",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameTh: text("name_th"),
    // คำค้นสะกดอื่น คั่นด้วย | (ไม่ใช้ JSON)
    searchTerms: text("search_terms"),
    trackType: text("track_type").notNull(),
    loadMode: text("load_mode").notNull(),
    isUnilateral: boolean("is_unilateral").notNull(),
    category: text("category").notNull(),
    equipment: text("equipment"),
    sourceDataset: text("source_dataset"),
    sourceRef: text("source_ref"),
    license: text("license"),
    attribution: text("attribution"),
    met: doublePrecision("met"),
    archivedAt: instant("archived_at"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    clientUpdatedAt: instant("client_updated_at").notNull(),
    deletedAt: instant("deleted_at"),
  },
  (t) => [
    index("exercise_owner_user_id_updated_at_idx").on(t.ownerUserId, t.updatedAt),
    check("exercise_name_check", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
    check("exercise_name_th_check", sql`${t.nameTh} IS NULL OR char_length(${t.nameTh}) BETWEEN 1 AND 60`),
    check("exercise_track_type_check", sql`${t.trackType} IN (${sql.raw(sqlList(TRACK_TYPES))})`),
    check("exercise_load_mode_check", sql`${t.loadMode} IN (${sql.raw(sqlList(LOAD_MODES))})`),
    check("exercise_load_mode_track_check", sql`${t.loadMode} = 'external' OR ${t.trackType} = 'weight_reps'`),
    check("exercise_category_check", sql`${t.category} IN (${sql.raw(sqlList(CATEGORIES))})`),
    check("exercise_equipment_check", sql`${t.equipment} IS NULL OR ${t.equipment} IN (${sql.raw(sqlList(EQUIPMENT))})`),
    // คลังกลางต้องมีชื่อไทยและเครดิตครบทุกแถว · ท่าของฉันห้ามมีช่องที่มา/MET (เซิร์ฟเวอร์ตั้งเอง = null) · คลังกลางไม่มี tombstone
    check(
      "exercise_catalog_fields_check",
      sql`${t.ownerUserId} IS NOT NULL OR (${t.nameTh} IS NOT NULL AND ${t.sourceDataset} IS NOT NULL AND ${t.sourceRef} IS NOT NULL AND ${t.license} IS NOT NULL AND ${t.attribution} IS NOT NULL AND ${t.deletedAt} IS NULL)`,
    ),
    check(
      "exercise_own_fields_check",
      sql`${t.ownerUserId} IS NULL OR (${t.sourceDataset} IS NULL AND ${t.sourceRef} IS NULL AND ${t.license} IS NULL AND ${t.attribution} IS NULL AND ${t.met} IS NULL)`,
    ),
  ],
);

// ---------------- R3a: เซสชันออกกำลังกาย (ADR 0003 ข้อ 3 · contract R3 "API & ชนิดข้อมูล") ----------------
// ช่วงค่าตรงกับ SET_RANGES (contract D4) · ช่องที่ต้องมี/ห้ามมีตาม track_type ตรวจที่เซิร์ฟเวอร์กับสำเนาใน session_exercise
// (CHECK ข้ามตารางไม่ได้) · แถวทั้งสามตารางมี user_id + composite FK → ฐานข้อมูลกันผูกลูกเข้ากับข้อมูลของคนอื่น

export const workoutSession = pgTable(
  "workout_session",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    placeId: uuid("place_id").notNull(),
    startedAt: instant("started_at").notNull(),
    // null = ยังเล่นอยู่
    endedAt: instant("ended_at"),
    // วันที่ท้องถิ่นตอนเริ่ม (ADR 0003 ข้อ 1) + time zone IANA
    localDate: date("local_date", { mode: "string" }).notNull(),
    timeZone: text("time_zone").notNull(),
    // มีคอลัมน์ไว้สำหรับ R4 (เทมเพลต) · R3 ไม่รับจากไคลเอนต์ · ไม่มี FK
    templateId: uuid("template_id"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    clientUpdatedAt: instant("client_updated_at").notNull(),
    deletedAt: instant("deleted_at"),
  },
  (t) => [
    unique("workout_session_id_user_id_unique").on(t.id, t.userId),
    foreignKey({ columns: [t.placeId, t.userId], foreignColumns: [place.id, place.userId], name: "workout_session_place_user_fk" }),
    index("workout_session_user_id_updated_at_idx").on(t.userId, t.updatedAt),
    index("workout_session_user_id_local_date_idx").on(t.userId, t.localDate),
    index("workout_session_place_id_idx").on(t.placeId),
    // เซสชันที่เล่นอยู่ (bootstrap active_sessions)
    index("workout_session_user_id_active_idx").on(t.userId).where(sql`${t.endedAt} IS NULL AND ${t.deletedAt} IS NULL`),
    check("workout_session_time_zone_check", sql`char_length(${t.timeZone}) BETWEEN 1 AND 64`),
    check(
      "workout_session_span_check",
      sql`${t.endedAt} IS NULL OR (${t.endedAt} >= ${t.startedAt} AND ${t.endedAt} <= ${t.startedAt} + interval '24 hours')`,
    ),
  ],
);

export const sessionExercise = pgTable(
  "session_exercise",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    // เปลี่ยนไม่ได้ · อ้างท่าคลังหรือท่าของ user (NO ACTION — ท่าไม่ถูกลบจริงเมื่อมีประวัติ)
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id),
    position: integer("position").notNull(),
    // สำเนา ณ ตอนบันทึก (เซิร์ฟเวอร์คัดลอกจากแถว exercise)
    exerciseName: text("exercise_name").notNull(),
    exerciseNameTh: text("exercise_name_th"),
    trackType: text("track_type").notNull(),
    loadMode: text("load_mode").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    clientUpdatedAt: instant("client_updated_at").notNull(),
    deletedAt: instant("deleted_at"),
  },
  (t) => [
    unique("session_exercise_id_user_id_unique").on(t.id, t.userId),
    foreignKey({
      columns: [t.sessionId, t.userId],
      foreignColumns: [workoutSession.id, workoutSession.userId],
      name: "session_exercise_session_user_fk",
    }).onDelete("cascade"),
    index("session_exercise_user_id_updated_at_idx").on(t.userId, t.updatedAt),
    index("session_exercise_user_id_exercise_id_idx").on(t.userId, t.exerciseId),
    index("session_exercise_session_id_idx").on(t.sessionId),
    check("session_exercise_position_check", sql`${t.position} BETWEEN 0 AND 1000`),
    check("session_exercise_name_check", sql`char_length(${t.exerciseName}) BETWEEN 1 AND 60`),
    check("session_exercise_track_type_check", sql`${t.trackType} IN (${sql.raw(sqlList(TRACK_TYPES))})`),
    check("session_exercise_load_mode_check", sql`${t.loadMode} IN (${sql.raw(sqlList(LOAD_MODES))})`),
    check("session_exercise_load_mode_track_check", sql`${t.loadMode} = 'external' OR ${t.trackType} = 'weight_reps'`),
  ],
);

export const setRecord = pgTable(
  "set_record",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionExerciseId: uuid("session_exercise_id").notNull(),
    position: integer("position").notNull(),
    setKind: text("set_kind").notNull(),
    // ส่งเฉพาะเซ็ตที่ติ๊กแล้ว
    completedAt: instant("completed_at").notNull(),
    weightKg: doublePrecision("weight_kg"),
    weightInput: doublePrecision("weight_input"),
    weightUnit: text("weight_unit"),
    reps: integer("reps"),
    durationS: integer("duration_s"),
    distanceM: doublePrecision("distance_m"),
    distanceInput: doublePrecision("distance_input"),
    distanceUnit: text("distance_unit"),
    speedMps: doublePrecision("speed_mps"),
    speedInput: doublePrecision("speed_input"),
    speedUnit: text("speed_unit"),
    inclinePct: doublePrecision("incline_pct"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    clientUpdatedAt: instant("client_updated_at").notNull(),
    deletedAt: instant("deleted_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionExerciseId, t.userId],
      foreignColumns: [sessionExercise.id, sessionExercise.userId],
      name: "set_record_session_exercise_user_fk",
    }).onDelete("cascade"),
    index("set_record_user_id_updated_at_idx").on(t.userId, t.updatedAt),
    index("set_record_session_exercise_id_position_idx").on(t.sessionExerciseId, t.position),
    // ค่าครั้งก่อน/สถิติ
    index("set_record_user_id_completed_at_idx").on(t.userId, t.completedAt),
    check("set_record_position_check", sql`${t.position} BETWEEN 0 AND 1000`),
    check("set_record_set_kind_check", sql`${t.setKind} IN ('normal', 'warmup')`),
    // ค่า / หน่วย / ค่ามาตรฐาน ต้องมาครบชุดหรือว่างทั้งชุด
    check(
      "set_record_weight_set_check",
      sql`(${t.weightKg} IS NULL AND ${t.weightInput} IS NULL AND ${t.weightUnit} IS NULL) OR (${t.weightKg} IS NOT NULL AND ${t.weightInput} IS NOT NULL AND ${t.weightUnit} IS NOT NULL)`,
    ),
    check(
      "set_record_distance_set_check",
      sql`(${t.distanceM} IS NULL AND ${t.distanceInput} IS NULL AND ${t.distanceUnit} IS NULL) OR (${t.distanceM} IS NOT NULL AND ${t.distanceInput} IS NOT NULL AND ${t.distanceUnit} IS NOT NULL)`,
    ),
    check(
      "set_record_speed_set_check",
      sql`(${t.speedMps} IS NULL AND ${t.speedInput} IS NULL AND ${t.speedUnit} IS NULL) OR (${t.speedMps} IS NOT NULL AND ${t.speedInput} IS NOT NULL AND ${t.speedUnit} IS NOT NULL)`,
    ),
    // ช่วงค่า D4
    check(
      "set_record_weight_range_check",
      sql`${t.weightUnit} IS NULL OR (${t.weightUnit} = 'kg' AND ${t.weightInput} BETWEEN 0 AND 1000) OR (${t.weightUnit} = 'lb' AND ${t.weightInput} BETWEEN 0 AND 2200)`,
    ),
    check("set_record_reps_check", sql`${t.reps} IS NULL OR ${t.reps} BETWEEN 1 AND 1000`),
    check("set_record_duration_check", sql`${t.durationS} IS NULL OR ${t.durationS} BETWEEN 1 AND 86400`),
    check(
      "set_record_distance_range_check",
      sql`${t.distanceUnit} IS NULL OR (${t.distanceUnit} = 'km' AND ${t.distanceInput} BETWEEN 0.01 AND 1000) OR (${t.distanceUnit} = 'mi' AND ${t.distanceInput} BETWEEN 0.01 AND 620)`,
    ),
    check(
      "set_record_speed_range_check",
      sql`${t.speedUnit} IS NULL OR (${t.speedUnit} = 'kmh' AND ${t.speedInput} BETWEEN 0.1 AND 40) OR (${t.speedUnit} = 'mph' AND ${t.speedInput} BETWEEN 0.1 AND 25)`,
    ),
    check("set_record_incline_check", sql`${t.inclinePct} IS NULL OR ${t.inclinePct} BETWEEN 0 AND 40`),
  ],
);
