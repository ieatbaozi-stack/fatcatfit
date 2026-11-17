// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { renderWithIntl } from "../test-utils";
import { LocaleSwitch } from "./locale-switch";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const cookie = () => /NEXT_LOCALE=(\w+)/.exec(document.cookie)?.[1];

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

beforeEach(() => {
  refresh.mockClear();
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
});
afterEach(cleanup);

describe("LocaleSwitch: กดรัวๆ", () => {
  it("ปุ่มสุดท้ายที่กดชนะเสมอ แม้หน้ายังแสดงภาษาเดิม (useLocale ยังไม่เปลี่ยนเพราะ refresh ไม่เสร็จ)", () => {
    // หน้าแสดง en ค้างอยู่ (refresh ไม่เคยเสร็จในเทสต์นี้) → ถ้าเทียบกับ useLocale() การกด en สุดท้ายจะถูกข้าม
    renderWithIntl(<LocaleSwitch />, "en");
    const btnTh = screen.getByRole("button", { name: "ไทย" });
    const btnEn = screen.getByRole("button", { name: "English" });
    fireEvent.click(btnTh);
    expect(cookie()).toBe("th");
    fireEvent.click(btnEn);
    expect(cookie()).toBe("en");
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(btnEn.getAttribute("aria-pressed")).toBe("true");
    expect(btnTh.getAttribute("aria-pressed")).toBe("false");
  });

  it("ปุ่มแสดงภาษาที่เพิ่งเลือกทันที ไม่รอหน้าโหลดใหม่ · กดซ้ำภาษาเดิมไม่ refresh ซ้ำ", () => {
    renderWithIntl(<LocaleSwitch />, "th");
    const btnEn = screen.getByRole("button", { name: "English" });
    fireEvent.click(btnEn);
    expect(btnEn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btnEn);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("LocaleSwitch: ออฟไลน์", () => {
  it("ออฟไลน์ = ปุ่มภาษาอื่นกดไม่ได้ + มีข้อความบอก · cookie ไม่เปลี่ยน", () => {
    renderWithIntl(<LocaleSwitch />, "th");
    expect(screen.queryByText(th.me.language.offlineNote)).toBeNull();
    setOnLine(false);
    const btnEn = screen.getByRole("button", { name: "English" }) as HTMLButtonElement;
    const btnTh = screen.getByRole("button", { name: "ไทย" }) as HTMLButtonElement;
    expect(btnEn.disabled).toBe(true);
    expect(btnTh.disabled).toBe(false);
    expect(btnTh.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(th.me.language.offlineNote)).toBeTruthy();
    fireEvent.click(btnEn);
    expect(cookie()).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("ข้อความออฟไลน์เป็นภาษาอังกฤษเมื่อหน้าเป็น en", () => {
    renderWithIntl(<LocaleSwitch />, "en");
    setOnLine(false);
    expect(screen.getByText(en.me.language.offlineNote)).toBeTruthy();
  });

  it("กลับมาออนไลน์ → ปุ่มกดได้ทันที ข้อความหาย", () => {
    renderWithIntl(<LocaleSwitch />, "th");
    setOnLine(false);
    setOnLine(true);
    const btnEn = screen.getByRole("button", { name: "English" }) as HTMLButtonElement;
    expect(btnEn.disabled).toBe(false);
    expect(screen.queryByText(th.me.language.offlineNote)).toBeNull();
    fireEvent.click(btnEn);
    expect(cookie()).toBe("en");
  });
});
