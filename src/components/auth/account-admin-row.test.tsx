// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { AccountSection } from "./account-section";

const me = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./auth-gate", () => ({ useMe: () => ({ me: me.value, refresh: async () => {} }) }));

const user = { id: "u", email: "a@example.com", name: "A" };
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountSection · แถวแอดมิน", () => {
  it("isAdmin = มีแถวเป็นแถวแรก ลิงก์ไป /admin/invites", () => {
    me.value = { isAdmin: true, user };
    renderWithIntl(<AccountSection />);
    const link = screen.getByRole("link", { name: th.account.adminInvites });
    expect(link.getAttribute("href")).toBe("/admin/invites");
    expect(screen.getAllByRole("listitem")[0].contains(link)).toBe(true);
  });

  it("ไม่ใช่แอดมิน / ยังไม่โหลด = ไม่มีแถว ไม่มีช่องว่าง", () => {
    me.value = { isAdmin: false, user };
    renderWithIntl(<AccountSection />);
    expect(screen.queryByText(th.account.adminInvites)).toBeNull();
    cleanup();
    me.value = { user };
    renderWithIntl(<AccountSection />);
    expect(screen.queryByText(th.account.adminInvites)).toBeNull();
    cleanup();
    me.value = null;
    renderWithIntl(<AccountSection />);
    expect(screen.queryByText(th.account.adminInvites)).toBeNull();
  });

  it("ออฟไลน์ = แถวปิด (ไม่ใช่ลิงก์)", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    me.value = { isAdmin: true, user };
    renderWithIntl(<AccountSection />);
    expect(screen.queryByRole("link", { name: th.account.adminInvites })).toBeNull();
    expect(screen.getByText(th.account.adminInvites).closest("[aria-disabled='true']")).toBeTruthy();
  });
});

describe("AccountSection · ยืนยันออกจากระบบ", () => {
  const signOutCalls = () => vi.mocked(fetch).mock.calls.filter((c) => String(c[0]).includes("sign-out"));

  it("กดแถว = เปิดแผ่นยืนยัน ยังไม่เรียก sign-out · ยกเลิก/Esc = ปิดและโฟกัสกลับแถว", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    me.value = { user };
    renderWithIntl(<AccountSection />);
    const row = screen.getByRole("button", { name: th.account.signOut });
    fireEvent.click(row);
    const dialog = screen.getByRole("dialog", { name: th.account.signOutSheet.title });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText(th.account.signOutSheet.body)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: th.account.signOutSheet.cancel }));
    expect(signOutCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: th.account.signOutSheet.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(row);

    fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(signOutCalls()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("ล้มเหลว = ปิดแผ่น แสดงข้อความเดิม", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    me.value = { user };
    renderWithIntl(<AccountSection />);
    fireEvent.click(screen.getByRole("button", { name: th.account.signOut }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === th.account.signOutSheet.confirm)!);
    expect(await screen.findByText(th.account.signOutFailed)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.unstubAllGlobals();
  });
});
