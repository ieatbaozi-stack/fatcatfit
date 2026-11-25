import { describe, expect, it } from "vitest";
import { backoffMs, BACKOFF_MAX_MS, descendantOps, distinctRows, normalizeOp, planEnqueue, selectBatch } from "./queue";
import { createMemoryStore } from "./store";
import type { OutboxOp, WriteIntent } from "./types";

const T = "2026-11-24T10:00:00.000Z";
let n = 0;
const ctx = (known: string[] = []) => ({ knownToServer: (id: string) => known.includes(id), opId: `op-${++n}`, now: 1000 });
const up = (entity: WriteIntent["entity"], id: string, data: Record<string, unknown> = {}, create = false): WriteIntent => ({
  entity,
  id,
  action: "upsert",
  data,
  client_updated_at: T,
  ...(create ? { create: true } : {}),
});
const del = (entity: WriteIntent["entity"], id: string): WriteIntent => ({ entity, id, action: "delete", data: null, client_updated_at: T });

async function run(writes: WriteIntent[], known: string[] = []) {
  const s = createMemoryStore();
  for (const w of writes) await s.enqueue(w, { opId: `op-${++n}`, now: 1000, knownInSnapshot: (id) => known.includes(id) });
  return s;
}

describe("planEnqueue — รวมรายการ (ADR 0004 ข้อ 3)", () => {
  it("เขียนแถวเดิมซ้ำขณะ pending → แทนที่ คง seq เดิม (พ่อแม่ยังมาก่อนลูก)", async () => {
    const s = await run([up("workout_session", "s1", { a: 1 }, true), up("session_exercise", "e1", { session_id: "s1" }, true), up("workout_session", "s1", { a: 2 })]);
    const ops = await s.outboxAll();
    expect(ops.map((o) => o.id)).toEqual(["s1", "e1"]);
    expect(ops[0].data).toEqual({ a: 2 });
    expect(ops[0].created).toBe(true);
  });

  it("รายการเดิม inflight → ต่อท้ายรายการใหม่", async () => {
    const s = await run([up("place", "p1", { name: "a" })]);
    await s.markInflight([1], 1000);
    await s.enqueue(up("place", "p1", { name: "b" }), { opId: "x", now: 1, knownInSnapshot: () => false });
    const ops = await s.outboxAll();
    expect(ops.map((o) => [o.seq, o.state, o.data?.name])).toEqual([
      [1, "inflight", "a"],
      [2, "pending", "b"],
    ]);
  });

  it("upsert หลัง delete ที่ค้าง → ต่อท้าย (ลบชนะ ไม่ย้อนการลบด้วย id เดิม)", async () => {
    const s = await run([del("place", "p1"), up("place", "p1", { name: "x" })], ["p1"]);
    expect((await s.outboxAll()).map((o) => o.action)).toEqual(["delete", "upsert"]);
  });
});

