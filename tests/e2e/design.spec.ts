import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectNoHorizontalOverflow, PAGES, presetTheme, setLocale, TOKENS } from "./helpers";

// เทียบกับ DESIGN.md / UX.md บนหน้าที่ render จริง (contract เกณฑ์ 6, 7, 8)
// ทุกหน้า × สว่าง/มืด × TH/EN

const THEMES = ["light", "dark"] as const;
const LOCALES = ["th", "en"] as const;
/** จอที่ UX.md ข้อ 6 กำหนดว่า "ไม่มีส้ม" (styleguide เป็นหน้าแสดงตัวอย่าง ไม่นับ) */
const NO_ORANGE_PAGES = ["/", "/history", "/progress", "/me"];

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
function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** ข้อความทุกชิ้นที่มองเห็นได้ (มี text node ของตัวเอง) พร้อมสีตัวอักษร สีพื้นจริง ฟอนต์ ขนาด */
async function textSamples(page: Page) {
  return page.evaluate(() => {
    const out: Array<{ text: string; color: string; bg: string; family: string; size: number; weight: string; hand: boolean; disabled: boolean; cls: string }> = [];
    const effectiveBg = (el: Element | null): string => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest("svg, script, style, noscript, [aria-hidden='true']")) continue;
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      if (!own) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.visibility === "hidden" || cs.display === "none" || r.width < 2 || r.height < 2) continue;
      if (cs.clipPath === "inset(50%)") continue; // sr-only
      out.push({
        text: own.slice(0, 40),
        color: cs.color,
        bg: effectiveBg(el),
        family: cs.fontFamily,
        size: parseFloat(cs.fontSize),
        weight: cs.fontWeight,
        hand: el.classList.contains("hand-word"),
        disabled: Boolean(el.closest("[disabled], [aria-disabled='true']")),
        cls: String(el.className).slice(0, 50),
      });
    }
    return out;
  });
}

