// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import th from "../../messages/th.json";
import { renderWithIntl } from "@/components/test-utils";
import ErrorPage from "./error";

afterEach(cleanup);

describe("หน้า error", () => {
  it("แสดงข้อความตามภาษา + ปุ่มลองใหม่เรียก reset + ลิงก์กลับหน้าหลัก + แมวงงนิ่ง", () => {
    const reset = vi.fn();
    const { container } = renderWithIntl(<ErrorPage error={new Error("x")} reset={reset} />, "th");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(th.error.text);
    fireEvent.click(screen.getByRole("button", { name: th.error.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: th.error.home }).getAttribute("href")).toBe("/");
    const cat = container.querySelector("svg[data-pose]")!;
    expect(cat.getAttribute("data-pose")).toBe("confused");
    expect(cat.getAttribute("aria-hidden")).toBe("true");
  });

  it("เป็นภาษาอังกฤษเมื่อหน้าเป็น en", () => {
    renderWithIntl(<ErrorPage error={new Error("x")} reset={() => {}} />, "en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(en.error.text);
    expect(screen.getByRole("button", { name: en.error.retry })).toBeTruthy();
  });
});
