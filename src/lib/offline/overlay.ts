// สิ่งที่แสดงบนจอ = snapshot (ผลล่าสุดของ bootstrap) ทับด้วยรายการในคิวที่ยังไม่ส่ง (ADR 0004 ข้อ 2) — ฟังก์ชันบริสุทธิ์
// รายการที่ส่งไม่ผ่านไม่อยู่ในคิวแล้ว → ไม่ถูกทับ (จอแสดงค่าของเซิร์ฟเวอร์)

import type { WireMyExercise, WirePlace } from "@/lib/data/shared/sync";
import type { OutboxEntity, OutboxOp } from "./types";

/** ทับแถวด้วยคิวตามลำดับ seq: upsert = รวมช่อง (แถวใหม่ใช้ make) · delete = เอาออก */
export function overlayRows<T extends { id: string }>(
  rows: T[],
  entity: OutboxEntity,
  ops: OutboxOp[],
  make: (id: string, data: Record<string, unknown>, at: string) => T,
): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const op of [...ops].sort((a, b) => a.seq - b.seq)) {
    if (op.entity !== entity) continue;
    if (op.action === "delete") byId.delete(op.id);
    else if (op.data) {
      const base = byId.get(op.id);
      byId.set(op.id, base ? ({ ...base, ...op.data, id: op.id, client_updated_at: op.client_updated_at } as T) : make(op.id, op.data, op.client_updated_at));
    }
  }
  return [...byId.values()];
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function overlayPlaces(rows: WirePlace[], ops: OutboxOp[]): WirePlace[] {
  return overlayRows(rows, "place", ops, (id, d, at) => ({
    id,
    name: str(d.name) ?? "",
    map_url: str(d.map_url),
    has_sessions: false,
    last_used_at: str(d.last_used_at),
    archived_at: str(d.archived_at),
    created_at: at,
    updated_at: at,
    client_updated_at: at,
  }));
}

export function overlayMyExercises(rows: WireMyExercise[], ops: OutboxOp[]): WireMyExercise[] {
  return overlayRows(rows, "exercise", ops, (id, d, at) => ({
    id,
    owner_user_id: null,
    name: str(d.name) ?? "",
    name_th: null,
    search_terms: null,
    track_type: str(d.track_type) ?? "weight_reps",
    load_mode: str(d.load_mode) ?? "external",
    is_unilateral: d.is_unilateral === true,
    category: str(d.category) ?? "other",
    equipment: str(d.equipment),
    source_dataset: null,
    source_ref: null,
    license: null,
    attribution: null,
    met: null,
    archived_at: str(d.archived_at),
    created_at: at,
    updated_at: at,
    client_updated_at: at,
    has_history: false,
  }));
}

/** id ของแถวที่มีในคิว (ไว้แสดง "ค้างส่ง" รายแถวถ้าต้องการ) */
export function pendingRowIds(ops: OutboxOp[], entity: OutboxEntity): Set<string> {
  return new Set(ops.filter((o) => o.entity === entity).map((o) => o.id));
}
