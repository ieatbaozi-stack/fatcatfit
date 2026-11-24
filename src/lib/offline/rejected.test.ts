import { describe, expect, it } from "vitest";
import { overlayMyExercises, overlayPlaces } from "./overlay";
import { explainRejected, groupRejected } from "./rejected";
import type { OutboxOp, RejectedItem } from "./types";

const item = (over: Partial<RejectedItem>): RejectedItem => ({
  op_id: over.id ?? "o",
  entity: "set_record",
  id: "x",
  action: "upsert",
  data: {},
  client_updated_at: "2026-11-24T10:00:00Z",
  code: "invalid",
  rejected_at: 1,
  ...over,
});

describe("groupRejected (UX 13.2)", () => {
  it("ลูก parent_missing ที่พ่อแม่อยู่ในรายการ รวมใต้แถวพ่อแม่ (ไล่ถึงเซสชัน) · ใหม่สุดก่อน", () => {
    const items = [
      item({ id: "s", entity: "workout_session", code: "limit_reached", rejected_at: 5 }),
      item({ id: "e", entity: "session_exercise", code: "parent_missing", data: { session_id: "s" }, rejected_at: 5 }),
      item({ id: "r", entity: "set_record", code: "parent_missing", data: { session_exercise_id: "e" }, rejected_at: 5 }),
      item({ id: "p", entity: "place", code: "place_has_history", rejected_at: 9 }),
      item({ id: "q", entity: "set_record", code: "parent_missing", data: { session_exercise_id: "other" }, rejected_at: 1 }),
    ];
    const g = groupRejected(items);
    expect(g.map((x) => x.item.id)).toEqual(["p", "s", "q"]);
    expect(g[1].children.map((c) => c.id)).toEqual(["e", "r"]);
    expect(g[1].opIds).toEqual(["s", "e", "r"]);
    expect(g[2].children).toEqual([]);
  });

  it("invalid ของเซ็ตที่ชนิดการจดตอนจดต่างจากท่าปัจจุบัน → track_type_changed · ตรงกัน/ไม่รู้ = invalid", () => {
    const it1 = item({ display: { exercise_id: "ex", track_type: "weight_reps", load_mode: "external" } });
    expect(explainRejected(it1, () => ({ track_type: "duration", load_mode: "external" }))).toBe("track_type_changed");
    expect(explainRejected(it1, () => ({ track_type: "weight_reps", load_mode: "assisted" }))).toBe("track_type_changed");
    expect(explainRejected(it1, () => ({ track_type: "weight_reps", load_mode: "external" }))).toBe("invalid");
    expect(explainRejected(it1, () => undefined)).toBe("invalid");
    expect(explainRejected(item({ code: "limit_reached", display: it1.display }), () => ({ track_type: "duration", load_mode: "external" }))).toBe("limit_reached");
  });
});

describe("overlay: snapshot ทับด้วยคิว", () => {
  const op = (seq: number, over: Partial<OutboxOp>): OutboxOp => ({
    seq,
    v: 1,
    op_id: `o${seq}`,
    entity: "place",
    id: "p1",
    action: "upsert",
    data: {},
    client_updated_at: "2026-11-24T10:00:00Z",
    attempts: 0,
    next_attempt_at: 0,
    state: "pending",
    ...over,
  });
  const base = { id: "p1", name: "เดิม", map_url: "https://maps.app.goo.gl/x", has_sessions: true, last_used_at: null, archived_at: null, created_at: "", updated_at: "", client_updated_at: "" };

  it("upsert รวมช่อง (ช่องที่ไม่ส่งคงเดิม) · แถวใหม่ได้ค่าเริ่มต้น · delete เอาออก", () => {
    const rows = overlayPlaces([base], [op(1, { data: { name: "ใหม่" } }), op(2, { id: "p2", data: { name: "ยิม 2" } })]);
    expect(rows.find((r) => r.id === "p1")).toMatchObject({ name: "ใหม่", map_url: base.map_url, has_sessions: true });
    expect(rows.find((r) => r.id === "p2")).toMatchObject({ name: "ยิม 2", has_sessions: false, archived_at: null });
    expect(overlayPlaces([base], [op(1, { action: "delete", data: null })])).toEqual([]);
  });

  it("ท่าของฉันที่สร้างออฟไลน์แสดงได้ (ไม่มี has_history)", () => {
    const rows = overlayMyExercises([], [op(1, { entity: "exercise", id: "x", data: { name: "ยกถังน้ำ", track_type: "duration", category: "other" } })]);
    expect(rows[0]).toMatchObject({ id: "x", name: "ยกถังน้ำ", track_type: "duration", has_history: false });
  });
});
