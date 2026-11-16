// ไฟล์ poses.generated.ts ที่ commit ต้องตรงกับผลของสคริปต์ — กันต้นฉบับ (samples.html) กับ component เพี้ยนจากกัน
// ชื่อเทสต์เป็นภาษาอังกฤษ เพราะเกต i18n ห้ามอักษรไทยใน string ของ src/components (คอมเมนต์ไทยได้)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POSES_FILE, SAMPLES, SLUGS, buildPosesModule, dedupe } from "../../../scripts/cat-source.mjs";
import { CAT_POSES, POSES } from "./poses.generated";

const lf = (s: string) => s.replace(/\r\n/g, "\n");
const THAI = new RegExp("[\\u0E00-\\u0E7F]");

describe("poses.generated.ts", () => {
  // ถ้าไม่ตรง: แก้ภาพที่ samples.html แล้วรัน node scripts/export-stickers.mjs
  it("matches the output of scripts/export-stickers.mjs for docs/design/samples.html", () => {
    const expected = buildPosesModule(readFileSync(SAMPLES, "utf8"));
    expect(lf(readFileSync(POSES_FILE, "utf8"))).toBe(lf(expected));
  });

  it("has all 36 poses in samples.html order", () => {
    expect(CAT_POSES).toEqual(SLUGS);
    expect(CAT_POSES).toHaveLength(36);
    expect(Object.keys(POSES)).toEqual(SLUGS);
  });

  // attribute ซ้ำ (เช่น stroke-width สองครั้ง) ต้องเก็บตัวแรก แบบที่เบราว์เซอร์ทำใน samples.html
  it("has no duplicate attributes in any tag", () => {
    for (const pose of CAT_POSES) {
      for (const tag of POSES[pose].body.match(/<[a-zA-Z][^>]*>/g) ?? []) {
        expect(dedupe(tag), `${pose}: ${tag}`).toBe(tag);
      }
    }
  });

  it("dedupe keeps the first value", () => {
    expect(dedupe('<path stroke-width="5" d="M0 0" stroke-width="3"/>')).toBe('<path stroke-width="5" d="M0 0"/>');
  });

  // ชื่อท่าภาษาไทยอยู่ในคอมเมนต์ของไฟล์ที่สร้างเท่านั้น
  it("has no Thai characters outside comments (i18n gate)", () => {
    for (const pose of CAT_POSES) expect(POSES[pose].body, pose).not.toMatch(THAI);
    const code = readFileSync(POSES_FILE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(THAI);
  });

  it("clips only the peek pose", () => {
    expect(CAT_POSES.filter((p) => POSES[p].clip)).toEqual(["peek"]);
  });
});
