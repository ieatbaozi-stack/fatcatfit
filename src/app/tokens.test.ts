// token ใน globals.css ต้องตรงกับ DESIGN.md ข้อ 3 (CR4 Studio Minimal) และคอนทราสต์ผ่านทุกชั้นพื้นผิว
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(import.meta.dirname, "globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`ไม่พบ ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = block(":root {");
const dark = block(':root[data-theme="dark"]');
const darkMedia = block(":root:not([data-theme])");

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("ค่า token ตรง DESIGN.md ข้อ 3 (CR4 Studio Minimal)", () => {
  it("โหมดสว่าง", () => {
    expect(light).toMatchObject({
      paper: "#ffffff",
      "paper-2": "#f4f4f5",
      "surface-2": "#ebebed",
      "surface-3": "#ffffff",
      ink: "#111113",
      "ink-2": "#4a4a52",
      "ink-3": "#686870",
      accent: "#f9a03a",
      "on-accent": "#111113",
      cat: "#f9a03a",
      "cat-ear": "#f4a19b",
      "cat-white": "#ffffff",
      warn: "#c0392b",
    });
  });
  it("โหมดมืด 4 ชั้นพื้นผิว (Soft Charcoal)", () => {
    expect(dark).toMatchObject({
      paper: "#1c1d21",
      "paper-2": "#24252b",
      "surface-2": "#2d2f36",
      "surface-3": "#353740",
      ink: "#ececf0",
      "ink-2": "#c8cad3",
      "ink-3": "#a7aab6",
      warn: "#f58a80",
    });
  });
  it("โหมดมืด: แมวเป็นเส้นล้วน (cat, cat-ear, cat-white = paper) และส้มคงเดิม", () => {
    for (const mode of [dark, darkMedia]) {
      expect(mode.cat).toBe("var(--paper)");
      expect(mode["cat-ear"]).toBe("var(--paper)");
      expect(mode["cat-white"]).toBe("var(--paper)");
      expect(mode.accent).toBeUndefined(); // ไม่ override = ยังเป็น #F9A03A
    }
  });
  it("โหมดมืดตามระบบ (media) ตรงกับโหมดมืดที่เลือกเอง", () => {
    for (const key of Object.keys(dark)) expect(darkMedia[key], key).toBe(dark[key]);
  });
  it("ระยะห่างฐาน 4px", () => {
    expect(css).toMatch(/--spacing:\s*4px/);
  });
});

describe("คอนทราสต์ ≥ 4.5:1 ทั้งสองโหมดทุกชั้นพื้นผิว", () => {
  const modes = { สว่าง: light, มืด: { ...light, ...dark } } as Record<string, Record<string, string>>;
  const pairs: Array<[string, string]> = [
    ["ink", "paper"],
    ["ink-2", "paper"],
    ["ink-3", "paper"],
    ["warn", "paper"],
    ["ink", "paper-2"],
    ["ink-2", "paper-2"],
    ["ink-3", "paper-2"],
    ["warn", "paper-2"],
    ["ink", "surface-2"],
    ["ink-2", "surface-2"],
    ["ink-3", "surface-2"],
    ["warn", "surface-2"],
    ["ink", "surface-3"],
    ["ink-2", "surface-3"],
    ["ink-3", "surface-3"],
    ["warn", "surface-3"],
    ["on-accent", "accent"],
    ["paper", "ink"], // ปุ่มหลักและชิปที่เลือก
  ];
  for (const [modeName, tokens] of Object.entries(modes)) {
    for (const [fg, bg] of pairs) {
      it(`${modeName}: ${fg} บน ${bg}`, () => {
        expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("ไม่มีค่าสีตรงๆ นอก globals.css", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "api" ? [] : files(full);
      return /\.(tsx|ts|css)$/.test(name) && !/\.test\./.test(name) && name !== "globals.css" ? [full] : [];
    });
  }
  it("component และหน้าจอไม่ใส่ #hex / rgb() / hsl()", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const offenders = [...files(path.join(root, "app")), ...files(path.join(root, "components"))].filter((f) => {
      // doodle เป็นของ ux-brand (ใช้ var(--cat…)) — ตรวจเฉพาะส่วนของ frontend
      if (f.includes(`${path.sep}doodle${path.sep}`)) return false;
      const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      return /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(code);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
