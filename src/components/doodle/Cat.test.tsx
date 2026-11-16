// @vitest-environment jsdom
// ชื่อเทสต์เป็นภาษาอังกฤษ เพราะเกต i18n ห้ามอักษรไทยใน string ของ src/components (คอมเมนต์ไทยได้)
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Cat, CAT_POSES } from "@/components/doodle";

afterEach(cleanup);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const svgOf = (c: HTMLElement) => c.querySelector("svg") as SVGSVGElement;

describe("<Cat>", () => {
  it.each(CAT_POSES)("renders pose %s", (pose) => {
    const { container } = render(<Cat pose={pose} />);
    const svg = svgOf(container);
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("data-pose")).toBe(pose);
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
    // มีเส้นจริง ไม่ใช่ svg เปล่า
    expect(svg.querySelectorAll("path, circle, ellipse").length).toBeGreaterThan(5);
  });

  it("defaults to 120px, accepts size and className, keeps square ratio", () => {
    const { container, rerender } = render(<Cat pose="standing" />);
    expect(svgOf(container).getAttribute("width")).toBe("120");
    expect(svgOf(container).getAttribute("height")).toBe("120");
    rerender(<Cat pose="standing" size={48} className="x" />);
    expect(svgOf(container).getAttribute("width")).toBe("48");
    expect(svgOf(container).getAttribute("height")).toBe("48");
    expect(svgOf(container).getAttribute("class")).toBe("x");
  });

  it("with title: role=img + aria-label", () => {
    const { container } = render(<Cat pose="confused" title="Something went wrong" />);
    const svg = svgOf(container);
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Something went wrong");
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
  });

  it("without title: aria-hidden", () => {
    const { container } = render(<Cat pose="confused" />);
    const svg = svgOf(container);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.hasAttribute("role")).toBe(false);
    expect(svg.hasAttribute("aria-label")).toBe(false);
  });

  // สีต้องมาจาก currentColor และ CSS variable เท่านั้น (theme เป็นคนกำหนด)
  it.each([false, true])("has no literal colors in markup for any pose (wiggle=%s)", (wiggle) => {
    for (const pose of CAT_POSES) {
      const { container, unmount } = render(<Cat pose={pose} wiggle={wiggle} />);
      const html = container.innerHTML;
      expect(html, pose).not.toMatch(HEX);
      expect(html, pose).not.toMatch(/rgba?\(|hsla?\(/);
      expect(html, pose).toContain("currentColor");
      unmount();
    }
  });

  it("several cats on one page: unique ids, every url(#...) points to a filter in the same svg", () => {
    const { container } = render(
      <>
        <Cat pose="standing" />
        <Cat pose="standing" wiggle />
        <Cat pose="peek" />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll("svg")) {
      const own = new Set([...svg.querySelectorAll("[id]")].map((e) => e.id));
      const refs = [...svg.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const r of refs) expect(own.has(r), r).toBe(true);
    }
  });

  // นิ่ง = เฟรมเดียว · ดุ๊กดิ๊ก = 3 เฟรม seed ต่างกัน เฟรม 2–3 ซ่อนไว้ตั้งต้น (reduced motion เห็นเฟรมแรก)
  it("still = 1 frame; wiggle = 3 frames with different seeds, frames 2-3 hidden by default", () => {
    const still = svgOf(render(<Cat pose="running" />).container);
    expect(still.querySelectorAll(":scope > g").length).toBe(1);
    expect(still.querySelector(".fcf-cat-frame")).toBeNull();
    expect(still.querySelectorAll("filter").length).toBe(2);
    cleanup();

    const moving = svgOf(render(<Cat pose="running" wiggle />).container);
    const frames = [...moving.querySelectorAll(":scope > g")];
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.getAttribute("class"))).toEqual([
      "fcf-cat-frame fcf-cat-f0",
      "fcf-cat-frame fcf-cat-f1",
      "fcf-cat-frame fcf-cat-f2",
    ]);
    expect(frames.map((f) => f.getAttribute("visibility"))).toEqual([null, "hidden", "hidden"]);
    const seeds = [...moving.querySelectorAll("feTurbulence")].map((t) => t.getAttribute("seed"));
    expect(seeds).toEqual(["4", "11", "7", "15", "9", "19"]);
  });

  // ท่าแอบมองตัดขอบ ท่าอื่นให้ของยื่นออกนอกกรอบได้แบบ samples.html
  it("clips peek, lets other poses overflow like samples.html", () => {
    expect(svgOf(render(<Cat pose="peek" />).container).getAttribute("overflow")).toBe("hidden");
    cleanup();
    expect(svgOf(render(<Cat pose="swim" />).container).getAttribute("overflow")).toBe("visible");
  });
});
