// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
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
