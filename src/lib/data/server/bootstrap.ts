import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { exercise, place, profile } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getCatalogVersion } from "@/lib/data/server/catalog";
import type { BootstrapResponse, WireExercise, WirePlace, WireProfile } from "@/lib/data/shared/sync";

// GET /api/bootstrap (R2: profile · places · my_exercises · catalog_version · server_time) — R3 เพิ่มส่วนที่เหลือ (ADR 0004 ข้อ 2)
// ทุก query กรองด้วย userId ที่ได้จาก requireUser และ deleted_at IS NULL (รวมแถวที่เก็บเข้ากรุ ไม่รวมแถวที่ลบ)

const iso = (d: Date) => d.toISOString();

function parseGoals(text: string): string[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getBootstrap(db: AppDb, userId: string, now: Date): Promise<BootstrapResponse> {
  const [p] = await db.select().from(profile).where(eq(profile.userId, userId)).limit(1);
  const placeRows = await db
    .select()
    .from(place)
    .where(and(eq(place.userId, userId), isNull(place.deletedAt)))
    .orderBy(asc(place.createdAt), asc(place.id));
  const exRows = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.ownerUserId, userId), isNull(exercise.deletedAt)))
    .orderBy(asc(exercise.name), asc(exercise.id));

  const wireProfile: WireProfile | null = p
    ? {
        locale: p.locale as "th" | "en",
        weight_unit: p.weightUnit,
        length_unit: p.lengthUnit,
        distance_unit: p.distanceUnit,
        theme: p.theme,
        rest_seconds: p.restSeconds,
        birth_year: p.birthYear,
        height_m: p.heightM,
        height_input: p.heightInput,
        height_unit: p.heightUnit,
        goals: parseGoals(p.goals),
        experience: p.experience,
        updated_at: iso(p.updatedAt),
        client_updated_at: iso(p.clientUpdatedAt),
      }
    : null;

  const places: WirePlace[] = placeRows.map((r) => ({
    id: r.id,
    name: r.name,
    map_url: r.mapUrl,
    last_used_at: r.lastUsedAt ? iso(r.lastUsedAt) : null,
    archived_at: r.archivedAt ? iso(r.archivedAt) : null,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
    client_updated_at: iso(r.clientUpdatedAt),
  }));

  const myExercises: WireExercise[] = exRows.map((r) => ({
    id: r.id,
    owner_user_id: r.ownerUserId,
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
    archived_at: r.archivedAt ? iso(r.archivedAt) : null,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
    client_updated_at: iso(r.clientUpdatedAt),
  }));

  return {
    profile: wireProfile,
    places,
    my_exercises: myExercises,
    catalog_version: await getCatalogVersion(db),
    server_time: iso(now),
  };
}
