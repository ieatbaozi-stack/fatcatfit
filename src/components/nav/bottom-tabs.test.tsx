// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../test-utils";
import { BottomTabs, isTabActive } from "./bottom-tabs";

const pathname = vi.hoisted(() => ({ value: "/" }));
const linkPending = vi.hoisted(() => ({ value: false }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return { ...actual, useLinkStatus: () => ({ pending: linkPending.value }) };
});

afterEach(() => {
  linkPending.value = false;
  cleanup();
});

describe("isTabActive", () => {
  it("หน้าหลักตรงเป๊ะเท่านั้น", () => {
    expect(isTabActive("/", "/")).toBe(true);
    expect(isTabActive("/history", "/")).toBe(false);
  });
  it("แท็บอื่นรวมหน้าลูก", () => {
    expect(isTabActive("/history", "/history")).toBe(true);
    expect(isTabActive("/history/abc", "/history")).toBe(true);
    expect(isTabActive("/historyx", "/history")).toBe(false);
  });
});

describe("BottomTabs", () => {
  it("มี 4 แท็บ ลิงก์ถูกที่ และเรียงตามลำดับ", () => {
    renderWithIntl(<BottomTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/history", "/progress", "/me"]);
    expect(links.map((a) => a.textContent)).toEqual(["หน้าหลัก", "ประวัติ", "ความคืบหน้า", "ฉัน"]);
  });
  it("แท็บที่เลือกมี aria-current=page อันเดียว", () => {
    pathname.value = "/progress";
    renderWithIntl(<BottomTabs />);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["ความคืบหน้า"]);
  });
  it("ป้ายเปลี่ยนเป็นอังกฤษและ nav มี label", () => {
    pathname.value = "/";
    renderWithIntl(<BottomTabs />, "en");
    expect(screen.getByRole("navigation", { name: "Main menu" })).toBeTruthy();
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Home", "History", "Progress", "Me"]);
  });
  it("ทุกแท็บแตะได้ ≥ 44px (min-h-13)", () => {
    renderWithIntl(<BottomTabs />);
    for (const a of screen.getAllByRole("link")) expect(a.className).toContain("min-h-13");
  });
  it("แท็บที่เลือกมีแถบชี้ [data-active-indicator] อันเดียว และไม่มีเส้นหยัก", () => {
    pathname.value = "/me";
    const { container } = renderWithIntl(<BottomTabs />);
    const indicators = container.querySelectorAll("[data-active-indicator]");
    expect(indicators).toHaveLength(1);
    expect(indicators[0].closest("a")?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelectorAll("nav a span")).toHaveLength(4);
  });
  it("ระหว่างเปลี่ยนหน้า (useLinkStatus pending) แสดงจุดเด้ง 3 จุดพร้อม role=status", () => {
    pathname.value = "/";
    linkPending.value = true;
    renderWithIntl(<BottomTabs />);
    const statuses = screen.getAllByRole("status", { name: "กำลังโหลด" });
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0].querySelectorAll(".fcf-dot")).toHaveLength(3);
  });
});
