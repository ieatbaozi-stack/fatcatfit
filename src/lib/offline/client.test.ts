// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  applySessionChange,
  checkActiveSession,
  closeOffline,
  deleteEntity,
  discardRejected,
  flushBeforeSignOut,
  getLocalView,
  getSyncStatus,
  initOffline,
  listRejected,
  refreshSnapshot,
  resumeOfflineFromDevice,
  syncNow,
  writeEntity,
  type OfflineDeps,
} from "./client";
import { addExercise, addSet, checkSet, EMPTY_SET_VALUES, newSessionDraft } from "./session";
import { createMemoryStore, type OfflineStore } from "./store";
import { createMockServer } from "./testing/mock-server";
import { getOfflineUserId } from "@/pwa/offline-db";

// API ให้หน้าจอ (งานข้อ 3) — ใช้ store ในหน่วยความจำแทน IndexedDB · "ปิดแท็บแล้วเปิดใหม่" = closeOffline + initOffline กับ store ตัวเดิม

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER = "user_a";

function setup(store: OfflineStore = createMemoryStore(), server = createMockServer(), clock = { t: Date.parse("2026-11-24T10:00:00Z") }) {
  const timers: { fn: () => void; ms: number }[] = [];
  const deps: Partial<OfflineDeps> = {
    openStore: async () => store,
    fetch: server.fetch,
    now: () => clock.t,
    random: () => 0.5,
    setTimeout: (fn, ms) => {
      const h = { fn, ms };
      timers.push(h);
      return h;
    },
    clearTimeout: (h) => {
      const i = timers.indexOf(h as never);
      if (i >= 0) timers.splice(i, 1);
    },
    listen: false,
    persist: async () => true,
  };
  return { store, server, deps, timers, clock };
}

/** ให้งานเบื้องหลัง (kick ตอนเปิด) จบก่อน */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

afterEach(() => {
  closeOffline();
  localStorage.clear();
});

describe("เขียนผ่านคิว", () => {
  it("ยังไม่ init → not_ready (ไม่ fetch เอง)", async () => {
    expect(await writeEntity("place", U(1), { name: "a" })).toEqual({ ok: false, reason: "not_ready" });
  });

  it("place/exercise ของ R2 เข้าคิวได้ · มุมมองทับ snapshot ทันที · ส่งแล้วขึ้นเซิร์ฟเวอร์", async () => {
    const h = setup();
    await initOffline(USER, h.deps);
    await settle();
    expect(getOfflineUserId()).toBe(USER);
    h.server.next("offline");
    expect(await writeEntity("place", U(1), { name: "ยิมใหม่" }, { create: true })).toEqual({ ok: true, result: "queued" });
    expect(await writeEntity("exercise", U(2), { name: "ยกถังน้ำ", track_type: "duration", category: "other" }, { create: true })).toMatchObject({ ok: true });
    expect(getLocalView().places.map((p) => p.name)).toEqual(["ยิมใหม่"]);
    expect(getLocalView().myExercises.map((e) => e.name)).toEqual(["ยกถังน้ำ"]);
    expect(getSyncStatus().pending).toBe(2);
    await syncNow(); // offline
    expect(getSyncStatus().phase).toBe("retry_wait");
    await syncNow(); // online
    expect(h.server.count("place")).toBe(1);
    expect(getSyncStatus().pending).toBe(0);
  });

  it("สร้างแล้วลบก่อนส่ง → cancelled ไม่มีอะไรถูกส่ง", async () => {
    const h = setup();
    await initOffline(USER, h.deps);
    await settle();
    await writeEntity("exercise", U(3), { name: "x", track_type: "reps_only", category: "other" }, { create: true });
    expect(await deleteEntity("exercise", U(3))).toEqual({ ok: true, result: "cancelled" });
    await syncNow();
    expect(h.server.allOps()).toEqual([]);
  });

  it("พื้นที่เต็ม (QuotaExceededError) → storage_full + สถานะบอก · ไม่โยน", async () => {
    const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const h = setup(createMemoryStore({ failWrites: () => quota }));
    await initOffline(USER, h.deps);
    await settle();
    expect(await writeEntity("place", U(1), { name: "a" })).toEqual({ ok: false, reason: "storage_full" });
    expect(getSyncStatus().storageError).toBe("quota");
  });

  it("IndexedDB เปิดไม่ได้ → ทำงานต่อในหน่วยความจำ + memoryOnly", async () => {
    const h = setup();
    await initOffline(USER, { ...h.deps, openStore: async () => Promise.reject(new Error("blocked")) });
    await settle();
    expect(getLocalView().memoryOnly).toBe(true);
    expect(getSyncStatus().storageError).toBe("unavailable");
    expect((await writeEntity("place", U(1), { name: "a" })).ok).toBe(true);
  });
});

