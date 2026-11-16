// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PAGE_LANG_MESSAGE, SKIP_WAITING_MESSAGE, SW_SCOPE, SW_URL } from "./messages";
import { registerServiceWorker, reportPageLang, ServiceWorkerRegister } from "./register";

function fakeRegistration(withWaiting: boolean) {
  const postMessage = vi.fn();
  const registration = {
    waiting: withWaiting ? { postMessage } : null,
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServiceWorkerRegistration;
  return { registration, postMessage };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("registerServiceWorker", () => {
  it("ไม่ลงทะเบียนนอก production", async () => {
    const register = vi.fn();
    expect(await registerServiceWorker({ register }, false)).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("เบราว์เซอร์ไม่รองรับ → ไม่ทำอะไร", async () => {
    expect(await registerServiceWorker(undefined, true)).toBeNull();
  });

  it("ลงทะเบียนที่ scope / และไม่ใช้ HTTP cache กับไฟล์ sw", async () => {
    const { registration } = fakeRegistration(false);
    const register = vi.fn().mockResolvedValue(registration);
    expect(await registerServiceWorker({ register }, true)).toBe(registration);
    expect(register).toHaveBeenCalledWith(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" });
  });

  it("มีรุ่นใหม่รออยู่ตอนเปิดแอป → สั่งให้ activate", async () => {
    const { registration, postMessage } = fakeRegistration(true);
    await registerServiceWorker({ register: vi.fn().mockResolvedValue(registration) }, true);
    expect(postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE });
  });

  it("ตรวจหารุ่นใหม่ทุกครั้งที่เปิดแอป", async () => {
    const { registration } = fakeRegistration(false);
    await registerServiceWorker({ register: vi.fn().mockResolvedValue(registration) }, true);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("ตรวจรุ่นใหม่ล้ม (ออฟไลน์) ไม่ทำให้ลงทะเบียนล้ม", async () => {
    const { registration } = fakeRegistration(false);
    (registration.update as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(registerServiceWorker({ register: vi.fn().mockResolvedValue(registration) }, true)).resolves.toBe(registration);
  });

  it("ลงทะเบียนล้มไม่โยน error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const register = vi.fn().mockRejectedValue(new Error("SecurityError"));
    await expect(registerServiceWorker({ register }, true)).resolves.toBeNull();
  });
});

describe("<ServiceWorkerRegister />", () => {
  it("render ได้แม้เบราว์เซอร์ไม่มี serviceWorker และไม่แสดงอะไร", () => {
    const { container } = render(<ServiceWorkerRegister />);
    expect(container.innerHTML).toBe("");
  });

  it("production: ลงทะเบียน และตรวจรุ่นใหม่เมื่อกลับมาที่หน้าจอ", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { registration } = fakeRegistration(false);
    const register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    try {
      const { unmount } = render(<ServiceWorkerRegister />);
      await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      document.dispatchEvent(new Event("visibilitychange"));
      expect(registration.update).toHaveBeenCalled();
      unmount();
    } finally {
      // @ts-expect-error ลบ property ที่ stub ไว้
      delete navigator.serviceWorker;
    }
  });

  it("production: แจ้งภาษาของหน้าให้ SW ตอนเปิด และเมื่อ <html lang> เปลี่ยน", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const activePost = vi.fn();
    const registration = {
      waiting: null,
      active: { postMessage: activePost },
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, "serviceWorker", { value: { register: vi.fn().mockResolvedValue(registration) }, configurable: true });
    document.documentElement.lang = "th";
    try {
      const { unmount } = render(<ServiceWorkerRegister />);
      await vi.waitFor(() => expect(activePost).toHaveBeenCalledWith({ type: PAGE_LANG_MESSAGE, lang: "th" }));
      document.documentElement.lang = "en";
      await vi.waitFor(() => expect(activePost).toHaveBeenCalledWith({ type: PAGE_LANG_MESSAGE, lang: "en" }));
      unmount();
    } finally {
      // @ts-expect-error ลบ property ที่ stub ไว้
      delete navigator.serviceWorker;
      document.documentElement.lang = "";
    }
  });
});

describe("reportPageLang", () => {
  it("ยังไม่มี SW ที่ active หรือไม่มีภาษา → ไม่ส่ง", () => {
    const postMessage = vi.fn();
    reportPageLang(null, "th");
    reportPageLang({ active: null }, "th");
    reportPageLang({ active: { postMessage } as unknown as ServiceWorker }, "");
    expect(postMessage).not.toHaveBeenCalled();
  });
});
