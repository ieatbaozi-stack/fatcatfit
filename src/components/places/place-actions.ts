// การเขียนสถานที่ผ่านคิวในเครื่อง (R3a: ออฟไลน์ก็ทำได้ · UX 13.1) — เขียนลงเครื่องแล้วจอเปลี่ยนทันที ส่งขึ้นเซิร์ฟเวอร์เองทีหลัง
// ผลปฏิเสธจากเซิร์ฟเวอร์ (ชื่อซ้ำเพดาน ลบไม่ได้ ฯลฯ) ไปอยู่แผ่น "ส่งไม่ผ่าน" ไม่ใช่ข้อความในฟอร์ม
// เพิ่ม · แก้ชื่อ/ลิงก์แผนที่ · เก็บเข้ากรุ/เอาออกจากกรุ · เลือกที่เล่น (last_used_at) · ลบ (CR3 D4: ยังไม่มีเซสชัน)
// คิวรวมรายการของแถวเดียวกันโดยแทนที่ data ทั้งก้อน → ส่งทั้งแถวเสมอ

import { deleteEntity, writeEntity } from "@/lib/offline/client";
import type { LocalView } from "@/lib/offline/client";
import type { WirePlace } from "@/lib/data/shared/sync";

/** failed = เขียนลงเครื่องไม่ได้ (พื้นที่เต็ม/ที่เก็บใช้ไม่ได้/ยังไม่พร้อม) */
export type PlaceFailure = "failed";
export type PlaceResult = { ok: true } | { ok: false; reason: PlaceFailure };

/** mapUrl: ไม่ส่ง = คงเดิม · null = ล้าง · string = ตั้ง (ผู้เรียกตรวจด้วย normalizeMapUrl แล้ว) */
type Patch = { name?: string; lastUsedAt?: string | null; archivedAt?: string | null; mapUrl?: string | null };

type Intent = "create" | "edit" | "archive" | "unarchive" | "select";

/** upsert ทั้งแถว · base = null = สร้างใหม่ */
export async function writePlace(id: string, base: WirePlace | null, patch: Patch, intent?: Intent): Promise<PlaceResult> {
  const data = {
    name: (patch.name ?? base?.name ?? "").trim(),
    map_url: patch.mapUrl !== undefined ? patch.mapUrl : (base?.map_url ?? null),
    last_used_at: patch.lastUsedAt !== undefined ? patch.lastUsedAt : (base?.last_used_at ?? null),
    archived_at: patch.archivedAt !== undefined ? patch.archivedAt : (base?.archived_at ?? null),
  };
  const kind: Intent = intent ?? (base === null ? "create" : "edit");
  const r = await writeEntity("place", id, data, { create: base === null, display: { place_name: data.name, intent: kind } });
  return r.ok ? { ok: true } : { ok: false, reason: "failed" };
}

/** id คงที่ต่อแผ่นเพิ่ม (ผู้เรียกสร้างครั้งเดียว) — ลองใหม่ = upsert แถวเดิม ไม่เกิดสถานที่ซ้ำ */
export const addPlace = (id: string, name: string, opts: { select: boolean; mapUrl?: string | null }): Promise<PlaceResult> =>
  writePlace(id, null, { name, ...(opts.select ? { lastUsedAt: new Date().toISOString() } : {}), ...(opts.mapUrl ? { mapUrl: opts.mapUrl } : {}) }, opts.select ? "select" : "create");

/** ลบสถานที่ — ผู้เรียกไม่เสนอปุ่มถ้ามีเซสชันแล้ว (เซิร์ฟเวอร์ปฏิเสธ `place_has_history` ด้วย) · แห่งสุดท้าย = เซิร์ฟเวอร์ปฏิเสธ */
export async function deletePlace(place: WirePlace): Promise<PlaceResult> {
  const r = await deleteEntity("place", place.id, { display: { place_name: place.name, intent: "delete" } });
  return r.ok ? { ok: true } : { ok: false, reason: "failed" };
}

/** เลือกที่เล่น: ชิปเปลี่ยนทันที (คิวทับมุมมอง) แล้วส่งเอง */
export async function selectPlace(place: WirePlace): Promise<boolean> {
  const r = await writePlace(place.id, place, { lastUsedAt: new Date().toISOString() }, "select");
  return r.ok;
}

/**
 * สถานที่นี้มีเซสชันไหม (D8/CR3 D4): has_sessions จากเซิร์ฟเวอร์ · หรือมีเซสชันในเครื่องที่อ้างสถานที่นี้
 * (เซสชันที่เล่นอยู่ ที่จบแล้วยังค้างส่ง และที่อยู่ใน bootstrap) → ลบไม่ได้ เก็บเข้ากรุได้
 */
export function placeHasSessions(place: Pick<WirePlace, "id" | "has_sessions">, view: Pick<LocalView, "snapshot" | "ops" | "activeSession">): boolean {
  if (place.has_sessions) return true;
  const s = view.snapshot;
  if (s && [...(s.active_sessions ?? []), ...(s.recent_sessions ?? [])].some((x) => x.place_id === place.id)) return true;
  if (view.activeSession?.queued && view.activeSession.session.place_id === place.id) return true;
  return view.ops.some((op) => op.entity === "workout_session" && op.action === "upsert" && op.data?.place_id === place.id);
}

/** สถานที่ของเซสชันที่เล่นอยู่ — ลบ/เก็บเข้ากรุไม่ได้ (UX 13.6) */
export const isActivePlace = (place: Pick<WirePlace, "id">, view: Pick<LocalView, "activeSession">): boolean => view.activeSession?.session.place_id === place.id;
