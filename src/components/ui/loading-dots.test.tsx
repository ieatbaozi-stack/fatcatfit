// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";
import { LoadingDots } from "./loading-dots";

afterEach(cleanup);

describe("LoadingDots (CR4 จุดเด้ง 3 จุด)", () => {
  it("สร้างจุด 3 จุดด้วย CSS class ไม่ใช้ SVG id ที่ชนกัน และซ่อนจากโปรแกรมอ่านจอเมื่อวางคู่ข้อความ", () => {
    const { container } = render(<LoadingDots />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.getAttribute("role")).toBeNull();
    expect(container.querySelectorAll(".fcf-dot")).toHaveLength(3);
    expect(container.querySelector("[id]")).toBeNull();
  });

  it("เมื่อส่ง label จะประกาศ role=status + aria-label สำหรับโปรแกรมอ่านจอ", () => {
    render(<LoadingDots size="md" label="กำลังโหลด" />);
    const status = screen.getByRole("status", { name: "กำลังโหลด" });
    expect(status.getAttribute("aria-hidden")).toBeNull();
    expect(status.querySelectorAll(".fcf-dot")).toHaveLength(3);
  });

  it("<Button loading> แสดงจุดเด้ง 3 จุดคู่ข้อความอัตโนมัติ", () => {
    const { container, rerender } = render(<Button>ส่ง</Button>);
    expect(container.querySelectorAll(".fcf-dot")).toHaveLength(0);
    rerender(<Button loading>กำลังส่ง…</Button>);
    expect(container.querySelectorAll(".fcf-dot")).toHaveLength(3);
  });
});