describe("planEnqueue — สร้างแล้วลบก่อนส่ง", () => {
  it("upsert created ที่ยังไม่เคยส่ง + delete → คิวว่าง ไม่ส่งอะไร", async () => {
    const s = await run([up("exercise", "x1", { name: "a" }, true), del("exercise", "x1")]);
    expect(await s.outboxAll()).toEqual([]);
  });

  it("ลบเซสชันที่ยังไม่เคยส่ง → เอาลูกหลาน (ท่าในเซสชัน + เซ็ต) ออกด้วย", async () => {
    const s = await run([
      up("workout_session", "s1", {}, true),
      up("session_exercise", "e1", { session_id: "s1" }, true),
      up("set_record", "r1", { session_exercise_id: "e1" }, true),
      up("set_record", "r2", { session_exercise_id: "e1" }, true),
      up("place", "p9", { name: "อื่น" }),
      del("workout_session", "s1"),
    ]);
    expect((await s.outboxAll()).map((o) => o.id)).toEqual(["p9"]);
  });

  it("ลบท่าในเซสชันที่ยังไม่เคยส่ง → เซ็ตของท่านั้นออกด้วย เซสชันอยู่", async () => {
    const s = await run([
      up("workout_session", "s1", {}, true),
      up("session_exercise", "e1", { session_id: "s1" }, true),
      up("set_record", "r1", { session_exercise_id: "e1" }, true),
      del("session_exercise", "e1"),
    ]);
    expect((await s.outboxAll()).map((o) => o.id)).toEqual(["s1"]);
  });

  it("เซิร์ฟเวอร์รู้จักแถวแล้ว (มีใน snapshot) → ไม่ created · delete แทนที่ upsert", async () => {
    const s = await run([up("place", "p1", { name: "a" }, true), del("place", "p1")], ["p1"]);
    const ops = await s.outboxAll();
    expect(ops).toHaveLength(1);
    expect(ops[0].action).toBe("delete");
    expect(ops[0].created).toBeFalsy();
  });

  it("เคยส่งแล้ว (attempts > 0 — อาจ apply แล้วแต่คำตอบหาย) → ต้องส่ง delete", async () => {
    const s = await run([up("exercise", "x1", { name: "a" }, true)]);
    await s.markInflight([1], 1000);
    await s.settle({ remove: [], reject: [], retry: [{ seq: 1, next_attempt_at: 0 }] });
    await s.enqueue(del("exercise", "x1"), { opId: "d", now: 1, knownInSnapshot: () => false });
    const ops = await s.outboxAll();
    expect(ops.map((o) => [o.action, o.attempts])).toEqual([["delete", 1]]);
  });

  it("id ที่เคยถูกส่งไปแล้ว (หายจากคิว) แม้ผู้เรียกบอก create ก็ไม่ created", async () => {
    const s = await run([up("place", "p1", { name: "a" }, true)]);
    await s.markInflight([1], 1000);
    await s.settle({ remove: [1], reject: [], retry: [] });
    await s.enqueue(up("place", "p1", { name: "b" }, true), { opId: "y", now: 1, knownInSnapshot: () => false });
    await s.enqueue(del("place", "p1"), { opId: "z", now: 1, knownInSnapshot: () => false });
    expect((await s.outboxAll()).map((o) => o.action)).toEqual(["delete"]);
  });

  it("รายการรุ่นเก่าที่ไม่มีช่อง created ถือว่า false (รูปแบบ v:1 อ่านได้)", () => {
    const old = { seq: 3, v: 1, op_id: "o", entity: "place", id: "p", action: "upsert", data: { name: "a" }, client_updated_at: T, attempts: 0, next_attempt_at: 0, state: "pending" };
    const op = normalizeOp(old)!;
    expect(op.created).toBeUndefined();
    const plan = planEnqueue([op], del("place", "p"), ctx());
    expect(plan.result).toBe("merged");
    expect(plan.put[0].action).toBe("delete");
  });
});

describe("selectBatch / backoff", () => {
  const mk = (seq: number, over: Partial<OutboxOp> = {}): OutboxOp => ({
    seq,
    v: 1,
    op_id: `o${seq}`,
    entity: "place",
    id: `p${seq}`,
    action: "upsert",
    data: {},
    client_updated_at: T,
    attempts: 0,
    next_attempt_at: 0,
    state: "pending",
    ...over,
  });

  it("ส่งตาม seq ไม่เกิน 50 ต่อชุด", () => {
    const ops = Array.from({ length: 120 }, (_, i) => mk(120 - i));
    const b = selectBatch(ops, 0);
    expect(b).toHaveLength(50);
    expect(b.map((o) => o.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("หัวคิวยังรอหน่วง → ไม่ส่งทั้งคิว (รายการใหม่ไม่แซง)", () => {
    expect(selectBatch([mk(1, { next_attempt_at: 5000 }), mk(2)], 1000)).toEqual([]);
    expect(selectBatch([mk(1, { next_attempt_at: 5000 }), mk(2)], 5000)).toHaveLength(2);
  });

  it("มีชุดกำลังส่งอยู่ → ไม่ส่งชุดซ้อน", () => {
    expect(selectBatch([mk(1, { state: "inflight" }), mk(2)], 0)).toEqual([]);
  });

  it("หน่วง min(2^n วิ, 5 นาที) ± 20%", () => {
    expect(backoffMs(1, 0.5)).toBe(2000);
    expect(backoffMs(3, 0)).toBe(6400);
    expect(backoffMs(3, 0.999999)).toBeCloseTo(9600, -1);
    expect(backoffMs(30, 0.5)).toBe(BACKOFF_MAX_MS);
  });

  it("distinctRows นับแถวไม่ซ้ำ", () => {
    expect(distinctRows([mk(1, { id: "a" }), mk(2, { id: "a" }), mk(3, { id: "b" })])).toBe(2);
  });

  it("descendantOps หาลูกหลานจาก data", () => {
    const ops = [mk(1, { entity: "session_exercise", id: "e", data: { session_id: "s" } }), mk(2, { entity: "set_record", id: "r", data: { session_exercise_id: "e" } })];
    expect(descendantOps(ops, "workout_session", "s").map((o) => o.id)).toEqual(["e", "r"]);
  });
});
