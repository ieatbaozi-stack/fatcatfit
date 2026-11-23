// การเขียนสถานที่ผ่าน POST /api/sync/push (R2: ออนไลน์อย่างเดียว) + อัปเดตข้อมูลในแท็บหลังเซิร์ฟเวอร์ตอบ applied
// ไม่มีปุ่มลบสถานที่ (D7) — มีแต่ เพิ่ม · แก้ชื่อ · เก็บเข้ากรุ/เอาออกจากกรุ · เลือกที่เล่น (last_used_at)

import { pushOne } from "@/components/catalog/api";
import { loadBootstrap, upsertPlace } from "@/components/catalog/store";
import type { WirePlace } from "@/lib/data/shared/sync";
import { buildPlaceRow } from "./place-logic";

export type PlaceFailure = "limit" | "invalid" | "failed";
export type PlaceResult = { ok: true; row: WirePlace } | { ok: false; reason: PlaceFailure };

type Patch = { name?: string; lastUsedAt?: string | null; archivedAt?: string | null };

/** upsert ทั้งแถว (ส่ง name เสมอ ตามสัญญา push) · base = null = สร้างใหม่ */
export async function writePlace(id: string, base: WirePlace | null, patch: Patch): Promise<PlaceResult> {
  const name = (patch.name ?? base?.name ?? "").trim();
  const data: Record<string, unknown> = { name };
  if (patch.lastUsedAt !== undefined) data.last_used_at = patch.lastUsedAt;
  if (patch.archivedAt !== undefined) data.archived_at = patch.archivedAt;
  const r = await pushOne({ entity: "place", id, action: "upsert", data });
  if (r.kind === "applied") {
    const row = buildPlaceRow({ id, base, name, lastUsedAt: patch.lastUsedAt, archivedAt: patch.archivedAt, now: new Date().toISOString() });
    upsertPlace(row);
    void loadBootstrap(); // ถามค่าจริงจากเซิร์ฟเวอร์เงียบๆ (ข้ามเครื่อง)
    return { ok: true, row };
  }
  if (r.kind === "stale") {
    void loadBootstrap();
    return { ok: false, reason: "failed" };
  }
  if (r.kind === "rejected" && r.code === "limit_reached") return { ok: false, reason: "limit" };
  if (r.kind === "rejected" && r.code === "invalid") return { ok: false, reason: "invalid" };
  return { ok: false, reason: "failed" };
}

export const addPlace = (name: string, opts: { select: boolean }): Promise<PlaceResult> =>
  writePlace(crypto.randomUUID(), null, { name, ...(opts.select ? { lastUsedAt: new Date().toISOString() } : {}) });

/** เลือกที่เล่น: ชิปเปลี่ยนทันที (แก้ในแท็บก่อน) แล้วส่ง · ล้ม = คืนค่าเดิม */
export async function selectPlace(place: WirePlace): Promise<boolean> {
  const at = new Date().toISOString();
  upsertPlace({ ...place, last_used_at: at });
  const r = await writePlace(place.id, place, { lastUsedAt: at });
  if (!r.ok) upsertPlace(place);
  return r.ok;
}
