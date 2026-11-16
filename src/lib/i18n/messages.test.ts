// เกต i18n ของทั้งโปรเจกต์: key ของ th.json กับ en.json ต้องตรงกันครบ และไม่มีข้อความฝังในโค้ด
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import th from "../../../messages/th.json";
import { defaultLocale, isLocale, locales, resolveLocale } from "./config";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

const thFlat = flatten(th as Tree);
const enFlat = flatten(en as Tree);

/** ชื่อ placeholder ของ ICU เช่น {n} {count, plural, ...} */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort();
}

describe("messages: th กับ en", () => {
  it("มี key ตรงกันครบทั้งสองไฟล์", () => {
    const thKeys = Object.keys(thFlat).sort();
    const enKeys = Object.keys(enFlat).sort();
    expect(enKeys.filter((k) => !thKeys.includes(k)), "มีใน en แต่ไม่มีใน th").toEqual([]);
    expect(thKeys.filter((k) => !enKeys.includes(k)), "มีใน th แต่ไม่มีใน en").toEqual([]);
  });

  it("ไม่มีข้อความว่าง", () => {
    for (const [name, flat] of [["th", thFlat], ["en", enFlat]] as const) {
      const empty = Object.entries(flat).filter(([, v]) => v.trim() === "").map(([k]) => k);
      expect(empty, `${name} มี key ที่ว่าง`).toEqual([]);
    }
  });

  it("placeholder ของแต่ละ key ตรงกันทั้งสองภาษา", () => {
    for (const key of Object.keys(thFlat)) {
      expect(placeholders(enFlat[key] ?? ""), key).toEqual(placeholders(thFlat[key]));
    }
  });

  it("ชื่อแท็บครบ 4 อัน", () => {
    for (const key of ["home", "history", "progress", "me"]) {
      expect(thFlat[`nav.${key}`]).toBeTruthy();
      expect(enFlat[`nav.${key}`]).toBeTruthy();
    }
  });
});

describe("config ภาษา", () => {
  it("ค่าเริ่มต้นเป็นไทย และค่าที่ไม่รู้จักตกมาเป็นไทย", () => {
    expect(defaultLocale).toBe("th");
    expect(resolveLocale(undefined)).toBe("th");
    expect(resolveLocale("fr")).toBe("th");
    expect(resolveLocale("en")).toBe("en");
  });

  it("isLocale รับเฉพาะภาษาที่รองรับ", () => {
    expect(locales.every((l) => isLocale(l))).toBe(true);
    expect(isLocale("TH")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

// ไม่มีข้อความฝังในโค้ด: ไฟล์ .tsx ของหน้าจอ/component ต้องไม่มีตัวอักษรไทย (ข้อความอยู่ใน messages/)
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "api" ? [] : sourceFiles(full);
    return /\.(tsx|ts)$/.test(name) && !/\.test\.(tsx|ts)$/.test(name) ? [full] : [];
  });
}

describe("ไม่มีข้อความฝังในโค้ด", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const files = [...sourceFiles(path.join(root, "app")), ...sourceFiles(path.join(root, "components"))];

  it("พบไฟล์ให้ตรวจ", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("ไม่มีตัวอักษรไทยใน .ts/.tsx ของ app และ components (ยกเว้นคอมเมนต์)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
      if (/[฀-๿]/.test(code)) offenders.push(path.relative(root, file));
    }
    expect(offenders).toEqual([]);
  });
});
