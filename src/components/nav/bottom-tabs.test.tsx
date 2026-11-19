// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../test-utils";
import { BottomTabs, isTabActive } from "./bottom-tabs";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

afterEach(cleanup);

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
});
