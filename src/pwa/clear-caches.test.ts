import { describe, expect, it } from "vitest";
import { clearUserCaches } from "./clear-caches";
import { CACHE_NAMES } from "./strategy";

function fakeStorage(initial: string[]) {
  const names = new Set(initial);
  return {
    names,
    keys: async () => [...names],
    delete: async (n: string) => names.delete(n),
  };
}

describe("clearUserCaches — ออกจากระบบ", () => {
  it("ลบหน้า HTML และ user-* แต่คง asset และ precache", async () => {
    const precache = "serwist-precache-v2-https://fatcat.example/";
    const s = fakeStorage([CACHE_NAMES.pages, CACHE_NAMES.assets, precache, "user-abc", "user-def"]);
    const deleted = await clearUserCaches(s);
    expect(deleted.sort()).toEqual([CACHE_NAMES.pages, "user-abc", "user-def"].sort());
    expect([...s.names].sort()).toEqual([CACHE_NAMES.assets, precache].sort());
  });

  it("ไม่มี Cache Storage → ไม่ทำอะไร", async () => {
    expect(await clearUserCaches(undefined)).toEqual([]);
  });
});
