import "server-only";
import { asc, count, isNull, max } from "drizzle-orm";
import { exercise } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { CatalogExercise, CatalogResponse } from "@/lib/data/shared/sync";

// คลังท่ากลาง (owner_user_id IS NULL) — ข้อมูลสาธารณะ อ่านได้ทุกคนที่ล็อกอิน · เขียนได้เฉพาะสคริปต์ seed
// catalog_version = <จำนวนแถว>-<max(updated_at) เป็น ms> (contract R2 ข้อ 3) · ไม่มีตารางเพิ่ม

export async function getCatalogVersion(db: AppDb): Promise<string> {
  const [r] = await db
    .select({ n: count(), latest: max(exercise.updatedAt) })
    .from(exercise)
    .where(isNull(exercise.ownerUserId));
  return `${r?.n ?? 0}-${r?.latest ? r.latest.getTime() : 0}`;
}

export async function getCatalog(db: AppDb): Promise<CatalogResponse> {
  const rows = await db
    .select()
    .from(exercise)
    .where(isNull(exercise.ownerUserId))
    .orderBy(asc(exercise.name), asc(exercise.id));
  const exercises: CatalogExercise[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    name_th: r.nameTh,
    search_terms: r.searchTerms,
    track_type: r.trackType,
    load_mode: r.loadMode,
    is_unilateral: r.isUnilateral,
    category: r.category,
    equipment: r.equipment,
    source_dataset: r.sourceDataset,
    source_ref: r.sourceRef,
    license: r.license,
    attribution: r.attribution,
    met: r.met,
    archived_at: r.archivedAt ? r.archivedAt.toISOString() : null,
  }));
  // version คำนวณจากแถวชุดเดียวกับที่ส่ง (กันเวอร์ชันกับเนื้อหาเหลื่อมกันถ้า seed ทำงานระหว่างอ่าน)
  const latest = rows.reduce((m, r) => Math.max(m, r.updatedAt.getTime()), 0);
  return { catalog_version: `${rows.length}-${latest}`, exercises };
}
