import { describe, expect, it } from "vitest";
import { EMPTY_STATUS, type RejectedItem, type SyncStatus } from "@/lib/offline/types";
import { groupRejected } from "@/lib/offline/rejected";
import th from "../../../messages/th.json";
import { copyText, describeRejected, type Translate } from "./rejected-format";
import { barOf, STALE_MS } from "./sync-logic";

const st = (o: Partial<SyncStatus>): SyncStatus => ({ ...EMPTY_STATUS, ...o });
const NOW = 1_000_000_000_000;

describe("แถบสถานะ (UX 13.1 · ข้อบนชนะ)", () => {
  it("ไม่มีอะไร = ไม่มีแถบ", () => expect(barOf(st({}), false, NOW)).toBeNull());
  it("401 ชนะทุกข้อ", () => expect(barOf(st({ phase: "auth_required", pending: 3, rejected: 1 }), true, NOW)).toEqual({ kind: "authNeeded", count: 3 }));
  it("ส่งไม่ผ่านชนะออฟไลน์/ค้างส่ง", () => expect(barOf(st({ rejected: 2, pending: 4 }), true, NOW)).toEqual({ kind: "rejected", count: 2 }));
  it("ออฟไลน์: ค้าง > 24 ชม. = เตือน · ค้างปกติ = จดไว้ในเครื่อง N · ไม่มีค้าง = เน็ตหลุด", () => {
    expect(barOf(st({ pending: 2, oldestPendingAt: NOW - STALE_MS - 1 }), true, NOW)?.kind).toBe("stale");
    expect(barOf(st({ pending: 2, oldestPendingAt: NOW - 1000 }), true, NOW)).toEqual({ kind: "offlinePending", count: 2 });
    expect(barOf(st({}), true, NOW)).toEqual({ kind: "offline", count: 0 });
  });
  it("ออนไลน์ส่งล้ม = ส่งเลย · กำลังส่งเกิน 1 วิถึงแสดง · ส่งครบแสดง 2 วิ", () => {
    expect(barOf(st({ phase: "retry_wait", pending: 3 }), false, NOW)).toEqual({ kind: "pending", count: 3 });
    expect(barOf(st({ phase: "syncing", pending: 3, syncingSince: NOW - 500 }), false, NOW)).toBeNull();
    expect(barOf(st({ phase: "syncing", pending: 3, syncingSince: NOW - 1500 }), false, NOW)).toEqual({ kind: "sending", count: 3 });
    expect(barOf(st({ lastDrainedAt: NOW - 1000 }), false, NOW)?.kind).toBe("done");
    expect(barOf(st({ lastDrainedAt: NOW - 2500 }), false, NOW)).toBeNull();
  });
});

const item = (o: Partial<RejectedItem>): RejectedItem => ({
  op_id: "o1",
  entity: "set_record",
  id: "row-id-secret",
  action: "upsert",
  data: { weight_input: 65, weight_unit: "kg", reps: 5, set_kind: "normal" },
  client_updated_at: "2026-11-24T12:42:00.000Z",
  code: "invalid",
  rejected_at: 1,
  display: { exercise_name: "Bench press", track_type: "weight_reps", load_mode: "external" },
  ...o,
});
const t: Translate = (key, values) => {
  let cur: unknown = th;
  for (const p of key.split(".")) cur = (cur as Record<string, unknown>)[p];
  return String(cur).replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? ""));
};

describe("แถวส่งไม่ผ่านและข้อความคัดลอก (UX 13.2)", () => {
  it("เซ็ต: ชนิด · ชื่อ · ค่า · เหตุผล", () => {
    const [g] = groupRejected([item({})]);
    const r = describeRejected(g, t, "en");
    expect(r).toMatchObject({ kind: "เซ็ต", title: "Bench press", value: "65 kg × 5", reason: "ข้อมูลไม่ครบหรือค่าเกินช่วง", code: "invalid" });
  });
  it("วอร์มอัพต่อท้าย · ลูกที่ตกตามพ่อแม่รวมเป็นกลุ่มเดียว", () => {
    const parent = item({ op_id: "p", entity: "session_exercise", id: "se1", data: { session_id: "s", exercise_id: "e", position: 0 }, code: "exercise_has_history" });
    const child = item({ op_id: "c", id: "set1", data: { session_exercise_id: "se1", weight_input: 1, weight_unit: "kg", reps: 1, set_kind: "warmup" }, code: "parent_missing" });
    const groups = groupRejected([parent, child]);
    expect(groups).toHaveLength(1);
    expect(groups[0].children).toHaveLength(1);
    expect(describeRejected(groups[0], t, "en").childCount).toBe(1);
  });
  it("ข้อความคัดลอกมีหัว รุ่น เหตุผล code · ไม่มี id ของแถว", () => {
    const text = copyText(groupRejected([item({})]), t, "en", "0.6.0");
    expect(text).toContain("รุ่น 0.6.0");
    expect(text).toContain("Bench press");
    expect(text).toContain("(invalid)");
    expect(text).not.toContain("row-id-secret");
  });
});
