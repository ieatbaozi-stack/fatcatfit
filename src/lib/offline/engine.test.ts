import { describe, expect, it } from "vitest";
import { createSyncEngine } from "./engine";
import { createMemoryStore } from "./store";
import { createMockServer } from "./testing/mock-server";
import type { WriteIntent } from "./types";

// เกณฑ์ 4, 10, 11 ส่วนที่ทดสอบได้โดยไม่มีเบราว์เซอร์: ส่งซ้ำไม่ซ้ำแถว · ลำดับ · ล้มกลางทาง · 401 · ปฏิเสธ · สร้างแล้วลบ

function harness() {
  const server = createMockServer();
  const store = createMemoryStore();
  let clock = Date.parse("2026-11-24T10:00:00Z");
  const timers: { fn: () => void; ms: number }[] = [];
  let applied = 0;
  const engine = createSyncEngine({
    store,
    fetch: server.fetch,
    now: () => clock,
    random: () => 0.5,
    setTimeout: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return t;
    },
    clearTimeout: (h) => {
      const i = timers.indexOf(h as never);
      if (i >= 0) timers.splice(i, 1);
    },
    onApplied: () => {
      applied += 1;
    },
  });
  let tick = 0;
  const write = (w: Omit<WriteIntent, "client_updated_at">) =>
    store.enqueue({ ...w, client_updated_at: new Date(clock + ++tick).toISOString() }, { opId: crypto.randomUUID(), now: clock, knownInSnapshot: () => false });
  return {
    server,
    store,
    engine,
    write,
    advance: (ms: number) => {
      clock += ms;
    },
    get applied() {
      return applied;
    },
    timers,
  };
}

/** ชุดตามเกณฑ์ 4: session + 2 ท่า + 5 เซ็ต */
async function writeWorkout(h: ReturnType<typeof harness>) {
  await h.write({ entity: "place", id: "p", action: "upsert", data: { name: "ยิม" }, create: true });
  await h.write({ entity: "workout_session", id: "s", action: "upsert", data: { place_id: "p" }, create: true });
  for (const e of ["e1", "e2"]) await h.write({ entity: "session_exercise", id: e, action: "upsert", data: { session_id: "s" }, create: true });
  for (let i = 0; i < 5; i++) {
    await h.write({ entity: "set_record", id: `r${i}`, action: "upsert", data: { session_exercise_id: i < 3 ? "e1" : "e2", reps: 10 }, create: true });
  }
}

const counts = (h: ReturnType<typeof harness>) => [h.server.count("workout_session"), h.server.count("session_exercise"), h.server.count("set_record")];

describe("ส่งซ้ำไม่ซ้ำแถว (เกณฑ์ 4)", () => {
  it("ส่งครบรอบเดียว → 1/2/5 แถว คิวว่าง · พ่อแม่มาก่อนลูกในคำขอ", async () => {
    const h = harness();
    await writeWorkout(h);
    expect(await h.engine.flush()).toBe("drained");
    expect(counts(h)).toEqual([1, 2, 5]);
    expect(await h.store.outboxAll()).toEqual([]);
    expect(h.server.allOps().map((o) => o.id)).toEqual(["p", "s", "e1", "e2", "r0", "r1", "r2", "r3", "r4"]);
    expect(h.engine.getStatus().lastDrainedAt).not.toBeNull();
    expect(h.applied).toBe(1);
  });

  it("คำตอบหาย (เซิร์ฟเวอร์ทำแล้ว) 2 ครั้ง แล้วส่งซ้ำ → ยัง 1/2/5 · ผลครั้งหลัง applied/stale", async () => {
    const h = harness();
    await writeWorkout(h);
    h.server.next("drop");
    expect(await h.engine.flush()).toBe("pending");
    expect(h.engine.getStatus().phase).toBe("retry_wait");
    expect((await h.store.outboxAll()).length).toBe(9); // คิวยังอยู่ครบ ไม่ทิ้งเอง
    h.server.next("drop");
    await h.engine.kick();
    await h.engine.kick();
    expect(counts(h)).toEqual([1, 2, 5]);
    expect(h.server.requests).toHaveLength(3);
    expect(await h.store.outboxAll()).toEqual([]);
  });

  it("ตัดกลางชุด: เกิน 50 รายการ ชุดแรกผ่าน ชุดสองคำตอบหาย → ส่งซ้ำเฉพาะที่เหลือ ไม่ซ้ำแถว", async () => {
    const h = harness();
    await h.write({ entity: "place", id: "p", action: "upsert", data: { name: "ยิม" }, create: true });
    await h.write({ entity: "workout_session", id: "s", action: "upsert", data: { place_id: "p" }, create: true });
    await h.write({ entity: "session_exercise", id: "e", action: "upsert", data: { session_id: "s" }, create: true });
    for (let i = 0; i < 60; i++) await h.write({ entity: "set_record", id: `r${i}`, action: "upsert", data: { session_exercise_id: "e" }, create: true });
    h.server.next("ok", "drop");
    await h.engine.flush();
    expect(h.server.requests.map((r) => r.ops.length)).toEqual([50, 13]);
    expect((await h.store.outboxAll()).length).toBe(13);
    await h.engine.kick();
    expect(h.server.count("set_record")).toBe(60);
    expect(await h.store.outboxAll()).toEqual([]);
  });
});

