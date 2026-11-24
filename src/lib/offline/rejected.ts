// รายการที่ส่งไม่ผ่าน → แถวของแผ่น "ส่งไม่ผ่าน" (UX 13.2) — ฟังก์ชันบริสุทธิ์
// - ลูกที่ตกตามพ่อแม่ (parent_missing และพ่อแม่อยู่ในรายการด้วย) รวมใต้แถวพ่อแม่ ทิ้ง/คัดลอกไปด้วยกัน
// - เหตุผล: code จากเซิร์ฟเวอร์ · `invalid` ของเซ็ตที่ชนิดการจดตอนจดไม่ตรงกับท่าปัจจุบัน = `track_type_changed`

import type { PushRejectCode } from "@/lib/data/shared/sync";
import type { RejectedItem } from "./types";

export type RejectedReason = PushRejectCode | "track_type_changed" | "unknown";

export type RejectedGroup = {
  /** แถวหลัก */
  item: RejectedItem;
  reason: RejectedReason;
  /** ลูกที่ตกตามแถวนี้ (ไม่แสดงแยกแถว · "และอีก N รายการในเซสชันนี้") */
  children: RejectedItem[];
  /** op_id ทั้งหมดของกลุ่ม (ส่งให้ discardRejected) */
  opIds: string[];
};

/** ท่าปัจจุบันตาม snapshot (ไว้เทียบชนิดการจด) */
export type ExerciseLookup = (exerciseId: string) => { track_type: string; load_mode: string } | undefined;

function parentOf(it: RejectedItem): { entity: string; id: string } | null {
  if (it.entity === "set_record" && typeof it.data?.session_exercise_id === "string") return { entity: "session_exercise", id: it.data.session_exercise_id };
  if (it.entity === "session_exercise" && typeof it.data?.session_id === "string") return { entity: "workout_session", id: it.data.session_id };
  return null;
}

export function explainRejected(it: RejectedItem, lookup: ExerciseLookup): RejectedReason {
  if (it.code === "invalid" && (it.entity === "set_record" || it.entity === "session_exercise")) {
    const d = it.display;
    const cur = d?.exercise_id ? lookup(d.exercise_id) : undefined;
    if (cur && d?.track_type && (cur.track_type !== d.track_type || (d.load_mode && cur.load_mode !== d.load_mode))) return "track_type_changed";
  }
  return it.code;
}

/** จัดกลุ่ม ใหม่สุดก่อน */
export function groupRejected(items: RejectedItem[], lookup: ExerciseLookup = () => undefined): RejectedGroup[] {
  const key = (e: string, id: string) => `${e}:${id}`;
  const byRow = new Map(items.map((i) => [key(i.entity, i.id), i]));
  /** แถวบนสุดในรายการ (ไล่พ่อแม่ขึ้นไปเรื่อยๆ ตราบที่พ่อแม่อยู่ในรายการ) */
  const rootOf = (it: RejectedItem): RejectedItem => {
    let cur = it;
    for (let i = 0; i < 3; i++) {
      if (cur.code !== "parent_missing") break;
      const p = parentOf(cur);
      const pi = p ? byRow.get(key(p.entity, p.id)) : undefined;
      if (!pi) break;
      cur = pi;
    }
    return cur;
  };
  const groups = new Map<string, RejectedGroup>();
  for (const it of items) {
    const root = rootOf(it);
    let g = groups.get(root.op_id);
    if (!g) {
      g = { item: root, reason: explainRejected(root, lookup), children: [], opIds: [root.op_id] };
      groups.set(root.op_id, g);
    }
    if (root !== it) {
      g.children.push(it);
      g.opIds.push(it.op_id);
    }
  }
  return [...groups.values()].sort((a, b) => b.item.rejected_at - a.item.rejected_at);
}
