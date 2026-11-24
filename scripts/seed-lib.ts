// ตรรกะร่วมของคลังท่า (R2 · contract D0–D3, D9 · ADR 0008) — แปลงชุดข้อมูลต้นทาง · ตรวจคลัง · seed ลงฐานข้อมูล
// ไม่มี I/O ของเครือข่าย · อ่านไฟล์เฉพาะใน loadCatalogFiles · seed ทำผ่าน drizzle ที่ส่งเข้ามา (pg จริงหรือ PGlite ในเทสต์)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { exercise } from "../src/db/schema/app";
import {
  CATEGORIES,
  EQUIPMENT,
  EXERCISE_LIMITS,
  LOAD_MODES,
  SEARCH_TERMS_SEPARATOR,
  TRACK_TYPES,
  isCategory,
  isEquipment,
  isLoadMode,
  isTrackType,
  loadModeAllowed,
  type Category,
  type Equipment,
  type LoadMode,
  type TrackType,
} from "../src/lib/data/shared/exercise-meta";

// ---------------------------------------------------------------- id ของคลัง (UUID v5)

/** namespace คงที่ของ id คลังกลาง (UUID v4 ที่สุ่มครั้งเดียว) — ห้ามเปลี่ยนตลอดไป */
export const CATALOG_NAMESPACE = "5d0f6c1e-8a3b-4e72-9c41-b7a2f6d3e815";