describe("เน็ตหลุด / กลับมาออนไลน์", () => {
  it("fetch reject = ลองใหม่ (ไม่ใช่ปฏิเสธ) · หน่วงเพิ่มขึ้น · kick (online) ล้างหน่วงแล้วส่งทันที", async () => {
    const h = harness();
    await writeWorkout(h);
    h.server.next("offline", "offline");
    await h.engine.flush();
    const [a] = await h.store.outboxAll();
    expect(a.attempts).toBe(1);
    expect(a.next_attempt_at).toBeGreaterThan(Date.parse("2026-11-24T10:00:00Z"));
    expect(h.timers.some((t) => t.ms > 0)).toBe(true); // นัดลองใหม่
    // ยังไม่ถึงเวลา flush ธรรมดาไม่ส่ง
    expect(await h.engine.flush()).toBe("pending");
    expect(h.server.requests).toHaveLength(0);
    await h.engine.kick(); // offline อีกรอบ
    expect((await h.store.outboxAll())[0].attempts).toBe(2);
    await h.engine.kick(); // ออนไลน์แล้ว
    expect(counts(h)).toEqual([1, 2, 5]);
    expect((await h.store.rejectedAll()).length).toBe(0);
  });

  it("5xx / 429 = ลองใหม่ คิวอยู่ครบ", async () => {
    const h = harness();
    await writeWorkout(h);
    h.server.next(503, 429);
    await h.engine.kick();
    await h.engine.kick();
    expect((await h.store.outboxAll()).length).toBe(9);
    expect(h.engine.getStatus().pending).toBe(9);
    await h.engine.kick();
    expect(counts(h)).toEqual([1, 2, 5]);
  });

  it("แท็บปิดกลางคำขอ (inflight ค้าง) → recoverInflight แล้วส่งซ้ำได้ ไม่ซ้ำแถว", async () => {
    const h = harness();
    await writeWorkout(h);
    await h.store.markInflight([1, 2, 3], 0);
    expect(await h.engine.flush()).toBe("pending"); // มี inflight ค้าง = ไม่ส่งซ้อน
    await h.store.recoverInflight();
    await h.engine.flush();
    expect(counts(h)).toEqual([1, 2, 5]);
  });
});

describe("401 / 403 / 409", () => {
  it("401 → หยุด คิวอยู่ครบ · เขียนเพิ่มได้ · kick หลังเข้าสู่ระบบใหม่ส่งครบ", async () => {
    const h = harness();
    await writeWorkout(h);
    h.server.next(401);
    expect(await h.engine.flush()).toBe("auth_required");
    expect(h.engine.getStatus().phase).toBe("auth_required");
    expect((await h.store.outboxAll()).length).toBe(9);
    expect(await h.engine.flush()).toBe("auth_required"); // ไม่ยิงซ้ำเองจนกว่าจะ kick
    expect(h.server.requests).toHaveLength(1);
    await h.write({ entity: "set_record", id: "r9", action: "upsert", data: { session_exercise_id: "e1" }, create: true });
    await h.engine.kick();
    expect(counts(h)).toEqual([1, 2, 6]);
  });

  it("403 consent_required / 409 upgrade_required → blocked คิวอยู่", async () => {
    const h = harness();
    await writeWorkout(h);
    h.server.next(403);
    expect(await h.engine.flush()).toBe("blocked");
    expect(h.engine.getStatus().blockedReason).toBe("consent_required");
    h.server.next(409);
    expect(await h.engine.kick()).toBe("blocked");
    expect(h.engine.getStatus().blockedReason).toBe("upgrade_required");
    expect((await h.store.outboxAll()).length).toBe(9);
  });
});

