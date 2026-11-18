// @vitest-environment jsdom
// ชื่อเทสต์เป็นภาษาอังกฤษ เพราะเกต i18n ห้ามอักษรไทยใน string ของ src/components (คอมเมนต์ไทยได้)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Cat, CAT_POSES } from "@/components/doodle";

afterEach(cleanup);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const svgOf = (c: HTMLElement) => c.querySelector("svg") as SVGSVGElement;
const layers = (svg: SVGSVGElement) => [...svg.querySelectorAll(":scope > g")];
const drawn = (el: Element) => [...el.querySelectorAll("path, circle, ellipse")];

describe("<Cat>", () => {
  it.each(CAT_POSES)("renders pose %s", (pose) => {
    const { container } = render(<Cat pose={pose} />);
    const svg = svgOf(container);
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("data-pose")).toBe(pose);
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
    // มีเส้นจริง ไม่ใช่ svg เปล่า
    expect(drawn(svg).length).toBeGreaterThan(5);
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

  // สีต้องมาจาก currentColor และ CSS variable เท่านั้น (theme เป็นคนกำหนด → โหมดมืดเป็นเส้นล้วนทุกเฟรม)
  it.each([false, true])("has no literal colors in markup for any pose or frame (motion=%s)", (motion) => {
    for (const pose of CAT_POSES) {
      const { container, unmount } = render(<Cat pose={pose} motion={motion} />);
      const html = container.innerHTML;
      expect(html, pose).not.toMatch(HEX);
      expect(html, pose).not.toMatch(/rgba?\(|hsla?\(/);
      expect(html, pose).toContain("currentColor");
      // ทุกสีที่ใช้มาจากชุดตัวแปรของ theme เท่านั้น
      for (const [, v] of html.matchAll(/(?:fill|stroke)="([^"]*)"/g)) {
        expect(["none", "currentColor", "var(--cat)", "var(--cat-ear)", "var(--cat-white)", "var(--paper)"], `${pose}: ${v}`).toContain(v);
      }
      unmount();
    }
  });

  it("several cats on one page: unique ids, every url(#...) points to a filter in the same svg", () => {
    const { container } = render(
      <>
        <Cat pose="standing" />
        <Cat pose="standing" motion />
        <Cat pose="pull-up" motion />
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

  // นิ่ง = ชั้นภาพนิ่งชั้นเดียว · ขยับ = ภาพนิ่ง + 5 เฟรม ทุกเฟรมซ่อนตั้งต้น
  // → CSS ไม่โหลดหรือ prefers-reduced-motion: reduce เห็นภาพนิ่งภาพเดียว ไม่ซ้อนกัน
  it("motion=false: one still layer, no animation classes, one pair of wobble filters", () => {
    const still = svgOf(render(<Cat pose="running" />).container);
    expect(layers(still)).toHaveLength(1);
    expect(still.querySelector(".fcf-cat-frame, .fcf-cat-still")).toBeNull();
    expect(still.querySelectorAll("filter")).toHaveLength(2);
    expect(layers(still)[0].hasAttribute("visibility")).toBe(false);
  });

  it.each(CAT_POSES)("motion: %s has the still layer + 5 hidden frames that share the filters", (pose) => {
    const moving = svgOf(render(<Cat pose={pose} motion />).container);
    const ls = layers(moving);
    expect(ls).toHaveLength(6);
    expect(ls.map((f) => f.getAttribute("class"))).toEqual([
      "fcf-cat-still",
      "fcf-cat-frame fcf-cat-f0",
      "fcf-cat-frame fcf-cat-f1",
      "fcf-cat-frame fcf-cat-f2",
      "fcf-cat-frame fcf-cat-f3",
      "fcf-cat-frame fcf-cat-f4",
    ]);
    expect(ls.map((f) => f.getAttribute("visibility"))).toEqual([null, "hidden", "hidden", "hidden", "hidden", "hidden"]);
    // ทุกเฟรมวาด element ครบชุดเดียวกับภาพนิ่ง และใช้เส้นสั่นทุกเฟรม
    const n = drawn(ls[0]).length;
    for (const f of ls.slice(1)) {
      expect(drawn(f)).toHaveLength(n);
      expect(f.innerHTML).toMatch(/filter="url\(#doodle[^)]*-l\)"/);
      expect(f.innerHTML).toMatch(/filter="url\(#doodle[^)]*-f\)"/);
    }
    // ตัวกรองคู่เดียวต่อแมวหนึ่งตัว seed เดียวกับภาพนิ่ง
    expect([...moving.querySelectorAll("feTurbulence")].map((t) => t.getAttribute("seed"))).toEqual(["4", "11"]);
  });

  // motion={false} = ภาพเดียวกับชั้นภาพนิ่งตอน motion เปิด (ภาพที่เห็นเมื่อลดการเคลื่อนไหว)
  it("the still layer is identical with and without motion", () => {
    const a = layers(svgOf(render(<Cat pose="squat" />).container))[0].innerHTML;
    cleanup();
    const b = layers(svgOf(render(<Cat pose="squat" motion />).container))[0].innerHTML;
    const noIds = (s: string) => s.replace(/url\(#doodle[^)]*-([lf])\)/g, "url(#cat-$1)");
    expect(noIds(b)).toBe(noIds(a));
  });

  // ท่าแอบมองตัดขอบ ท่าอื่นให้ของยื่นออกนอกกรอบได้แบบ samples.html
  it("clips peek, lets other poses overflow like samples.html", () => {
    expect(svgOf(render(<Cat pose="peek" />).container).getAttribute("overflow")).toBe("hidden");
    cleanup();
    expect(svgOf(render(<Cat pose="swim" />).container).getAttribute("overflow")).toBe("visible");
  });

  // CSS: วน 5 เฟรม 0.7 วิ · เฟรมละ 1/5 ของรอบ · ซ่อนภาพนิ่งและเล่นเฉพาะเมื่อผู้ใช้ไม่ได้ขอลดการเคลื่อนไหว
  it("cat.css plays 5 frames in 0.7s only under prefers-reduced-motion: no-preference", () => {
    const css = readFileSync(join(__dirname, "cat.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const media = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const keyframes = css.indexOf("@keyframes");
    expect(media).toBeGreaterThanOrEqual(0);
    const inMedia = css.slice(media, keyframes);
    expect(inMedia).toMatch(/\.fcf-cat-still\s*\{\s*visibility:\s*hidden;?\s*\}/);
    expect(inMedia).toMatch(/\.fcf-cat-frame\s*\{\s*animation:\s*fcf-cat-play 0\.7s steps\(1\) infinite;?\s*\}/);
    // ไม่มีกฎแอนิเมชันหรือการซ่อนภาพนิ่งนอก media query
    expect(css.slice(0, media)).not.toMatch(/animation|visibility/);
    expect(css.slice(keyframes)).not.toMatch(/\.fcf-cat/);
    // เฟรม k เริ่มเห็นที่ k × 0.14 วิ
    for (const [k, delay] of [[1, "-0.56s"], [2, "-0.42s"], [3, "-0.28s"], [4, "-0.14s"]] as const) {
      expect(inMedia).toMatch(new RegExp(`\\.fcf-cat-f${k}\\s*\\{\\s*animation-delay:\\s*${delay};?\\s*\\}`));
    }
    expect(css.slice(keyframes)).toMatch(/0%\s*\{\s*visibility:\s*visible;?\s*\}\s*20%\s*\{\s*visibility:\s*hidden;?\s*\}/);
  });
});
