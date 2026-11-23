import type { Page } from "@playwright/test";
import { TOKENS } from "../helpers";

// ตรวจหน้าตาตาม DESIGN.md (ย้ายมาจาก r1-design.spec.ts ให้จอ R2 ใช้ร่วม): คอนทราสต์ · ฟอนต์ · ปุ่ม ≥ 44px · ส้มนอกแมว · ข้อความไทยหลุด
// ตรวจใน dialog ถ้ามีเปิดอยู่ ไม่งั้นทั้งหน้า

function parse(rgb: string): [number, number, number, number] {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 0];
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
}
function luminance([r, g, b]: number[]) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export async function audit(page: Page) {
  return page.evaluate((accent) => {
    const root = document.querySelector('[role="dialog"]') ?? document.body;
    const effectiveBg = (el: Element | null): string => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== "hidden" && cs.display !== "none" && r.width >= 1 && r.height >= 1 && cs.clipPath !== "inset(50%)";
    };
    const texts: Array<{ text: string; color: string; bg: string; size: number; disabled: boolean; cls: string; inLangTh: boolean }> = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest("svg, script, style, noscript, [aria-hidden='true']")) continue;
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
      if (!own || !visible(el)) continue;
      const cs = getComputedStyle(el);
      texts.push({
        text: own.slice(0, 40),
        color: cs.color,
        bg: effectiveBg(el),
        size: parseFloat(cs.fontSize),
        disabled: Boolean(el.closest("[disabled], [aria-disabled='true'], label:has(input:disabled)")),
        cls: String(el.className).slice(0, 50),
        inLangTh: Boolean(el.closest('[lang="th"]:not(html)')),
      });
    }
    const small: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input:not([type=checkbox]), select, textarea, [role='button'], label:has(input[type=checkbox])"))) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 30);
      if (r.width < 44 || r.height < 44) small.push(`${label}: ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
    }
    const orange: string[] = [];
    for (const el of Array.from(root.querySelectorAll<Element>("*"))) {
      if (el.closest("svg[data-pose]")) continue;
      if (!visible(el) && el.tagName.toLowerCase() !== "path") continue;
      const cs = getComputedStyle(el);
      for (const prop of ["color", "backgroundColor", "borderTopColor", "fill", "stroke", "outlineColor"] as const) {
        if (cs[prop] !== accent) continue;
        // สีที่ไม่ได้วาดจริง: color ของ element ที่ไม่มีข้อความและไม่มี svg ที่ใช้ currentColor
        if (prop === "color" && !el.textContent?.trim() && !el.querySelector("svg")) continue;
        if (prop === "borderTopColor" && cs.borderTopWidth === "0px") continue;
        if (prop === "outlineColor" && cs.outlineStyle === "none") continue;
        if ((prop === "fill" || prop === "stroke") && !(el instanceof SVGElement)) continue;
        if (prop === "fill" && el instanceof SVGElement && el.getAttribute("fill") === "none") continue;
        orange.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 40)} ${prop}`);
      }
    }
    // ชื่อภาษาในตัวสลับภาษาเขียนเป็นภาษานั้นเอง (button lang="th") — ไม่นับเป็นข้อความหลุด
    const visibleText = texts.filter((t) => !t.inLangTh).map((t) => t.text).join("\n");
    return { texts, small, orange, visibleText };
  }, TOKENS.accent);
}
