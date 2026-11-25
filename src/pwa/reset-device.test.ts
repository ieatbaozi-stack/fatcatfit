// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_HINT_KEY, KNOWN_DEVICE_KEY, getAuthHint, isKnownDevice, markKnownDevice, setAuthHint } from "./auth-hint";
import { USER_RESET_MESSAGE } from "./messages";
import { getOfflineUserId, setOfflineUserId } from "./offline-db";
import { resetDeviceAfterSignOut } from "./reset-device";
import { CACHE_NAMES } from "./strategy";

/** SW ปลอมที่ตอบกลับทาง port เหมือน sw.ts */
function fakeWorker(reply = true) {
  const received: unknown[] = [];
  const worker = {
    postMessage: (data: unknown, transfer?: Transferable[]) => {
      received.push(data);
      const port = transfer?.[0] as MessagePort | undefined;
      if (reply) port?.postMessage({ type: USER_RESET_MESSAGE, ok: true });
    },
  } as unknown as ServiceWorker;
  return { worker, received };
}

function fakeCaches(initial: string[]) {
  const names = new Set(initial);
  return { names, keys: async () => [...names], delete: async (n: string) => names.delete(n) };
}

beforeEach(() => {
  setAuthHint("ready");
  markKnownDevice();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("resetDeviceAfterSignOut", () => {
  it("ออกจากระบบ: ล้าง cache หน้า + user-* และ fcf:auth · คง fcf:known-device และ asset", async () => {
    const storage = fakeCaches([CACHE_NAMES.pages, CACHE_NAMES.pagesStaging, CACHE_NAMES.assets, "user-1"]);
    vi.stubGlobal("caches", storage);
    await resetDeviceAfterSignOut({ accountDeleted: false }, { getRegistration: async () => undefined });
    expect([...storage.names]).toEqual([CACHE_NAMES.assets]);
    expect(getAuthHint()).toBeNull();
    expect(isKnownDevice()).toBe(true);
  });

  it("ลบบัญชี: ล้าง fcf:known-device ด้วย", async () => {
    vi.stubGlobal("caches", fakeCaches([CACHE_NAMES.pages]));
    await resetDeviceAfterSignOut({ accountDeleted: true }, { getRegistration: async () => undefined });
    expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(localStorage.getItem(KNOWN_DEVICE_KEY)).toBeNull();
  });

  it("บอก SW ทุกตัว (installing/waiting/active) ให้ทิ้งการดึงที่ค้าง ก่อนล้าง cache", async () => {
    const order: string[] = [];
    const a = fakeWorker();
    const w = fakeWorker();
    const wrap = (name: string, fw: ReturnType<typeof fakeWorker>) =>
      ({
        postMessage: (d: unknown, t?: Transferable[]) => {
          order.push(name);
          fw.worker.postMessage(d, t as Transferable[]);
        },
      }) as unknown as ServiceWorker;
    await resetDeviceAfterSignOut(
      { accountDeleted: false },
      {
        getRegistration: async () => ({ active: wrap("active", a), waiting: wrap("waiting", w), installing: null }),
        clearCaches: async () => {
          order.push("clear");
        },
      },
    );
    expect(a.received).toEqual([{ type: USER_RESET_MESSAGE }]);
    expect(w.received).toEqual([{ type: USER_RESET_MESSAGE }]);
    expect(order[order.length - 1]).toBe("clear");
    expect(order.slice(0, 2).sort()).toEqual(["active", "waiting"]);
  });

  it("SW ไม่ตอบ → รอไม่เกิน timeout แล้วล้างต่อ", async () => {
    const silent = fakeWorker(false);
    const clear = vi.fn(async () => {});
    const started = Date.now();
    await resetDeviceAfterSignOut(
      { accountDeleted: false },
      { getRegistration: async () => ({ active: silent.worker }), clearCaches: clear, timeoutMs: 30 },
    );
    expect(clear).toHaveBeenCalledOnce();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("ไม่โยน error แม้ทุกขั้นล้ม (ไม่มี SW, Cache Storage พัง, localStorage พัง)", async () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(
      resetDeviceAfterSignOut(
        { accountDeleted: true },
        {
          getRegistration: async () => {
            throw new Error("no sw");
          },
          clearCaches: async () => {
            throw new Error("cache broken");
          },
        },
      ),
    ).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it("R3: ลบฐาน IndexedDB ของผู้ใช้ที่จำไว้ในเครื่อง + ลืม user id · ไม่มีผู้ใช้ = ไม่ลบอะไร", async () => {
    setOfflineUserId("user_a");
    const deleteDb = vi.fn(async () => true);
    await resetDeviceAfterSignOut({ accountDeleted: false }, { getRegistration: async () => undefined, clearCaches: async () => {}, deleteDb });
    expect(deleteDb).toHaveBeenCalledWith("user_a");
    expect(getOfflineUserId()).toBeNull();
    deleteDb.mockClear();
    await resetDeviceAfterSignOut({ accountDeleted: false }, { getRegistration: async () => undefined, clearCaches: async () => {}, deleteDb });
    expect(deleteDb).not.toHaveBeenCalled();
  });

  it("R3: userId ที่ส่งมาชนะค่าที่จำไว้ · ลบฐานล้มไม่โยน", async () => {
    setOfflineUserId("user_a");
    const deleteDb = vi.fn(async () => {
      throw new Error("blocked");
    });
    await expect(
      resetDeviceAfterSignOut({ accountDeleted: true, userId: "user_b" }, { getRegistration: async () => undefined, clearCaches: async () => {}, deleteDb }),
    ).resolves.toBeUndefined();
    expect(deleteDb).toHaveBeenCalledWith("user_b");
  });

  it("ค่าเริ่มต้น: ไม่มี navigator.serviceWorker และไม่มี caches → ไม่โยน และล้าง hint", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(resetDeviceAfterSignOut({ accountDeleted: false })).resolves.toBeUndefined();
    expect(getAuthHint()).toBeNull();
  });

  it("SEC-M2: ล้าง sessionStorage คีย์ fcf:* ทั้งหมด (fcf:flash, fcf:edit-exercise, fcf:auto-open) โดยคงคีย์อื่น", async () => {
    sessionStorage.setItem("fcf:flash", '{"key":"saved"}');
    sessionStorage.setItem("fcf:edit-exercise", "00000000-0000-4000-8000-000000000001");
    sessionStorage.setItem("fcf:auto-open", "1");
    sessionStorage.setItem("other:key", "keep");
    await resetDeviceAfterSignOut({ accountDeleted: false }, { getRegistration: async () => undefined, clearCaches: async () => {} });
    expect(sessionStorage.getItem("fcf:flash")).toBeNull();
    expect(sessionStorage.getItem("fcf:edit-exercise")).toBeNull();
    expect(sessionStorage.getItem("fcf:auto-open")).toBeNull();
    expect(sessionStorage.getItem("other:key")).toBe("keep");
  });
});