/** UUID v5 (RFC 4122) ของ name ใน namespace */
export function uuidV5(name: string, namespace: string = CATALOG_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** id ของแถวคลัง = v5("<source_dataset>:<source_ref>") — ไม่ชนกับ UUID v4 ที่ไคลเอนต์ส่งมา */
export const catalogId = (sourceDataset: string, sourceRef: string): string => uuidV5(`${sourceDataset}:${sourceRef}`);

// ---------------------------------------------------------------- ชนิด

/** แถวคลังหนึ่งท่า (หลังรวม meta ของไฟล์แล้ว) */
export type CatalogRow = {
  id: string;
  source_dataset: string;
  source_ref: string;
  license: string;
  attribution: string;
  name: string;
  name_th: string;
  search_terms: string[];
  track_type: TrackType;
  load_mode: LoadMode;
  is_unilateral: boolean;
  category: Category;
  equipment: Equipment | null;
};

/** รูปไฟล์ใน content/exercises/*.json */
export type CatalogFile = {
  source_dataset: string;
  license: string;
  attribution: string;
  /** commit ของต้นทางที่ล็อก (ชุดข้อมูลของทีมเอง = null) */
  upstream_commit: string | null;
  upstream_url: string | null;
  exercises: FileRow[];
};

export type FileRow = Omit<CatalogRow, "source_dataset" | "license" | "attribution">;

/** ชุดข้อมูลที่อนุญาต (ADR 0008 ข้อ 2) — เพิ่มชุดใหม่ต้องมีบรรทัดใน LICENSES.md และ SOURCES.md ก่อน */
export const ALLOWED_SOURCES: Record<string, { license: string; attribution: string }> = {
  "free-exercise-db": { license: "Unlicense", attribution: "free-exercise-db (github.com/yuhonas/free-exercise-db)" },
  fatcatfit: { license: "original", attribution: "Fat Cat Fit" },
};

/** ชื่อช่องที่ห้ามอยู่ในไฟล์คลัง (D1: ไม่เอาวิธีทำท่า/รูป) */
export const FORBIDDEN_KEYS = ["instructions", "images", "image", "video", "videos", "gif", "description"] as const;

// ---------------------------------------------------------------- แมปจาก free-exercise-db (ADR 0008 ข้อ 4)

export type RawExercise = {
  id: string;
  name: string;
  force?: string | null;
  equipment?: string | null;
  category: string;
  primaryMuscles?: string[];
};

const MUSCLE_CATEGORY: Record<string, Category> = {
  chest: "chest",
  lats: "back",
  "middle back": "back",
  "lower back": "back",
  traps: "back",
  shoulders: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
  quadriceps: "legs",
  hamstrings: "legs",
  glutes: "legs",
  calves: "legs",
  abductors: "legs",
  adductors: "legs",
  abdominals: "core",
};

/** ค่า enum ของต้นทางที่รู้จัก (ตรวจกับ schema.json ที่ commit ที่ล็อก) — ค่านอกนี้ = ไม่แมปเงียบๆ แต่แจ้งผิดพลาด */
export const KNOWN_RAW_CATEGORIES = ["powerlifting", "strength", "stretching", "cardio", "olympic weightlifting", "strongman", "plyometrics"];
export const KNOWN_RAW_EQUIPMENT = [
  "medicine ball",
  "dumbbell",
  "body only",
  "bands",
  "kettlebells",
  "foam roll",
  "cable",
  "machine",
  "barbell",
  "exercise ball",
  "e-z curl bar",
  "other",
];
export const KNOWN_RAW_MUSCLES = [
  "abdominals", "abductors", "adductors", "biceps", "calves", "chest", "forearms", "glutes", "hamstrings", "lats",
  "lower back", "middle back", "neck", "quadriceps", "shoulders", "traps", "triceps",
];

export function mapCategory(raw: RawExercise): Category {
  if (raw.category === "stretching") return "mobility";
  if (raw.category === "cardio") return "cardio";
  if (raw.category === "olympic weightlifting" || raw.category === "strongman") return "full_body";
  const muscle = raw.primaryMuscles?.[0];
  return (muscle && MUSCLE_CATEGORY[muscle]) || "other";
}

const EQUIPMENT_MAP: Record<string, Equipment> = {
  barbell: "barbell",
  "e-z curl bar": "barbell",
  dumbbell: "dumbbell",
  kettlebells: "kettlebell",
  machine: "machine",
  cable: "cable",
  bands: "band",
  "body only": "bodyweight",
  "medicine ball": "other",
  "exercise ball": "other",
  "foam roll": "other",
  other: "other",
};

export function mapEquipment(raw: RawExercise): Equipment | null {
  return raw.equipment ? (EQUIPMENT_MAP[raw.equipment] ?? null) : null;
}

export function isUnilateralName(name: string): boolean {
  return /\b(single|one)[- ]?(arm|leg)/i.test(name) || /unilateral/i.test(name);
}

const RE_CARDIO_DISTANCE = /\b(run|running|jog|jogging|bike|bicycling|cycling|swim|swimming|row|rowing|elliptical)\b/i;
const RE_CARRY = /farmer|carry|yoke/i;
const RE_DURATION_NAME = /plank|\bhold\b|stretch/i;
const RE_PULL_DIP = /pull-?\s?ups?\b|chin-?\s?ups?\b|\bchins?\b|\bdips?\b/i;

/** ข้อ 5: `hang` เป็นคำเดี่ยว (ไม่ใช่ Hanging) และไม่ใช่ท่า clean/snatch ที่มีคำว่า hang เป็นจุดเริ่ม */
function isHangHold(name: string): boolean {
  return /\bhang\b/i.test(name) && !/clean|snatch/i.test(name);
}

export function mapTrack(raw: RawExercise, category: Category, equipment: Equipment | null): { track_type: TrackType; load_mode: LoadMode } {
  const name = raw.name;
  if (/assisted/i.test(name)) return { track_type: "weight_reps", load_mode: "assisted" }; // 1
  if (/treadmill|incline walk/i.test(name)) return { track_type: "incline_speed_duration", load_mode: "external" }; // 2
  if (category === "cardio" && RE_CARDIO_DISTANCE.test(name)) return { track_type: "distance_duration", load_mode: "external" }; // 3
  if (RE_CARRY.test(name)) return { track_type: "weight_duration", load_mode: "external" }; // 4
  if (category === "mobility" || raw.force === "static" || RE_DURATION_NAME.test(name) || isHangHold(name)) {
    return { track_type: "duration", load_mode: "external" }; // 5
  }
  if (category === "cardio") return { track_type: "duration", load_mode: "external" }; // 6
  if (equipment === "bodyweight" && RE_PULL_DIP.test(name)) return { track_type: "weight_reps", load_mode: "bodyweight_plus" }; // 7
  if (equipment === "bodyweight") return { track_type: "reps_only", load_mode: "external" }; // 8
  return { track_type: "weight_reps", load_mode: "external" }; // 9
}

/** ช่องที่ overrides.json แก้ได้ (ทุกแถวที่แก้ต้องมี reason — รายการนี้ส่ง Lead ใน PR) */
export type RowOverride = {
  reason: string;
  name?: string;
  track_type?: TrackType;
  load_mode?: LoadMode;
  is_unilateral?: boolean;
  category?: Category;
  equipment?: Equipment | null;
};
export type Overrides = Record<string, RowOverride>;

export type MappedFields = Pick<CatalogRow, "name" | "track_type" | "load_mode" | "is_unilateral" | "category" | "equipment">;

export function mapRaw(raw: RawExercise, overrides: Overrides = {}): MappedFields {
  const category = mapCategory(raw);
  const equipment = mapEquipment(raw);
  const track = mapTrack(raw, category, equipment);
  const base: MappedFields = {
    name: raw.name.trim(),
    ...track,
    is_unilateral: isUnilateralName(raw.name),
    category,
    equipment,
  };
  const o = overrides[raw.id];
  if (!o) return base;
  const { reason: _reason, ...fields } = o;
  void _reason;
  const merged = { ...base, ...fields } as MappedFields;
  // override ที่ทำให้ load_mode ผิดชนิดเมื่อเปลี่ยน track_type: ถอยกลับ external ให้ตรง CHECK
  if (!loadModeAllowed(merged.track_type, merged.load_mode)) merged.load_mode = "external";
  // distance_duration / incline_speed_duration ห้ามเป็นทีละข้าง (zod ฝั่งเซิร์ฟเวอร์ ecc3abf)
  if (merged.track_type === "distance_duration" || merged.track_type === "incline_speed_duration") merged.is_unilateral = false;
  return merged;
}

// ---------------------------------------------------------------- ตรวจคลัง

export type CheckResult = {
  errors: string[];
  warnings: string[];
  stats: {
    total: number;
    weights: number;
    cardio: number;
    sport: number;
    bySource: Record<string, number>;
    byTrackType: Record<string, number>;
    byCategory: Record<string, number>;
  };
};

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const THAI = /[฀-๿]/;
const FILE_KEYS = new Set(["source_dataset", "license", "attribution", "upstream_commit", "upstream_url", "exercises"]);
const ROW_KEYS = new Set(["id", "source_ref", "name", "name_th", "search_terms", "track_type", "load_mode", "is_unilateral", "category", "equipment"]);

/** รวมไฟล์เป็นแถวคลัง + ตรวจรูปไฟล์ (ช่องต้องห้าม ช่องแปลก meta ที่อนุญาต) */
export function flattenFiles(files: { file: string; data: unknown }[]): { rows: CatalogRow[]; errors: string[] } {
  const rows: CatalogRow[] = [];
  const errors: string[] = [];
  for (const { file, data } of files) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      errors.push(`${file}: ต้องเป็นอ็อบเจ็กต์ { source_dataset, license, attribution, exercises }`);
      continue;
    }
    const f = data as Record<string, unknown>;
    for (const k of Object.keys(f)) {
      if ((FORBIDDEN_KEYS as readonly string[]).includes(k)) errors.push(`${file}: มีช่องต้องห้าม "${k}" (D1)`);
      else if (!FILE_KEYS.has(k)) errors.push(`${file}: ช่องที่ไม่รู้จัก "${k}"`);
    }
    const ds = f.source_dataset;
    const allowed = typeof ds === "string" ? ALLOWED_SOURCES[ds] : undefined;
    if (!allowed) {
      errors.push(`${file}: source_dataset "${String(ds)}" ไม่อยู่ในรายการที่อนุญาต (ADR 0008 ข้อ 2)`);
      continue;
    }
    if (f.license !== allowed.license) errors.push(`${file}: license ต้องเป็น "${allowed.license}" (ได้ "${String(f.license)}")`);
    if (f.attribution !== allowed.attribution) errors.push(`${file}: attribution ไม่ตรงกับที่ระบุใน ADR 0008 ข้อ 2`);
    if (ds === "free-exercise-db" && !(typeof f.upstream_commit === "string" && /^[0-9a-f]{40}$/.test(f.upstream_commit))) {
      errors.push(`${file}: free-exercise-db ต้องล็อก upstream_commit (SHA 40 ตัว)`);
    }
    if (!Array.isArray(f.exercises)) {
      errors.push(`${file}: exercises ต้องเป็น array`);
      continue;
    }
    for (const [i, r] of (f.exercises as Record<string, unknown>[]).entries()) {
      const where = `${file}[${i}] ${String(r?.name ?? r?.source_ref ?? "?")}`;
      if (typeof r !== "object" || r === null) {
        errors.push(`${where}: ไม่ใช่อ็อบเจ็กต์`);
        continue;
      }
      for (const k of Object.keys(r)) {
        if ((FORBIDDEN_KEYS as readonly string[]).includes(k)) errors.push(`${where}: มีช่องต้องห้าม "${k}" (D1)`);
        else if (!ROW_KEYS.has(k)) errors.push(`${where}: ช่องที่ไม่รู้จัก "${k}"`);
      }
      rows.push({
        ...(r as FileRow),
        source_dataset: ds as string,
        license: allowed.license,
        attribution: allowed.attribution,
      });
    }
  }
  return { rows, errors };
}

