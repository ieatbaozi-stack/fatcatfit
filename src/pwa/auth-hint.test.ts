// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_HINT_KEY,
  KNOWN_DEVICE_KEY,
  clearAuthHint,
  clearKnownDevice,
  getAuthHint,
  isKnownDevice,
  markKnownDevice,
  setAuthHint,
} from "./auth-hint";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("auth hint (fcf:auth)", () => {
  it("ตั้ง/อ่าน/ล้าง", () => {
    expect(getAuthHint()).toBeNull();
    setAuthHint("ready");
    expect(localStorage.getItem(AUTH_HINT_KEY)).toBe("ready");
    expect(getAuthHint()).toBe("ready");
    clearAuthHint();
    expect(getAuthHint()).toBeNull();
    expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it("ค่าแปลกใน storage = ไม่มี hint", () => {
    localStorage.setItem(AUTH_HINT_KEY, "admin");
    expect(getAuthHint()).toBeNull();
  });

  it("ไม่รับค่าอื่นนอกจาก ready (กันเรียกผิดจาก JS)", () => {
    setAuthHint("x" as "ready");
    expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });
});

describe("known device (fcf:known-device)", () => {
  it("mark/is/clear", () => {
    expect(isKnownDevice()).toBe(false);
    markKnownDevice();
    expect(localStorage.getItem(KNOWN_DEVICE_KEY)).toBe("1");
    expect(isKnownDevice()).toBe(true);
    clearKnownDevice();
    expect(isKnownDevice()).toBe(false);
  });

  it("ล้าง auth hint ไม่กระทบ known device", () => {
    markKnownDevice();
    setAuthHint("ready");
    clearAuthHint();
    expect(isKnownDevice()).toBe(true);
  });
});

describe("localStorage ใช้ไม่ได้ = ถือว่าไม่มี hint และไม่โยน", () => {
  it("getItem/setItem/removeItem โยน (เช่น Safari บล็อก storage หรือพื้นที่เต็ม)", () => {
    const boom = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(() => setAuthHint("ready")).not.toThrow();
    expect(() => markKnownDevice()).not.toThrow();
    expect(getAuthHint()).toBeNull();
    expect(isKnownDevice()).toBe(false);
    expect(() => clearAuthHint()).not.toThrow();
    expect(() => clearKnownDevice()).not.toThrow();
  });

  it("แค่เข้าถึง localStorage ก็โยน", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(getAuthHint()).toBeNull();
    expect(isKnownDevice()).toBe(false);
    expect(() => setAuthHint("ready")).not.toThrow();
    expect(() => clearKnownDevice()).not.toThrow();
  });

  it("ไม่มี localStorage (SSR) → null/false", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getAuthHint()).toBeNull();
    expect(isKnownDevice()).toBe(false);
    expect(() => setAuthHint("ready")).not.toThrow();
  });
});
