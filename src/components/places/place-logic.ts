// ตรรกะบริสุทธิ์ของสถานที่ (R2 · D7) — ไม่มี React/DOM

import { EXERCISE_LIMITS } from "@/lib/data/shared/exercise-meta";
import type { WirePlace } from "@/lib/data/shared/sync";

const time = (iso: string | null): number => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);

/**
 * ลำดับสถานที่ที่ไม่อยู่ในกรุ (แผ่นเลือก และหน้า สถานที่): ใช้ล่าสุดก่อน
 * ที่ไม่เคยใช้ (ไม่มี last_used_at) ตามหลัง เรียงตามเวลาสร้าง (เก่าก่อน)
 */
export function sortActive(places: readonly WirePlace[]): WirePlace[] {
  return places
    .filter((p) => !p.archived_at)
    .sort((a, b) => {
      const la = time(a.last_used_at);
      const lb = time(b.last_used_at);
      if (la !== lb) return lb - la;
      return time(a.created_at) - time(b.created_at) || (a.id < b.id ? -1 : 1);
    });
}

/** สถานที่ในกรุ เรียงตามชื่อ */
export function archivedPlaces(places: readonly WirePlace[]): WirePlace[] {
  return places.filter((p) => p.archived_at).sort((a, b) => a.name.localeCompare(b.name));
}

/** ที่ที่ชิปหน้าหลักแสดง = ใช้ล่าสุดใหม่สุด (ไม่มีค่าเลย = สร้างก่อนสุด) · ไม่มีที่ใช้งานเลย = null */
export function currentPlace(places: readonly WirePlace[]): WirePlace | null {
  return sortActive(places)[0] ?? null;
}

export const activeCount = (places: readonly WirePlace[]): number => places.filter((p) => !p.archived_at).length;
export const atPlaceLimit = (places: readonly WirePlace[]): boolean => activeCount(places) >= EXERCISE_LIMITS.maxPlaces;

/** เก็บเข้ากรุได้เมื่อยังเหลือที่ใช้งานอย่างน้อย 1 แห่งหลังเก็บ */
export const canArchive = (places: readonly WirePlace[], id: string): boolean => places.some((p) => p.id !== id && !p.archived_at);

/** ชื่อซ้ำกับที่อื่น (รวมในกรุ · ไม่สนตัวพิมพ์ · ตัดช่องว่าง) — เตือนไม่บล็อก */
export function isDuplicatePlace(name: string, places: readonly Pick<WirePlace, "id" | "name">[], selfId: string | null): boolean {
  const n = name.trim().normalize("NFC").toLowerCase();
  if (n === "") return false;
  return places.some((p) => p.id !== selfId && p.name.trim().normalize("NFC").toLowerCase() === n);
}

export const placeNameValid = (name: string): boolean => {
  const len = Array.from(name.trim()).length;
  return len >= 1 && len <= EXERCISE_LIMITS.nameMax;
};

/** แถวที่ประกอบในเครื่องหลังเซิร์ฟเวอร์ตอบ applied */
export function buildPlaceRow(args: { id: string; base: WirePlace | null; name: string; lastUsedAt?: string | null; archivedAt?: string | null; mapUrl?: string | null; now: string }): WirePlace {
  return {
    id: args.id,
    name: args.name.trim(),
    map_url: args.mapUrl !== undefined ? args.mapUrl : (args.base?.map_url ?? null),
    last_used_at: args.lastUsedAt !== undefined ? args.lastUsedAt : (args.base?.last_used_at ?? null),
    archived_at: args.archivedAt !== undefined ? args.archivedAt : (args.base?.archived_at ?? null),
    created_at: args.base?.created_at ?? args.now,
    updated_at: args.now,
    client_updated_at: args.now,
  };
}
