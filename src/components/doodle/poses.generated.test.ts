// ไฟล์ poses.generated.ts ที่ commit ต้องตรงกับผลของสคริปต์ — กันต้นฉบับ (samples.html + rigs.mjs) กับ component เพี้ยนจากกัน
// เทสต์นี้ใช้ Node ล้วน (ไม่ใช้ Chrome) จึงรันใน CI บน Linux ได้
// ชื่อเทสต์เป็นภาษาอังกฤษ เพราะเกต i18n ห้ามอักษรไทยใน string ของ src/components (คอมเมนต์ไทยได้)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  POSES_FILE,
  SAMPLES,
  SLUGS,
  VARIANTS,
  buildPosesModule,
  dedupe,
  expandLayer,
  innerOf,
  loadCats,
  poseFrames,
  stickerName,
  stickerSVG,
} from "../../../scripts/cat-source.mjs";
import { NFRAMES, parseSVG, renderFrame } from "../../../scripts/sprites/frames.mjs";
import { RIGS } from "../../../scripts/sprites/rigs.mjs";
import { CAT_POSES, MOTION_FRAMES, POSES } from "./poses.generated";

const lf = (s: string) => s.replace(/\r\n/g, "\n");
const THAI = new RegExp("[\\u0E00-\\u0E7F]");
const cats = loadCats(readFileSync(SAMPLES, "utf8"));
const tags = (s: string) => s.match(/<[a-zA-Z][^>]*>/g) ?? [];
// element ที่วาดจริง (ไม่นับกลุ่มและกรอบล่องหนของตัวกรอง) เรียงตามลำดับ พร้อมรูปทรง
const shapes = (markup: string) =>
  tags(markup)
    .filter((t) => /^<(path|circle|ellipse)\b/.test(t))
    .map((t) => t.replace(/\s+transform="[^"]*"/, ""));

describe("poses.generated.ts", () => {
  // ถ้าไม่ตรง: แก้ภาพที่ samples.html (หรือท่าที่ rigs.mjs) แล้วรัน node scripts/export-stickers.mjs
  it("matches the output of scripts/export-stickers.mjs for samples.html + rigs.mjs", () => {
    const expected = buildPosesModule(readFileSync(SAMPLES, "utf8"));
    expect(lf(readFileSync(POSES_FILE, "utf8"))).toBe(lf(expected));
  });

  it("detects a hand edit (the check above is not vacuous)", () => {
    const committed = lf(readFileSync(POSES_FILE, "utf8"));
    const edited = committed.replace('stroke-width=\\"17\\"', 'stroke-width=\\"18\\"');
    expect(edited).not.toBe(committed);
    expect(edited).not.toBe(lf(buildPosesModule(readFileSync(SAMPLES, "utf8"))));
  });

  it("has all 36 poses in samples.html order, each with a rig", () => {
    expect(CAT_POSES).toEqual(SLUGS);
    expect(CAT_POSES).toHaveLength(36);
    expect(Object.keys(POSES)).toEqual(SLUGS);
    for (let i = 0; i < SLUGS.length; i++) expect(RIGS[stickerName(i)], stickerName(i)).toBeDefined();
  });

  it("every pose has 5 motion frames", () => {
    expect(MOTION_FRAMES).toBe(5);
    expect(NFRAMES).toBe(5);
    for (const pose of CAT_POSES) expect(POSES[pose].frames, pose).toHaveLength(5);
  });

  // ภาพนิ่งที่ component วาด = ภาพนิ่งเดิมใน samples.html: element ชุดเดียวกัน ลำดับเดียวกัน รูปทรงเดียวกัน
  it("still layer draws exactly the samples.html shapes in the same order", () => {
    CAT_POSES.forEach((pose, i) => {
      const still = expandLayer(POSES[pose].els, POSES[pose].still);
      expect(shapes(still), pose).toEqual(shapes(innerOf(cats[i].svg).replace(/\s*\n\s*/g, " ")));
    });
  });

  // ข้อมูลเก็บแบบตัวร่วม + ส่วนต่าง: ทุกชั้นอ้าง els ที่มีจริง และไม่มี SVG เต็มซ้ำ 5 ชุด
  it("stores shared elements once; layers only reference them", () => {
    for (const pose of CAT_POSES) {
      const { els, still, frames } = POSES[pose];
      for (const layer of [still, ...frames]) {
        for (const [, n] of layer.matchAll(/@(\d+)/g)) expect(Number(n), pose).toBeLessThan(els.length);
      }
      // ภาพนิ่งอ้างทุก element ครั้งเดียว
      const refs = [...still.matchAll(/@(\d+)/g)].map((m) => Number(m[1]));
      expect(refs, pose).toEqual(els.map((_, k) => k));
    }
  });

  // เฟรมของ component ต้องเป็นท่าเดียวกับแผ่น sprite ชุด color (scripts/sprites/build.mjs):
  // element เดียวกัน เส้น IK เดียวกัน และ transform ของแต่ละ element ตรงกันหลังประกอบเมทริกซ์
  // (คลาดได้จากการปัดเศษ 3 ตำแหน่งแยกชั้น: ไม่เกิน 0.002 ในส่วนหมุน/ย่อ และ 0.2 หน่วยในส่วนเลื่อน = ไม่ถึง 0.15 px ที่ขนาด 120 px)
  it("motion frames pose every element like the color sprite sheet", () => {
    const flat = (markup: string) => {
      // คืน [รูปทรง, เมทริกซ์รวม] ของทุก element ตามลำดับ
      const out: [string, number[]][] = [];
      const stack: number[][] = [[1, 0, 0, 1, 0, 0]];
      const mul = (a: number[], b: number[]) => [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
      ];
      const parse = (t: string) => {
        const m = /transform="matrix\(([^)]*)\)"/.exec(t);
        if (m) return m[1].split(" ").map(Number);
        const tr = /transform="([^"]+)"/.exec(t);
        if (!tr) return [1, 0, 0, 1, 0, 0];
        // แอตทริบิวต์เดิมของภาพ (translate/scale/rotate) — ใช้ parser ของ frames.mjs ผ่าน parseSVG
        const doc = parseSVG(`<defs></defs><g transform="${tr[1]}"><path d="M0 0"/></g>`);
        return doc.items[0].anc;
      };
      for (const t of tags(markup.replace(/<\/g>/g, "<end>"))) {
        if (t === "<end>") stack.pop();
        else if (t.startsWith("<g")) stack.push(mul(stack[stack.length - 1], parse(t)));
        else if (/^<(path|circle|ellipse)\b/.test(t)) {
          out.push([t.replace(/\s+transform="[^"]*"/, "").replace(/\s+(fill|stroke)="[^"]*"/g, ""), mul(stack[stack.length - 1], parse(t))]);
        }
      }
      return out;
    };
    CAT_POSES.forEach((pose, i) => {
      const rig = RIGS[stickerName(i)];
      const sheet = parseSVG(stickerSVG(cats[i].svg, VARIANTS.color, false));
      for (let k = 0; k < 5; k++) {
        const want = flat(renderFrame(sheet, rig, k, "p"));
        const got = flat(expandLayer(POSES[pose].els, POSES[pose].frames[k]));
        expect(got.map((g) => g[0]), `${pose} frame ${k}`).toEqual(want.map((w) => w[0]));
        got.forEach((g, e) => {
          g[1].forEach((v, j) => expect(Math.abs(v - want[e][1][j]), `${pose} frame ${k} el ${e}`).toBeLessThan(j < 4 ? 0.002 : 0.2));
        });
      }
    });
  });

  // attribute ซ้ำ (เช่น stroke-width สองครั้ง) ต้องเก็บตัวแรก แบบที่เบราว์เซอร์ทำใน samples.html
  it("has no duplicate attributes in any tag", () => {
    for (const pose of CAT_POSES) {
      const { els, still, frames } = POSES[pose];
      for (const layer of [still, ...frames]) {
        for (const tag of tags(expandLayer(els, layer))) expect(dedupe(tag), `${pose}: ${tag}`).toBe(tag);
      }
    }
  });

  it("dedupe keeps the first value", () => {
    expect(dedupe('<path stroke-width="5" d="M0 0" stroke-width="3"/>')).toBe('<path stroke-width="5" d="M0 0"/>');
  });

  // ชื่อท่าภาษาไทยอยู่ในคอมเมนต์ของไฟล์ที่สร้างเท่านั้น
  it("has no Thai characters outside comments (i18n gate)", () => {
    for (const pose of CAT_POSES) {
      const { els, still, frames } = POSES[pose];
      for (const part of [...els, still, ...frames]) expect(part, pose).not.toMatch(THAI);
    }
    const code = readFileSync(POSES_FILE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(THAI);
  });

  it("clips only the peek pose", () => {
    expect(CAT_POSES.filter((p) => POSES[p].clip)).toEqual(["peek"]);
  });

  it("poseFrames is deterministic", () => {
    expect(poseFrames(cats[0].svg, 0).frames).toEqual(POSES.standing.frames);
  });
});
