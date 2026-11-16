// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyThemePref, isThemePref, readThemePref, THEME_KEY, themeInitScript } from "./theme";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const brokenStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("readThemePref", () => {
  it("ไม่มีค่า/ค่าแปลก = ตามระบบ", () => {
    expect(readThemePref(memoryStorage())).toBe("system");
    expect(readThemePref(memoryStorage({ [THEME_KEY]: "neon" }))).toBe("system");
    expect(readThemePref(null)).toBe("system");
  });
  it("อ่านค่าที่จำไว้", () => {
    expect(readThemePref(memoryStorage({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(readThemePref(memoryStorage({ [THEME_KEY]: "light" }))).toBe("light");
  });
  it("storage ใช้ไม่ได้ก็ไม่ throw", () => {
    expect(readThemePref(brokenStorage)).toBe("system");
  });
  it("isThemePref", () => {
    expect(isThemePref("system")).toBe(true);
    expect(isThemePref("auto")).toBe(false);
  });
});

describe("applyThemePref", () => {
  it("dark/light ตั้ง data-theme และจำค่า", () => {
    const storage = memoryStorage();
    applyThemePref("dark", document.documentElement, storage);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(storage.getItem(THEME_KEY)).toBe("dark");
    applyThemePref("light", document.documentElement, storage);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
  it("system เอา data-theme ออกและลืมค่า", () => {
    const storage = memoryStorage({ [THEME_KEY]: "dark" });
    document.documentElement.setAttribute("data-theme", "dark");
    applyThemePref("system", document.documentElement, storage);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(storage.getItem(THEME_KEY)).toBeNull();
  });
  it("storage ใช้ไม่ได้ก็ยังสลับในหน้านี้ได้", () => {
    applyThemePref("dark", document.documentElement, brokenStorage);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("themeInitScript (รันก่อน paint)", () => {
  function run(stored: string | null) {
    localStorage.clear();
    if (stored !== null) localStorage.setItem(THEME_KEY, stored);
    new Function(themeInitScript)();
  }
  it("ตั้ง data-theme ตามที่จำไว้", () => {
    run("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("ไม่มีค่า = ไม่ตั้ง (ให้ media query ตามระบบ)", () => {
    run(null);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
  it("ค่าแปลกถูกเมิน", () => {
    run("neon");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
