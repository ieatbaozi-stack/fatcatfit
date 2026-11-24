// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "../test-utils";
import { Button, TextButton } from "./button";
import { Chip } from "./chip";
import { HandWord } from "./hand-word";
import { NumberInput } from "./number-input";
import { Squiggle } from "./squiggle";
import { TickButton } from "./tick-button";

afterEach(cleanup);

describe("Button", () => {
  it("ส่ง onClick และเป็น type=button เป็นค่าเริ่ม", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>เริ่ม</Button>);
    const btn = screen.getByRole("button", { name: "เริ่ม" });
    expect(btn.getAttribute("type")).toBe("button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("loading = กดไม่ได้ + aria-busy", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        ส่ง
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("สูงอย่างน้อย 48px (min-h-13 = 52px) และใช้ token ไม่ใช่ค่าสีตรงๆ", () => {
    render(<Button>x</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("min-h-13");
    expect(cls).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });
  it("ปุ่มรองเป็นปุ่มจริงสูง ≥ 44px และเป็นพื้นรองไม่ใช่เส้นหยัก", () => {
    render(<TextButton>รอง</TextButton>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("bg-paper-2");
    expect(cls).not.toContain("underline-hand");
  });
  it("ปุ่มลบที่ส่ง border-warn / text-warn ได้พื้น paper เพื่อคอนทราสต์ผ่านทั้งสว่างและมืด", () => {
    render(<Button className="border-warn text-warn">ลบ</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-paper");
    expect(cls).not.toContain("bg-ink");
  });
});

describe("Chip", () => {
  it("สะท้อนสถานะด้วย aria-pressed (ไม่ใช้สีอย่างเดียว)", () => {
    const { rerender } = render(<Chip pressed={false}>ฟิตเนส</Chip>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    rerender(<Chip pressed>ฟิตเนส</Chip>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button").className).toContain("bg-ink");
  });
});

describe("TickButton", () => {
  it("มี aria-pressed + ป้าย และขนาด ≥ 56px (size-14)", () => {
    const onClick = vi.fn();
    render(<TickButton pressed={false} label="เซ็ต 1" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "เซ็ต 1" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.className).toContain("size-14");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});

describe("Squiggle", () => {
  it("เป็นของตกแต่ง (aria-hidden) และวนแบบเส้นได้ทั้ง 4 แบบ", () => {
    const ds = [0, 1, 2, 3, 4, -1].map((v) => {
      const { container, unmount } = render(<Squiggle variant={v} />);
      const d = container.querySelector("path")!.getAttribute("d");
      expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
      unmount();
      return d;
    });
    expect(new Set(ds.slice(0, 4)).size).toBe(4);
    expect(ds[4]).toBe(ds[0]);
    expect(ds[5]).toBe(ds[3]);
  });
});

describe("HandWord", () => {
  it("ภาษาอังกฤษใช้ฟอนต์ลายมือ", () => {
    render(<HandWord>new record</HandWord>);
    expect(screen.getByText("new record").className).toContain("hand-word");
  });
  it("ภาษาไทยไม่ใช้ฟอนต์ลายมือ", () => {
    render(<HandWord>สถิติใหม่</HandWord>);
    expect(screen.getByText("สถิติใหม่").className).not.toContain("hand-word");
  });
});

function Harness({ initial = 62.5, step = 2.5, min = 0, max = 500 }: { initial?: number | null; step?: number; min?: number; max?: number }) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <>
      <NumberInput label="น้ำหนัก" unit="กก." value={v} onChange={setV} step={step} min={min} max={max} />
      <output data-testid="out">{v === null ? "null" : String(v)}</output>
    </>
  );
}

describe("NumberInput", () => {
  const out = () => screen.getByTestId("out").textContent;

  it("ช่องกรอกใช้ inputmode ตามชนิดเลข ไม่ใช่ dropdown", () => {
    renderWithIntl(<Harness />);
    const input = screen.getByLabelText("น้ำหนัก") as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.tagName).toBe("INPUT");
    expect(document.querySelector("select")).toBeNull();
  });
  it("จำนวนเต็มใช้ numeric", () => {
    renderWithIntl(<Harness initial={8} step={1} />);
    expect((screen.getByLabelText("น้ำหนัก") as HTMLInputElement).getAttribute("inputmode")).toBe("numeric");
  });
  it("ปุ่ม + และ − เปลี่ยนค่าทีละ step และมีป้ายอ่านออกเสียง", () => {
    renderWithIntl(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "เพิ่ม น้ำหนัก" }));
    expect(out()).toBe("65");
    fireEvent.click(screen.getByRole("button", { name: "ลด น้ำหนัก" }));
    fireEvent.click(screen.getByRole("button", { name: "ลด น้ำหนัก" }));
    expect(out()).toBe("60");
    expect((screen.getByLabelText("น้ำหนัก") as HTMLInputElement).value).toBe("60");
  });
  it("พิมพ์ได้ และ blur แล้วบีบให้อยู่ในช่วง", () => {
    renderWithIntl(<Harness max={100} />);
    const input = screen.getByLabelText("น้ำหนัก") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "70,5" } });
    expect(out()).toBe("70.5");
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.blur(input);
    expect(out()).toBe("100");
    expect(input.value).toBe("100");
  });
  it("ล้างช่อง = ค่าว่าง · ข้อความที่ไม่ใช่เลขถูกย้อนกลับตอน blur", () => {
    renderWithIntl(<Harness />);
    const input = screen.getByLabelText("น้ำหนัก") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(out()).toBe("null");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(out()).toBe("null");
    expect(input.value).toBe("");
  });
  it("ปุ่มถูกปิดที่ขอบช่วง", () => {
    renderWithIntl(<Harness initial={0} />);
    expect((screen.getByRole("button", { name: "ลด น้ำหนัก" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "เพิ่ม น้ำหนัก" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("ป้ายของปุ่มเป็นภาษาอังกฤษเมื่อเปลี่ยนภาษา", () => {
    renderWithIntl(<Harness />, "en");
    expect(screen.getByRole("button", { name: "Increase น้ำหนัก" })).toBeTruthy();
  });
});
