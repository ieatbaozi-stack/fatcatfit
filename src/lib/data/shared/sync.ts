import { z } from "zod";
import { normalizeMapUrl } from "./map-link";
import { CATEGORIES, EQUIPMENT, EXERCISE_LIMITS, LOAD_MODES, TRACK_TYPES, loadModeAllowed, stripControlChars } from "./exercise-meta";

// รูปแบบบนสายของ POST /api/sync/push (ADR 0004 ข้อ 3–4) — ใช้ร่วมไคลเอนต์ (คิว/ฟอร์ม) กับเซิร์ฟเวอร์ (ตัดสินจริง)
// R2 รับ entity `place` และ `exercise` เท่านั้น (R3 เพิ่ม) · ชื่อช่องบนสายเป็น snake_case · data = ทั้งแถว (ที่ไคลเอนต์ตั้งได้)

export const PUSH_VERSION = 1;
export const PUSH_LIMITS = {
  /** รายการต่อคำขอ (ADR 0004 ข้อ 3: ไคลเอนต์ส่งครั้งละไม่เกิน 50) */
  maxOps: 100,
  /** ขนาด body สูงสุด (ไบต์) */
  maxBodyBytes: 262_144,
  /** client_updated_at ล้ำอนาคตเกินนี้ = bad_clock (ADR 0004 ข้อ 4) */
  maxFutureMs: 24 * 60 * 60 * 1000,
} as const;

export const PUSH_ENTITIES = ["place", "exercise"] as const;
export type PushEntity = (typeof PUSH_ENTITIES)[number];
export const PUSH_ACTIONS = ["upsert", "delete"] as const;

/** code ปฏิเสธถาวรของ R2 (ADR 0004 ข้อ 4 + `limit_reached`) */
export type PushRejectCode = "invalid" | "id_conflict" | "bad_clock" | "limit_reached";
export type PushStatus = "applied" | "stale" | "rejected";
export type PushResult = { op_id: string | null; status: PushStatus; code?: PushRejectCode };
export type PushResponse = { results: PushResult[]; server_time: string };

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid = z.string().regex(UUID_V4);
const iso = z.iso.datetime();
// ตัดอักขระควบคุม/bidi ก่อนตรวจความยาว
const name = z
  .string()
  .transform(stripControlChars)
  .pipe(z.string().trim().min(1).max(EXERCISE_LIMITS.nameMax));

export const pushBodySchema = z.object({
  v: z.number().int().min(1),
  ops: z.array(z.unknown()).max(PUSH_LIMITS.maxOps),
});

export const pushOpSchema = z.object({
  op_id: z.string().min(1).max(64),
  entity: z.string(),
  id: uuid,
  action: z.enum(PUSH_ACTIONS),
  data: z.unknown().optional(),
  client_updated_at: iso,
});
export type PushOp = z.infer<typeof pushOpSchema>;

// ช่องที่เซิร์ฟเวอร์ตั้งเอง — ไคลเอนต์ส่งกลับมา (เช่นสะท้อนแถวจาก bootstrap) ได้ แต่ถูกเพิกเฉย
const serverManaged = {
  id: z.unknown().optional(),
  created_at: z.unknown().optional(),
  updated_at: z.unknown().optional(),
  client_updated_at: z.unknown().optional(),
  deleted_at: z.unknown().optional(),
};

// strictObject: ช่องอื่นที่ไม่รู้จัก (owner_user_id, user_id, source_*, license, attribution, met ฯลฯ) = invalid ทั้งรายการ
export const placeDataSchema = z.strictObject({
  ...serverManaged,
  name,
  // CR3: ไม่ส่ง = คงเดิม · null = ล้าง · ไม่ผ่านตัวตรวจลิงก์ Google Maps = invalid
  map_url: z
    .string()
    .transform((v, ctx) => {
      const n = normalizeMapUrl(v);
      if (n === null) ctx.addIssue({ code: "custom", message: "invalid_map_url" });
      return n ?? "";
    })
    .nullable()
    .optional(),
  last_used_at: iso.nullable().optional(),
  archived_at: iso.nullable().optional(),
});
export type PlaceData = z.infer<typeof placeDataSchema>;

export const exerciseDataSchema = z
  .strictObject({
    ...serverManaged,
    name,
    track_type: z.enum(TRACK_TYPES),
    load_mode: z.enum(LOAD_MODES).default("external"),
    is_unilateral: z.boolean().default(false),
    category: z.enum(CATEGORIES),
    equipment: z.enum(EQUIPMENT).nullable().optional(),
    archived_at: iso.nullable().optional(),
  })
  .refine((d) => loadModeAllowed(d.track_type, d.load_mode), { path: ["load_mode"] })
  // ฟอร์มแสดงสวิตช์ "ข้างละ" เฉพาะ 4 ชนิดที่เหลือ — วิ่ง/ปั่น (distance_duration) และลู่วิ่ง (incline_speed_duration) ตั้งไม่ได้
  .refine((d) => !d.is_unilateral || (d.track_type !== "distance_duration" && d.track_type !== "incline_speed_duration"), {
    path: ["is_unilateral"],
  });
export type ExerciseData = z.infer<typeof exerciseDataSchema>;

// ---- รูปแถวบนสายของ GET /api/bootstrap และ GET /api/catalog ----

export type WirePlace = {
  id: string;
  name: string;
  map_url: string | null;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
};

export type WireExercise = {
  id: string;
  owner_user_id: string | null;
  name: string;
  name_th: string | null;
  search_terms: string | null;
  track_type: string;
  load_mode: string;
  is_unilateral: boolean;
  category: string;
  equipment: string | null;
  source_dataset: string | null;
  source_ref: string | null;
  license: string | null;
  attribution: string | null;
  met: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
};

/** แถวคลังกลางบนสายของ /api/catalog — ไม่มีช่อง sync/เจ้าของ (ลดขนาด) */
export type CatalogExercise = Omit<WireExercise, "owner_user_id" | "created_at" | "updated_at" | "client_updated_at">;

export type CatalogResponse = { catalog_version: string; exercises: CatalogExercise[] };

export type WireProfile = {
  locale: "th" | "en";
  weight_unit: string;
  length_unit: string;
  distance_unit: string;
  theme: string;
  rest_seconds: number;
  birth_year: number;
  height_m: number;
  height_input: number;
  height_unit: string;
  goals: string[];
  experience: string | null;
  updated_at: string;
  client_updated_at: string;
};

export type BootstrapResponse = {
  profile: WireProfile | null;
  places: WirePlace[];
  my_exercises: WireExercise[];
  catalog_version: string;
  server_time: string;
};