describe("ร่างเซสชัน: ปิดแอปแล้วกลับมา (เกณฑ์ 10 ส่วน unit)", () => {
  it("จดออฟไลน์ → ปิด → เปิดใหม่ร่างอยู่ครบ + คิวอยู่ → ออนไลน์ ขึ้นเซิร์ฟเวอร์ครั้งเดียว", async () => {
    const h = setup();
    h.server.next("offline", "offline"); // kick ตอนเปิด + bootstrap
    await initOffline(USER, h.deps);
    await settle();
    await writeEntity("place", U(2), { name: "ยิม" }, { create: true });
    let d = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: h.clock.t, timeZone: "Asia/Bangkok" });
    d = addExercise(d, { id: U(10), exercise_id: U(99), exercise_name: "Bench", exercise_name_th: null, track_type: "weight_reps", load_mode: "external" }, 0).draft!;
    for (let i = 0; i < 2; i++) {
      d = addSet(d, U(10), { id: U(20 + i), values: { ...EMPTY_SET_VALUES, weight_input: 20, weight_unit: "kg", reps: 10 } }, 0).draft!;
      const c = checkSet(d, U(10), U(20 + i), h.clock.t);
      expect((await applySessionChange(c)).ok).toBe(true);
      d = c.draft!;
    }
    expect(getSyncStatus().pending).toBe(5); // place + session + ท่า + 2 เซ็ต
    closeOffline(); // ปิดแท็บ
    expect(getLocalView().ready).toBe(false);

    h.server.next("offline", "offline");
    await resumeOfflineFromDevice(h.deps); // เปิดใหม่ตอนออฟไลน์ (จำ user ไว้ในเครื่อง)
    await settle();
    expect(getLocalView().activeSession?.exercises[0].sets.map((s) => s.queued)).toEqual([true, true]);
    expect(getSyncStatus().pending).toBe(5);
    expect(await checkActiveSession()).toEqual({ kind: "resume" });

    await syncNow(); // ออนไลน์
    await syncNow();
    expect([h.server.count("workout_session"), h.server.count("session_exercise"), h.server.count("set_record")]).toEqual([1, 1, 2]);
    expect(h.server.allOps().filter((o) => o.entity === "set_record")).toHaveLength(2);
  });

  it("> 24 ชม. → จบให้เองที่เวลาเซ็ตสุดท้าย + คืน auto_end (ไว้ toast)", async () => {
    const h = setup();
    await initOffline(USER, h.deps);
    await settle();
    await writeEntity("place", U(2), { name: "ยิม" });
    let d = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: h.clock.t, timeZone: "UTC" });
    d = addExercise(d, { id: U(10), exercise_id: U(99), exercise_name: "Bench", exercise_name_th: null, track_type: "weight_reps", load_mode: "external" }, 0).draft!;
    d = addSet(d, U(10), { id: U(20), values: { ...EMPTY_SET_VALUES, weight_input: 20, weight_unit: "kg", reps: 10 } }, 0).draft!;
    await applySessionChange(checkSet(d, U(10), U(20), h.clock.t + 60_000));
    h.clock.t += 30 * 60 * 60 * 1000;
    expect(await checkActiveSession()).toEqual({ kind: "auto_end", endAt: Date.parse("2026-11-24T10:01:00Z") });
    expect(getLocalView().activeSession).toBeNull();
    await syncNow();
    expect(h.server.row("workout_session", U(1))?.data.ended_at).toBe("2026-11-24T10:01:00.000Z");
  });
});