export function checkCatalog(rows: CatalogRow[], preErrors: string[] = []): CheckResult {
  const errors = [...preErrors];
  const warnings: string[] = [];
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  const refs = new Map<string, string>();
  const namesTh = new Map<string, string[]>();
  const stats: CheckResult["stats"] = { total: rows.length, weights: 0, cardio: 0, sport: 0, bySource: {}, byTrackType: {}, byCategory: {} };

  for (const r of rows) {
    const who = `${r.source_dataset}/${r.source_ref} "${r.name}"`;
    const err = (m: string) => errors.push(`${who}: ${m}`);

    if (typeof r.id !== "string" || !UUID_V5.test(r.id)) err(`id ไม่ใช่ UUID v5 (${String(r.id)})`);
    else if (r.id !== catalogId(r.source_dataset, r.source_ref)) err(`id ไม่ตรงกับ v5("${r.source_dataset}:${r.source_ref}")`);
    else if (ids.has(r.id)) err(`id ซ้ำกับ ${ids.get(r.id)}`);
    else ids.set(r.id, who);

    if (!r.source_ref || !/^[0-9a-zA-Z_-]+$/.test(r.source_ref)) err("source_ref ว่างหรือมีอักขระนอก [0-9a-zA-Z_-]");
    else {
      const key = `${r.source_dataset}/${r.source_ref}`;
      if (refs.has(key)) err("source_ref ซ้ำในชุดข้อมูลเดียวกัน");
      refs.set(key, who);
    }

    if (!r.name || r.name.length < 1 || [...r.name].length > EXERCISE_LIMITS.nameMax) err(`name ต้อง 1–${EXERCISE_LIMITS.nameMax} ตัว`);
    else {
      const k = r.name.toLowerCase();
      if (names.has(k)) err(`name ซ้ำกับ ${names.get(k)}`);
      names.set(k, who);
    }
    if (r.name !== r.name?.trim() || /\s{2,}/.test(r.name ?? "")) err("name มีช่องว่างหัวท้าย/ซ้อน");

    if (!r.name_th) err("ไม่มี name_th");
    else {
      if ([...r.name_th].length > EXERCISE_LIMITS.nameMax) err(`name_th ยาวเกิน ${EXERCISE_LIMITS.nameMax} ตัว`);
      if (!THAI.test(r.name_th)) err("name_th ไม่มีอักษรไทย");
      if (r.name_th !== r.name_th.trim() || /\s{2,}/.test(r.name_th)) err("name_th มีช่องว่างหัวท้าย/ซ้อน");
      const list = namesTh.get(r.name_th) ?? [];
      list.push(r.name);
      namesTh.set(r.name_th, list);
    }

    if (!Array.isArray(r.search_terms)) err("search_terms ต้องเป็น array");
    else {
      const seen = new Set<string>();
      for (const t of r.search_terms) {
        if (typeof t !== "string" || !t.trim()) err("search_terms มีค่าว่าง");
        else if (t.includes(SEARCH_TERMS_SEPARATOR)) err(`search_terms มีตัวคั่น "${SEARCH_TERMS_SEPARATOR}": ${t}`);
        else if (t !== t.trim()) err(`search_terms มีช่องว่างหัวท้าย: "${t}"`);
        else if (seen.has(t)) err(`search_terms ซ้ำ: ${t}`);
        seen.add(t);
      }
      if (r.search_terms.length > 8) warnings.push(`${who}: search_terms ${r.search_terms.length} รายการ (มากผิดปกติ)`);
    }

    if (!isTrackType(r.track_type)) err(`track_type ไม่อยู่ในรายการ: ${String(r.track_type)}`);
    if (!isLoadMode(r.load_mode)) err(`load_mode ไม่อยู่ในรายการ: ${String(r.load_mode)}`);
    else if (isTrackType(r.track_type) && !loadModeAllowed(r.track_type, r.load_mode)) err(`load_mode "${r.load_mode}" ใช้ได้เฉพาะ weight_reps (track_type ${r.track_type})`);
    if (typeof r.is_unilateral !== "boolean") err("is_unilateral ต้องเป็น boolean");
    else if (r.is_unilateral && (r.track_type === "distance_duration" || r.track_type === "incline_speed_duration")) {
      err(`is_unilateral ต้องเป็น false เมื่อ track_type = ${r.track_type} (กติกา zod ของเซิร์ฟเวอร์ ecc3abf)`);
    }
    if (!isCategory(r.category)) err(`category ไม่อยู่ในรายการ: ${String(r.category)}`);
    if (r.equipment !== null && !isEquipment(r.equipment)) err(`equipment ไม่อยู่ในรายการ: ${String(r.equipment)}`);

    const allowed = ALLOWED_SOURCES[r.source_dataset];
    if (!allowed) err("source_dataset ไม่อยู่ในรายการที่อนุญาต");
    else if (r.license !== allowed.license || r.attribution !== allowed.attribution) err("license/attribution ไม่ตรงชุดข้อมูล");
    if (!r.source_dataset || !r.license || !r.attribution) err("ขาด source_dataset/license/attribution");

    stats.bySource[r.source_dataset] = (stats.bySource[r.source_dataset] ?? 0) + 1;
    stats.byTrackType[r.track_type] = (stats.byTrackType[r.track_type] ?? 0) + 1;
    stats.byCategory[r.category] = (stats.byCategory[r.category] ?? 0) + 1;
    if (r.category === "cardio") stats.cardio++;
    else if (r.category === "sport") stats.sport++;
    else stats.weights++;
  }

  for (const [th, list] of namesTh) if (list.length > 1) errors.push(`name_th ซ้ำกัน "${th}": ${list.join(" / ")}`);

  if (stats.weights < 750) errors.push(`ท่าเวท ${stats.weights} < 750 (แจ้ง Lead)`);
  const cs = stats.cardio + stats.sport;
  if (cs < 60 || cs > 100) errors.push(`คาร์ดิโอ+กีฬา ${cs} ไม่อยู่ใน 60–100`);
  return { errors, warnings, stats };
}

