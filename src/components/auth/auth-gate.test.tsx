// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { closeOffline, getOfflineUser, initOffline } from "@/lib/offline/client";
import { createMemoryStore } from "@/lib/offline/store";
import { AuthGate } from "./auth-gate";

const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
}));

const me = (state: string) => new Response(JSON.stringify({ state, user: { id: "u", email: "a@example.com", name: "" } }), { status: 200 });

beforeEach(() => {
  nav.replace.mockReset();
  nav.pathname = "/";
  window.localStorage.clear();
});
afterEach(() => {
  closeOffline();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuthGate", () => {
  it("401 บนหน้าแอป → /welcome, ล้าง hint และปิดฐานออฟไลน์ (SEC-H1)", async () => {
    window.localStorage.setItem("fcf:auth", "ready");
    await initOffline("u_old", { openStore: async () => createMemoryStore(), fetch: vi.fn().mockResolvedValue(new Response("{}", { status: 401 })), listen: false, persist: async () => true });
    expect(getOfflineUser()).toBe("u_old");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    renderWithIntl(<AuthGate kind="app"><p>เนื้อหา</p></AuthGate>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/welcome"));
    expect(window.localStorage.getItem("fcf:auth")).toBeNull();
    expect(getOfflineUser()).toBeNull();
  });

  it("ยังไม่ยินยอม → /consent · ready บน /welcome → / พร้อมตั้ง hint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(me("consent_required")));
    renderWithIntl(<AuthGate kind="app"><p>x</p></AuthGate>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/consent"));
    cleanup();
    nav.replace.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(me("ready")));
    renderWithIntl(<AuthGate kind="public"><p>x</p></AuthGate>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(window.localStorage.getItem("fcf:auth")).toBe("ready");
  });

  it("setup: อยู่ถ้าตรงกับสถานะ", async () => {
    nav.pathname = "/onboarding";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(me("onboarding_required")));
    renderWithIntl(<AuthGate kind="setup"><p>แบบสอบถาม</p></AuthGate>);
    await screen.findByText("แบบสอบถาม");
    await waitFor(() => expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("ออฟไลน์ ไม่มี hint → จอยินดีต้อนรับแบบออฟไลน์แทนเนื้อหาในที่เดิม ไม่เปลี่ยนหน้า", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn());
    renderWithIntl(<AuthGate kind="app"><p>เนื้อหาแอป</p></AuthGate>);
    expect(screen.getByRole("button", { name: th.offline.signInClosed })).toBeTruthy();
    expect(screen.queryByText("เนื้อหาแอป")).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("ออฟไลน์ มี hint → แสดงหน้าแอปตามปกติ", () => {
    window.localStorage.setItem("fcf:auth", "ready");
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn());
    renderWithIntl(<AuthGate kind="app"><p>เนื้อหาแอป</p></AuthGate>);
    expect(screen.getByText("เนื้อหาแอป")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(th.offline.bar);
  });

  it("ออนไลน์: ไม่มีแถบเน็ตหลุด", async () => {
    window.localStorage.setItem("fcf:auth", "ready");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(me("ready")));
    renderWithIntl(<AuthGate kind="app"><p>เนื้อหาแอป</p></AuthGate>);
    await screen.findByText("เนื้อหาแอป");
    expect(screen.queryByText("เน็ตหลุด")).toBeNull();
  });

  it("fetch ล้ม (ถือว่าออฟไลน์) ไม่เปลี่ยนหน้า", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    renderWithIntl(<AuthGate kind="app"><p>เนื้อหาแอป</p></AuthGate>);
    expect(await screen.findByRole("button", { name: th.offline.signInClosed })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("5xx บน setup → จอผิดพลาด + ลองใหม่", async () => {
    nav.pathname = "/consent";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    renderWithIntl(<AuthGate kind="setup"><p>x</p></AuthGate>);
    expect(await screen.findByRole("button", { name: th.error.retry })).toBeTruthy();
  });
});