for (const theme of THEMES) {
  for (const locale of LOCALES) {
    test.describe(`${theme} · ${locale}`, () => {
      test.beforeEach(async ({ page, context, baseURL }) => {
        await setLocale(context, baseURL!, locale);
        await presetTheme(page, theme);
      });

      for (const path of PAGES) {
        test(`${path}: token สี · ฟอนต์ · ขนาดตัวอักษร · คอนทราสต์ ≥ 4.5`, async ({ page }) => {
          await page.goto(path);
          await page.evaluate(() => document.fonts.ready);
          expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(TOKENS[theme].paper);
          expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe(TOKENS[theme].ink2);

          const samples = await textSamples(page);
          expect(samples.length).toBeGreaterThan(3);
          const problems: string[] = [];
          for (const s of samples) {
            const where = `"${s.text}" (${s.cls})`;
            if (s.hand) {
              if (!/Gaegu/i.test(s.family)) problems.push(`hand-word not Gaegu: ${where} ${s.family}`);
              if (/[฀-๿]/.test(s.text)) problems.push(`Gaegu on Thai text: ${where}`);
              if (s.size < 20) problems.push(`Gaegu < 20px: ${where} ${s.size}px`);
              if (s.weight !== "300") problems.push(`Gaegu weight ${s.weight}: ${where}`);
            } else {
              if (!/Noto Sans Thai/i.test(s.family.split(",")[0])) problems.push(`not Noto Sans Thai: ${where} ${s.family}`);
              if (/Gaegu/i.test(s.family)) problems.push(`Gaegu outside hand-word: ${where}`);
            }
            if (s.size < 14) problems.push(`font < 14px: ${where} ${s.size}px`);
            if (!s.disabled) {
              const ratio = contrast(s.color, s.bg);
              if (ratio < 4.5) problems.push(`contrast ${ratio.toFixed(2)} < 4.5: ${where} ${s.color} on ${s.bg}`);
            }
          }
          expect(problems).toEqual([]);
          // ฟอนต์โหลดจริง (self-host) ไม่ใช่ fallback
          const loaded = await page.evaluate(() => Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family));
          expect(loaded.join(",")).toMatch(/Noto Sans Thai/);
        });

        test(`${path}: ปุ่มและลิงก์ทุกอันแตะได้ ≥ 44×44px และข้อความไม่ล้นปุ่ม`, async ({ page }) => {
          await page.goto(path);
          const small = await page.evaluate(() => {
            const out: string[] = [];
            for (const el of Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [role='button']"))) {
              const cs = getComputedStyle(el);
              if (cs.clipPath === "inset(50%)") continue; // ลิงก์ข้ามไปเนื้อหา (มองเห็นตอน focus — ตรวจแยก)
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              const label = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 30);
              if (r.width < 44 || r.height < 44) out.push(`${label}: ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
              if (el.scrollWidth > el.clientWidth + 1) out.push(`${label}: text overflows (${el.scrollWidth} > ${el.clientWidth})`);
            }
            return out;
          });
          expect(small).toEqual([]);
        });
      }

      for (const path of NO_ORANGE_PAGES) {
        test(`${path}: ไม่มีส้มนอกตัวแมว (UX ข้อ 6 "จออื่น ไม่มีส้ม")`, async ({ page }) => {
          await page.goto(path);
          const orange = await page.evaluate((accent) => {
            const out: string[] = [];
            for (const el of Array.from(document.body.querySelectorAll<Element>("*"))) {
              if (el.closest("svg[data-pose]")) continue;
              const cs = getComputedStyle(el);
              for (const prop of ["color", "backgroundColor", "borderTopColor", "fill", "stroke", "outlineColor"] as const) {
                if (cs[prop] === accent) out.push(`${el.tagName}.${String(el.getAttribute("class")).slice(0, 40)} ${prop}`);
              }
            }
            return out;
          }, TOKENS.accent);
          expect(orange).toEqual([]);
        });
      }

      test("แมว: โหมดมืดเป็นเส้นล้วน · โหมดสว่างลงสีส้ม", async ({ page }) => {
        await page.goto("/");
        const fills = await page.evaluate(() => {
          const svg = document.querySelector("svg[data-pose]")!;
          const set = new Set<string>();
          for (const el of Array.from(svg.querySelectorAll<SVGElement>("path, ellipse, circle, rect, polygon, polyline, line"))) {
            const cs = getComputedStyle(el);
            set.add(cs.fill);
            set.add(cs.stroke);
          }
          return [...set];
        });
        const allowed = new Set(["none", TOKENS[theme].paper, TOKENS[theme].ink]);
        if (theme === "dark") {
          expect(fills.filter((f) => !allowed.has(f)), "dark-mode cat uses only paper/ink").toEqual([]);
        } else {
          expect(fills, "light-mode cat is coloured").toContain(TOKENS.accent);
        }
      });

      test("แถบล่าง: ป้าย ≥ 14px บรรทัดเดียว ไม่ล้น ที่จอ 360px และ 390px", async ({ page }) => {
        for (const width of [360, 390]) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto("/progress");
          await expectNoHorizontalOverflow(page);
          const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll("nav a span")).map((s) => {
              const cs = getComputedStyle(s);
              const r = s.getBoundingClientRect();
              const link = s.closest("a")!.getBoundingClientRect();
              return { text: s.textContent, size: parseFloat(cs.fontSize), lines: Math.round(r.height / parseFloat(cs.lineHeight)), fits: r.left >= link.left - 0.5 && r.right <= link.right + 0.5 };
            }),
          );
          expect(labels).toHaveLength(4);
          for (const l of labels) {
            expect(l.size, `${l.text}`).toBeGreaterThanOrEqual(14);
            expect(l.lines, `${l.text} at ${width}px`).toBe(1);
            expect(l.fits, `${l.text} fits its tab at ${width}px`).toBe(true);
          }
        }
      });
    });
  }
}

test.describe("การเคลื่อนไหว", () => {
  async function visibleFrames(page: Page) {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      seen.add(
        await page.evaluate(() => {
          const svg = document.querySelector("main svg[data-pose]")!;
          return Array.from(svg.querySelectorAll(":scope > g"))
            .map((g, k) => (getComputedStyle(g).visibility === "visible" ? k : null))
            .filter((k) => k !== null)
            .join(",");
        }),
      );
      await page.waitForTimeout(110);
    }
    return [...seen];
  }

  test("ปกติ: แมวดุ๊กดิ๊ก (เฟรมที่เห็นเปลี่ยน ทีละเฟรม)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const frames = await visibleFrames(page);
    expect(frames.length).toBeGreaterThan(1);
    for (const f of frames) expect(f.split(",")).toHaveLength(1);
  });

  test("reduced motion: แมวนิ่ง เห็นเฟรมแรกเฟรมเดียว", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await visibleFrames(page)).toEqual(["0"]);
    const names = await page.evaluate(() => Array.from(document.querySelectorAll(".fcf-cat-frame")).map((g) => getComputedStyle(g).animationName));
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set(["none"]));
  });
});
