// ตัวช่วยเทสต์หน้าจอที่อ่าน/เขียนผ่านข้อมูลในเครื่อง (R3a) — เปิดฐานในหน่วยความจำจริงของ src/lib/offline แล้วใส่ snapshot ให้
// เครือข่ายถูกตัดไว้ (fetch ล้ม) → การเขียนค้างอยู่ในคิว ตรวจได้จาก getLocalView().ops · ไม่ใช้ในแอป

import { closeOffline, initOffline, type OfflineDeps } from "@/lib/offline/client";
import { createMemoryStore, type OfflineStore } from "@/lib/offline/store";
import type { BootstrapResponse, CatalogResponse, WireMyExercise, WirePlace } from "@/lib/data/shared/sync";

const AT = "2026-01-01T00:00:00.000Z";

export const snapshotOf = (over: Partial<BootstrapResponse> = {}): BootstrapResponse => ({
  profile: {
    locale: "th",
    weight_unit: "kg",
    length_unit: "cm",
    distance_unit: "km",
    theme: "system",
    rest_seconds: 90,
    birth_year: 1990,
    height_m: 1.7,
    height_input: 170,
    height_unit: "cm",
    goals: [],
    experience: null,
    updated_at: AT,
    client_updated_at: AT,
  },
  places: [],
  my_exercises: [],
  active_sessions: [],
  recent_sessions: [],
  exercise_summaries: [],
  catalog_version: "1",
  server_time: AT,
  ...over,
});

export const placeRow = (over: Partial<WirePlace> = {}): WirePlace => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Gym",
  map_url: null,
  has_sessions: false,
  last_used_at: null,
  archived_at: null,
  created_at: AT,
  updated_at: AT,
  client_updated_at: AT,
  ...over,
});

export const myExerciseRow = (over: Partial<WireMyExercise> = {}): WireMyExercise => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  owner_user_id: "me-1",
  name: "Curl",
  name_th: null,
  search_terms: null,
  track_type: "weight_reps",
  load_mode: "external",
  is_unilateral: false,
  category: "arms",
  equipment: "dumbbell",
  source_dataset: null,
  source_ref: null,
  license: null,
  attribution: null,
  met: null,
  archived_at: null,
  created_at: AT,
  updated_at: AT,
  client_updated_at: AT,
  has_history: false,
  ...over,
});

/** เปิดฐานในหน่วยความจำของผู้ใช้ทดสอบ · เรียกซ้ำหลัง closeTestOffline() ได้ */
export async function openTestOffline(opts: { snapshot?: Partial<BootstrapResponse> | null; catalog?: CatalogResponse | null; userId?: string } = {}): Promise<OfflineStore> {
  const store = createMemoryStore();
  if (opts.snapshot !== null) await store.setKv("snapshot", { data: snapshotOf(opts.snapshot), fetched_at: Date.now() });
  if (opts.catalog) await store.setKv("catalog", { data: opts.catalog, fetched_at: Date.now() });
  const deps: Partial<OfflineDeps> = {
    openStore: async () => store,
    fetch: (async () => {
      throw new TypeError("offline");
    }) as typeof fetch,
    listen: false,
    persist: async () => true,
  };
  await initOffline(opts.userId ?? "test-user", deps);
  return store;
}

export function closeTestOffline(): void {
  closeOffline();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ไม่มี storage
  }
}