describe("ปฏิเสธถาวร (เกณฑ์ 11)", () => {
  it("ย้ายไป rejected พร้อม code + display ไม่หายเงียบ · ที่เหลือส่งต่อ · นับแถวไม่ซ้ำ", async () => {
    const h = harness();
    await writeWorkout(h);
    h.server.setReject((op) => (op.id === "r2" ? "invalid" : null));
    await h.store.enqueue(
      { entity: "set_record", id: "r2", action: "upsert", data: { session_exercise_id: "e1", reps: 11 }, client_updated_at: "2026-11-24T10:00:01Z", display: { exercise_name: "Bench" } },
      { opId: "x", now: 0, knownInSnapshot: () => false },
    );
    await h.engine.flush();
    const rej = await h.store.rejectedAll();
    expect(rej).toHaveLength(1);
    expect(rej[0]).toMatchObject({ id: "r2", code: "invalid", data: { reps: 11 }, display: { exercise_name: "Bench" } });
    expect(counts(h)).toEqual([1, 2, 4]);
    expect(h.engine.getStatus()).toMatchObject({ pending: 0, rejected: 1, phase: "idle" });
  });

  it("ลูกของแถวที่ถูกปฏิเสธ → parent_missing จากเซิร์ฟเวอร์ ไปอยู่ rejected ด้วย", async () => {
    const h = harness();
    await writeWorkout(h);
    h.server.setReject((op) => (op.id === "e1" ? "limit_reached" : null));
    await h.engine.flush();
    const codes = (await h.store.rejectedAll()).map((r) => `${r.id}:${r.code}`).sort();
    expect(codes).toEqual(["e1:limit_reached", "r0:parent_missing", "r1:parent_missing", "r2:parent_missing"]);
  });

  it("คำตอบไม่มีผลของบางรายการ → รายการนั้นลองใหม่ (ไม่ถือว่าสำเร็จ)", async () => {
    const h = harness();
    await h.write({ entity: "place", id: "p", action: "upsert", data: { name: "a" } });
    const realFetch = h.server.fetch;
    const engine = createSyncEngine({
      store: h.store,
      fetch: (async () => ({ ok: true, status: 200, json: async () => ({ results: [], server_time: "" }) })) as unknown as typeof fetch,
      now: () => 0,
      random: () => 0.5,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    expect(await engine.flush()).toBe("pending");
    expect((await h.store.outboxAll())[0].last_error).toBe("no_result");
    void realFetch;
  });
});

describe("สร้างแล้วลบก่อนส่ง (เกณฑ์ 10)", () => {
  it("สร้างเซสชันพร้อมเซ็ตแล้วทิ้งก่อนส่ง → ไม่มีอะไรถูกส่ง", async () => {
    const h = harness();
    await writeWorkout(h);
    await h.write({ entity: "workout_session", id: "s", action: "delete", data: null });
    expect((await h.store.outboxAll()).map((o) => o.id)).toEqual(["p"]);
    await h.engine.flush();
    expect(h.server.allOps().map((o) => o.id)).toEqual(["p"]);
    expect(counts(h)).toEqual([0, 0, 0]);
  });

  it("ส่งแล้ว (คำตอบหาย) แล้วลบ → ส่ง delete · เซิร์ฟเวอร์ไม่เหลือแถว", async () => {
    const h = harness();
    await h.write({ entity: "exercise", id: "x", action: "upsert", data: { name: "ยกถังน้ำ" }, create: true });
    h.server.next("drop");
    await h.engine.flush();
    await h.write({ entity: "exercise", id: "x", action: "delete", data: null });
    await h.engine.kick();
    expect(h.server.count("exercise")).toBe(0);
    expect(h.server.allOps().map((o) => o.action)).toEqual(["upsert", "delete"]);
  });
});

describe("สถานะ", () => {
  it("N = แถวไม่ซ้ำ · oldestPendingAt จาก queued_at · syncing ระหว่างส่ง", async () => {
    const h = harness();
    await h.write({ entity: "place", id: "p", action: "upsert", data: { name: "a" } });
    await h.store.markInflight([1], 0);
    await h.write({ entity: "place", id: "p", action: "upsert", data: { name: "b" } });
    const s = await h.engine.refreshStatus();
    expect(s.pending).toBe(1);
    expect(s.oldestPendingAt).toBe(Date.parse("2026-11-24T10:00:00Z"));
    const seen: string[] = [];
    h.engine.subscribe((st) => seen.push(st.phase));
    await h.store.recoverInflight();
    await h.engine.flush();
    expect(seen).toContain("syncing");
    expect(h.engine.getStatus().phase).toBe("idle");
  });
});