describe("ส่งไม่ผ่าน", () => {
  it("แสดงเป็นกลุ่ม (ลูกตามพ่อแม่) · ทิ้งแล้วหายจากร่าง + ดึง snapshot ใหม่ + แถบหาย", async () => {
    const h = setup();
    await initOffline(USER, h.deps);
    await settle();
    await writeEntity("place", U(2), { name: "ยิม" });
    h.server.setReject((op) => (op.entity === "session_exercise" ? "limit_reached" : null));
    let d = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: h.clock.t, timeZone: "UTC" });
    d = addExercise(d, { id: U(10), exercise_id: U(99), exercise_name: "Bench", exercise_name_th: null, track_type: "weight_reps", load_mode: "external" }, 0).draft!;
    d = addSet(d, U(10), { id: U(20), values: { ...EMPTY_SET_VALUES, weight_input: 20, weight_unit: "kg", reps: 10 } }, 0).draft!;
    await applySessionChange(checkSet(d, U(10), U(20), h.clock.t));
    await syncNow();
    expect(getSyncStatus().rejected).toBe(2);
    const groups = await listRejected();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reason: "limit_reached", item: { entity: "session_exercise", display: { exercise_name: "Bench" } } });
    expect(groups[0].children.map((c) => c.code)).toEqual(["parent_missing"]);
    const before = h.server.bootstrapCalls;
    await discardRejected(groups[0].opIds);
    expect(getSyncStatus().rejected).toBe(0);
    expect(getLocalView().activeSession?.exercises).toEqual([]);
    expect(h.server.bootstrapCalls).toBeGreaterThan(before);
  });

  it("เซ็ตที่ชนิดการจดไม่ตรงกับท่าปัจจุบัน + invalid → track_type_changed", async () => {
    const h = setup();
    await initOffline(USER, h.deps);
    await settle();
    await writeEntity("exercise", U(99), { name: "ท่า", track_type: "duration", load_mode: "external", category: "other" });
    await writeEntity("place", U(2), { name: "ยิม" });
    await syncNow();
    await refreshSnapshot();
    h.server.setReject((op) => (op.entity === "set_record" ? "invalid" : null));
    let d = newSessionDraft({ id: U(1), placeId: U(2), placeName: "ยิม", now: h.clock.t, timeZone: "UTC" });
    d = addExercise(d, { id: U(10), exercise_id: U(99), exercise_name: "ท่า", exercise_name_th: null, track_type: "weight_reps", load_mode: "external" }, 0).draft!;
    d = addSet(d, U(10), { id: U(20), values: { ...EMPTY_SET_VALUES, weight_input: 20, weight_unit: "kg", reps: 10 } }, 0).draft!;
    await applySessionChange(checkSet(d, U(10), U(20), h.clock.t));
    await syncNow();
    expect((await listRejected())[0].reason).toBe("track_type_changed");
  });
});

describe("401 / ออกจากระบบ (เกณฑ์ 11 ส่วน unit)", () => {
  it("401 → คิวอยู่ครบ สถานะ auth_required · initOffline ซ้ำหลังเข้าสู่ระบบ → ส่งครบ", async () => {
    const h = setup();
    await initOffline(USER, h.deps);
    await settle();
    h.server.next(401);
    await writeEntity("place", U(1), { name: "a" });
    await syncNow();
    expect(getSyncStatus()).toMatchObject({ phase: "auth_required", pending: 1 });
    await initOffline(USER, h.deps); // AuthGate เห็น ready อีกครั้ง
    await settle();
    expect(h.server.count("place")).toBe(1);
  });

  it("flushBeforeSignOut: ส่งได้ → clean · ส่งไม่ได้ → คืนผลภายในเวลา พร้อม N (รวมส่งไม่ผ่าน)", async () => {
    const h = setup();
    await initOffline(USER, h.deps);
    await settle();
    await writeEntity("place", U(1), { name: "a" });
    expect(await flushBeforeSignOut()).toMatchObject({ clean: true, pending: 0, outcome: "drained" });

    h.server.setReject((op) => (op.id === U(5) ? "invalid" : null));
    await writeEntity("place", U(5), { name: "b" });
    await syncNow();
    h.server.next("offline");
    await writeEntity("place", U(6), { name: "c" });
    const r = await flushBeforeSignOut();
    expect(r).toMatchObject({ clean: false, pending: 2, rejected: 1 });
  });

  it("flushBeforeSignOut หมดเวลา (เซิร์ฟเวอร์ค้าง) → timeout ไม่ค้าง", async () => {
    const h = setup();
    let release: () => void = () => {};
    const hanging = (async () => {
      await new Promise<void>((r) => (release = r));
      throw new TypeError("aborted");
    }) as unknown as typeof fetch;
    await initOffline(USER, { ...h.deps, fetch: hanging, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (x) => clearTimeout(x as never) });
    await writeEntity("place", U(1), { name: "a" });
    const r = await flushBeforeSignOut(50);
    expect(r).toMatchObject({ clean: false, pending: 1, outcome: "timeout" });
    release();
  });
});