// ---------------------------------------------------------------- อ่านไฟล์

export const DEFAULT_CONTENT_DIR = path.resolve(process.cwd(), "content", "exercises");
/** ไฟล์คลังที่ seed/ตรวจอ่าน (ลำดับนี้) — overrides.json ไม่ใช่ไฟล์คลัง */
export const CATALOG_FILES = ["free-exercise-db.json", "fatcatfit.json"] as const;

export function loadCatalogFiles(dir: string = DEFAULT_CONTENT_DIR): { file: string; data: unknown }[] {
  return CATALOG_FILES.map((file) => ({ file, data: JSON.parse(readFileSync(path.join(dir, file), "utf8")) as unknown }));
}

export function loadCatalog(dir: string = DEFAULT_CONTENT_DIR): { rows: CatalogRow[]; errors: string[] } {
  return flattenFiles(loadCatalogFiles(dir));
}

// ---------------------------------------------------------------- seed

export type SeedResult = { inserted: number; updated: number; archived: number; unarchived: number; unchanged: number; changed: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PgDatabase<PgQueryResultHKT, any, any>;

type DbRow = typeof exercise.$inferSelect;
const packTerms = (terms: string[]): string | null => (terms.length ? terms.join(SEARCH_TERMS_SEPARATOR) : null);

function toValues(r: CatalogRow) {
  return {
    ownerUserId: null,
    name: r.name,
    nameTh: r.name_th,
    searchTerms: packTerms(r.search_terms),
    trackType: r.track_type,
    loadMode: r.load_mode,
    isUnilateral: r.is_unilateral,
    category: r.category,
    equipment: r.equipment,
    sourceDataset: r.source_dataset,
    sourceRef: r.source_ref,
    license: r.license,
    attribution: r.attribution,
  };
}

function sameContent(db: DbRow, v: ReturnType<typeof toValues>): boolean {
  return (
    db.name === v.name &&
    db.nameTh === v.nameTh &&
    db.searchTerms === v.searchTerms &&
    db.trackType === v.trackType &&
    db.loadMode === v.loadMode &&
    db.isUnilateral === v.isUnilateral &&
    db.category === v.category &&
    db.equipment === v.equipment &&
    db.sourceDataset === v.sourceDataset &&
    db.sourceRef === v.sourceRef &&
    db.license === v.license &&
    db.attribution === v.attribution
  );
}

/**
 * upsert คลังกลางด้วย id (contract R2 หัวข้อ seed) — รันซ้ำได้
 * - แตะ updated_at/client_updated_at เฉพาะแถวที่เนื้อหาเปลี่ยน (เป็นตัวกำหนด catalog_version) · แถวใหม่ตั้ง created_at ด้วย
 * - แถวคลังที่หายจากไฟล์ = ตั้ง archived_at (ไม่ลบ) · กลับมาในไฟล์ = เอา archived_at ออก
 * - ไม่แตะ met · ไม่แตะแถวของผู้ใช้ (owner_user_id ไม่ว่าง)
 */
export async function syncCatalog(db: AnyPgDb, rows: CatalogRow[], now: Date = new Date()): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, updated: 0, archived: 0, unarchived: 0, unchanged: 0, changed: 0 };
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(exercise).where(isNull(exercise.ownerUserId));
    const byId = new Map(existing.map((e) => [e.id, e]));
    const fileIds = new Set(rows.map((r) => r.id));
    // กันชน: id ของคลังต้องไม่เป็นแถวของผู้ใช้ (owner_user_id ไม่ว่าง)
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 500) {
      const hit = await tx.select({ id: exercise.id }).from(exercise).where(inArray(exercise.id, ids.slice(i, i + 500)));
      const clash = hit.find((h) => !byId.has(h.id));
      if (clash) throw new Error(`seed: id คลัง ${clash.id} ชนกับแถวของผู้ใช้ (owner_user_id ไม่ว่าง) — หยุด ไม่เขียนอะไร`);
    }

    const toInsert: (ReturnType<typeof toValues> & { id: string })[] = [];
    for (const r of rows) {
      const v = toValues(r);
      const cur = byId.get(r.id);
      if (!cur) {
        toInsert.push({ id: r.id, ...v });
        continue;
      }
      if (!sameContent(cur, v)) {
        await tx
          .update(exercise)
          .set({ ...v, archivedAt: null, updatedAt: now, clientUpdatedAt: now })
          .where(eq(exercise.id, r.id));
        result.updated++;
        if (cur.archivedAt) result.unarchived++;
      } else if (cur.archivedAt) {
        await tx.update(exercise).set({ archivedAt: null, updatedAt: now, clientUpdatedAt: now }).where(eq(exercise.id, r.id));
        result.unarchived++;
      } else {
        result.unchanged++;
      }
    }

    for (let i = 0; i < toInsert.length; i += 200) {
      const batch = toInsert.slice(i, i + 200).map((v) => ({ ...v, createdAt: now, updatedAt: now, clientUpdatedAt: now }));
      await tx.insert(exercise).values(batch);
      result.inserted += batch.length;
    }

    const gone = existing.filter((e) => !fileIds.has(e.id) && !e.archivedAt).map((e) => e.id);
    if (gone.length) {
      await tx.update(exercise).set({ archivedAt: now, updatedAt: now, clientUpdatedAt: now }).where(inArray(exercise.id, gone));
      result.archived = gone.length;
    }
  });
  result.changed = result.inserted + result.updated + result.archived + result.unarchived;
  return result;
}

export function formatSeedResult(r: SeedResult): string {
  if (r.changed === 0) return `seed: เปลี่ยน 0 แถว (ไม่เปลี่ยน ${r.unchanged} แถว)`;
  return `seed: เพิ่ม ${r.inserted} · แก้ ${r.updated} · เก็บเข้ากรุ ${r.archived} · เอาออกจากกรุ ${r.unarchived} · ไม่เปลี่ยน ${r.unchanged} แถว`;
}

// ค่าคงที่ที่ใช้ตรวจ (ให้เทสต์เห็นว่าไฟล์นี้ใช้ชุดเดียวกับ exercise-meta)
export const META = { TRACK_TYPES, LOAD_MODES, CATEGORIES, EQUIPMENT } as const;
