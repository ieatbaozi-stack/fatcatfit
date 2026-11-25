// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOfflineUserId, deleteOfflineDb, getOfflineUserId, OFFLINE_USER_KEY, offlineDbName, requestPersistentStorage, setOfflineUserId } from "./offline-db";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

/** IDBFactory ปลอม: deleteDatabase ตอบ success/error/ไม่ตอบ (ถูกบล็อก) */
function fakeIdb(outcome: "success" | "error" | "blocked") {
  const deleted: string[] = [];
  const idb = {
    deleteDatabase(name: string) {
      deleted.push(name);
      const r: { onsuccess: null | (() => void); onerror: null | (() => void) } = { onsuccess: null, onerror: null };
      setTimeout(() => {
        if (outcome === "success") r.onsuccess?.();
        if (outcome === "error") r.onerror?.();
      }, 0);
      return r;
    },
  } as unknown as IDBFactory;
  return { idb, deleted };
}

describe("ชื่อฐาน + ผู้ใช้ของเครื่อง", () => {
  it("ฐานต่อผู้ใช้ fcf:v1:<user_id>", () => {
    expect(offlineDbName("abc")).toBe("fcf:v1:abc");
  });

  it("จำ/อ่าน/ลืม user id · รูปแปลก = ไม่เก็บ/ไม่เชื่อ", () => {
    setOfflineUserId("Ab_12-x");
    expect(getOfflineUserId()).toBe("Ab_12-x");
    clearOfflineUserId();
    expect(getOfflineUserId()).toBeNull();
    setOfflineUserId("../evil");
    expect(getOfflineUserId()).toBeNull();
    localStorage.setItem(OFFLINE_USER_KEY, "a b");
    expect(getOfflineUserId()).toBeNull();
  });

  it("localStorage พัง → ไม่โยน", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getOfflineUserId()).toBeNull();
  });
});

describe("deleteOfflineDb", () => {
  it("ลบฐานของคนนั้นคนเดียว", async () => {
    const f = fakeIdb("success");
    expect(await deleteOfflineDb("u1", { idb: f.idb })).toBe(true);
    expect(f.deleted).toEqual(["fcf:v1:u1"]);
  });

  it("ถูกบล็อก (แท็บอื่นเปิดค้าง) → ไม่รอเกิน timeout · error → false ไม่โยน", async () => {
    expect(await deleteOfflineDb("u1", { idb: fakeIdb("blocked").idb, timeoutMs: 20 })).toBe(false);
    expect(await deleteOfflineDb("u1", { idb: fakeIdb("error").idb })).toBe(false);
  });
});

describe("requestPersistentStorage (ของแถม ไม่การันตี)", () => {
  it("ไม่มี API → false", async () => {
    expect(await requestPersistentStorage({} as Navigator)).toBe(false);
    expect(await requestPersistentStorage(undefined)).toBe(false);
  });

  it("persisted แล้ว → true ไม่ขอซ้ำ · ยังไม่ → คืนผลของ persist() · โยน → false", async () => {
    const persist = vi.fn(async () => false);
    expect(await requestPersistentStorage({ storage: { persisted: async () => true, persist } } as unknown as Navigator)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(await requestPersistentStorage({ storage: { persisted: async () => false, persist } } as unknown as Navigator)).toBe(false);
    expect(await requestPersistentStorage({ storage: { persist: async () => { throw new Error("x"); } } } as unknown as Navigator)).toBe(false);
  });
});
