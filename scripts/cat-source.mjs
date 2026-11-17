// ดึงภาพแมวจากต้นฉบับ docs/design/samples.html — ใช้ร่วมกันโดย export-stickers.mjs, export-icons.mjs
// และเทสต์ที่ตรวจว่า src/components/doodle/poses.generated.ts ตรงกับต้นฉบับ (samples.html + scripts/sprites/rigs.mjs)
// โมดูลนี้ไม่มีผลข้างเคียง (ไม่เขียนไฟล์ ไม่ใช้ Chrome) — import ได้จากเทสต์ และรันบน Linux ได้
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NFRAMES, parseSVG, frameLayout, elementTag, rectTag } from './sprites/frames.mjs';
import { RIGS } from './sprites/rigs.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SAMPLES = join(ROOT, 'docs', 'design', 'samples.html');
export const POSES_FILE = join(ROOT, 'src', 'components', 'doodle', 'poses.generated.ts');

// ชื่อท่าตามลำดับใน samples.html
export const SLUGS = [
  'standing', 'side', 'running', 'dumbbell', 'squat', 'overhead-press', 'jump-rope', 'new-record',
  'scale', 'eating', 'full', 'lying', 'back', 'poop', 'push-up', 'treadmill',
  'stretch', 'swim', 'stopwatch', 'drink', 'trophy', 'thanks', 'confused', 'offline',
  'cycling', 'pull-up', 'kettlebell', 'boxing', 'badminton', 'football', 'sit-up', 'meditate',
  'tired', 'fish', 'party', 'peek'
];

// ตัวกรองเส้นสั่น — ค่าเดียวกับ <filter id="wob-line"> และ "wob-fill" ใน samples.html (seed ของภาพนิ่ง)
// ภาพนิ่ง สติกเกอร์ แผ่น sprite 5 เฟรม และ <Cat> ใช้ seed ชุดเดียวกันทุกเฟรม
export const WOB = {
  line: { baseFrequency: '0.03', scale: '5', seed: 4 },
  fill: { baseFrequency: '0.022', scale: '8', seed: 11 }
};
export const STILL_SEEDS = { line: WOB.line.seed, fill: WOB.fill.seed };

/** @deprecated ชื่อเดิมที่ scripts/export-icons.mjs ยัง import อยู่ (ไฟล์นั้นอยู่นอกขอบเขต ux-brand)
 *  เหลือค่าเดียว = seed ของภาพนิ่ง · แก้ export-icons ให้ใช้ STILL_SEEDS แล้วลบบรรทัดนี้ */
export const FRAMES = [STILL_SEEDS];

// ดึงโค้ดวาดแมวออกจาก samples.html แล้วรันเพื่อเอารายการ cats
export function loadCats(html = readFileSync(SAMPLES, 'utf8')) {
  const a = html.indexOf('// ---------- ชิ้นส่วนพื้นฐาน ----------');
  const b = html.indexOf("document.getElementById('heroCat')");
  if (a < 0 || b < 0) throw new Error('หาโค้ดวาดแมวใน samples.html ไม่เจอ');
  const cats = new Function(html.slice(a, b) + '; return cats;')();
  if (cats.length !== SLUGS.length) throw new Error(`จำนวนแมว (${cats.length}) ไม่ตรงกับรายชื่อ (${SLUGS.length}) — แก้ SLUGS ใน scripts/cat-source.mjs`);
  return cats;
}

// ห้ามมี attribute ซ้ำ (XML เข้มงวด และ React) — เก็บตัวแรกไว้ เหมือนที่ parser ของ HTML ทำใน samples.html
export const dedupe = tag => {
  const seen = new Set();
  return tag.replace(/\s([\w:-]+)="[^"]*"/g, (m, k) => (seen.has(k) ? '' : (seen.add(k), m)));
};

// ตัด <svg> ชั้นนอกออก เหลือเนื้อในที่ attribute ไม่ซ้ำ
export const innerOf = svg => svg
  .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  .replace(/<[a-zA-Z][^>]*>/g, dedupe);

// ---------- ไฟล์ภาพนิ่ง (สติกเกอร์ ไอคอน) — แทนตัวแปรด้วยค่าสีจริง ----------
// ชุดสี: color = ลงสี (พื้นสว่าง) · line = เส้นดำตัวขาว · line-white = เส้นขาว (พื้นมืด)
export const VARIANTS = {
  color:        { ink: '#171717', cat: '#F9A03A', ear: '#F4A19B', white: '#FFFFFF', paper: '#FFFFFF' },
  line:         { ink: '#171717', cat: '#FFFFFF', ear: '#FFFFFF', white: '#FFFFFF', paper: '#FFFFFF' },
  'line-white': { ink: '#F2EFEA', cat: '#161514', ear: '#161514', white: '#161514', paper: '#161514' }
};

export const paint = (svg, c) => innerOf(svg)
  .replaceAll('currentColor', c.ink)
  .replaceAll('var(--cat-white)', c.white)
  .replaceAll('var(--cat-ear)', c.ear)
  .replaceAll('var(--cat)', c.cat)
  .replaceAll('var(--paper)', c.paper);

export const filters = (k = '', f = STILL_SEEDS) => `
  <filter id="wob-line${k}" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="${WOB.line.baseFrequency}" numOctaves="2" seed="${f.line}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${WOB.line.scale}"/>
  </filter>
  <filter id="wob-fill${k}" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="${WOB.fill.baseFrequency}" numOctaves="2" seed="${f.fill}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${WOB.fill.scale}"/>
  </filter>`;

// ท่าที่ต้องตัดขอบกรอบ 200×200 (samples.html ใส่ style="overflow:hidden" ที่ <svg>)
export const isClipped = svg => /^<svg[^>]*overflow:\s*hidden/.test(svg);

// ---------- ไฟล์สติกเกอร์ภาพนิ่ง (assets/stickers/svg/<ชุดสี>/NN-name.svg) ----------
// colors = null → ไม่ลงสี (currentColor + CSS variable) ใช้ทำข้อมูลเฟรมของ <Cat>
// โครงต้องเหมือนกันทุกชุดสี เพราะ rig (scripts/sprites/rigs.mjs) อ้าง element ตามลำดับวาด
export const PAD = 16;
export const BOX = 200 + PAD * 2; // เผื่อขอบ เพราะบางท่ามีของยื่นออกนอกกรอบ 200×200
const CLIP = `<clipPath id="frame"><rect x="${-PAD}" y="${-PAD}" width="${BOX}" height="${BOX - PAD}"/></clipPath>`;
const clipped = (body, clip) => `<g${clip ? ' clip-path="url(#frame)"' : ''}>${body}</g>`;
export const stickerSVG = (svg, colors, clip) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${BOX} ${BOX}">\n<defs>${filters()}\n${CLIP}</defs>\n${clipped(colors ? paint(svg, colors) : innerOf(svg), clip)}\n</svg>\n`;
export const stickerName = i => `${String(i + 1).padStart(2, '0')}-${SLUGS[i]}`;

// ---------- ข้อมูลท่าสำหรับ <Cat> (ภาพนิ่ง + แมวขยับจริง 5 เฟรม) ----------
// เก็บแบบ "ตัวร่วม 1 ชุด + ส่วนที่ต่างต่อชั้น":
//   els[n]           = element ลำดับที่ n (ลำดับวาดที่ rig อ้าง) เป็น "<path ..." ไม่มี transform และยังไม่ปิดแท็ก
//   still, frames[k] = โครงกลุ่มของชั้นนั้น — "@n" คือ els[n] ตามด้วย transform ของชั้นนั้น (ถ้ามี) แล้ว "/>"
//                      แขนขาแบบ IK ที่เส้นเปลี่ยนทุกเฟรมเขียนเต็มแท็กในชั้นนั้น
//   still  = ภาพนิ่งเดิม (rig ว่าง) · frames = 5 เฟรมจาก rig ของ boss (ท่าเดียวกับแผ่น sprite)
// คำนวณด้วย scripts/sprites/frames.mjs แบบ fixFilters (พื้นที่ตัวกรองเท่ากลุ่มเดิม แขนขาไม่ถูกตัดเหลือแท่งบาง)
const compact = s => s.replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><').trim();
const THAI = new RegExp('[\\u0E00-\\u0E7F]');
const EMPTY_RIG = {};

// โครงของหนึ่งชั้น → markup ที่อ้าง els ด้วย @n
function layerMarkup(doc, runs) {
  const f = filter => (filter ? ` filter="url(#${filter})"` : '');
  const t = tf => (tf ? ` transform="${tf}"` : '');
  const kid = k => {
    if (k.rect) return rectTag(k.rect);
    if (k.group) {
      const g = k.group;
      const o = g.opacity !== null && g.opacity !== undefined ? ` opacity="${g.opacity}"` : '';
      return `<g${f(g.filter)}${o}${t(g.transform)}>${g.kids.map(kid).join('')}</g>`;
    }
    if (k.d !== null && k.d !== undefined) return elementTag(doc.items[k.el], k.d, k.tf);
    return `@${k.el}${t(k.tf)}/>`;
  };
  // กลุ่มที่ไม่มีทั้งตัวกรองและ transform ไม่ต้องห่อ
  return runs.map(r => (r.filter || r.matrix ? `<g${f(r.filter)}${t(r.matrix)}>${r.kids.map(kid).join('')}</g>` : r.kids.map(kid).join(''))).join('');
}

// ข้อมูลของท่าที่ i (ใช้ทั้งตอนสร้างไฟล์และในเทสต์)
export function poseFrames(svg, i) {
  const name = stickerName(i);
  const rig = RIGS[name];
  if (!rig) throw new Error(`ท่า ${name} ไม่มี rig ใน scripts/sprites/rigs.mjs`);
  const doc = parseSVG(stickerSVG(svg, null, false));
  const els = doc.items.map(el => compact(elementTag(el, null, null)).replace(/\/>$/, ''));
  const opts = { fixFilters: true };
  const still = compact(layerMarkup(doc, frameLayout(doc, EMPTY_RIG, 0, opts)));
  const frames = Array.from({ length: NFRAMES }, (_, k) => compact(layerMarkup(doc, frameLayout(doc, rig, k, opts))));
  return { doc, els, still, frames };
}

// ประกอบชั้นกลับเป็น markup เต็ม (แบบเดียวกับที่ <Cat> ทำ)
export const expandLayer = (els, layer) => layer.replace(/@(\d+)/g, (_, n) => els[Number(n)]);

export function buildPosesModule(html) {
  const cats = loadCats(html);
  const entries = cats.map((c, i) => {
    const { els, still, frames } = poseFrames(c.svg, i);
    for (const part of [...els, still, ...frames]) {
      for (const ref of part.match(/url\(#[^)]*\)/g) ?? []) {
        if (ref !== 'url(#wob-line)' && ref !== 'url(#wob-fill)') throw new Error(`ท่า ${SLUGS[i]} อ้าง ${ref} ที่ component ไม่รู้จัก`);
      }
      // ชื่อท่า/ที่ใช้ (ภาษาไทย) อยู่ในคอมเมนต์เท่านั้น — เกต i18n ห้ามอักษรไทยใน string ของ src/components
      if (THAI.test(part)) throw new Error(`ท่า ${SLUGS[i]} มีอักษรไทยใน markup`);
    }
    // "@" ใช้เป็นตัวอ้าง element ในโครงชั้น จึงห้ามมีในเนื้อ element
    if (els.some(e => e.includes('@'))) throw new Error(`ท่า ${SLUGS[i]} มี @ ใน element`);
    const note = `${c.name} · ${c.use}`.replace(/\*\//g, '');
    return `  // ${i + 1}. ${note}\n  ${JSON.stringify(SLUGS[i])}: {\n    clip: ${isClipped(c.svg)},\n    els: [\n${els.map(e => `      ${JSON.stringify(e)},`).join('\n')}\n    ],\n    still: ${JSON.stringify(still)},\n    frames: [\n${frames.map(fr => `      ${JSON.stringify(fr)},`).join('\n')}\n    ],\n  },`;
  });
  return `// ไฟล์สร้างอัตโนมัติจาก docs/design/samples.html + scripts/sprites/rigs.mjs โดย \`node scripts/export-stickers.mjs\` — ห้ามแก้มือ
// แก้ภาพแมวที่ samples.html (หรือท่าขยับที่ rigs.mjs) แล้วรันสคริปต์ใหม่ · เทสต์ poses.generated.test.ts ตรวจว่าไฟล์นี้ตรงกับต้นฉบับ
// els = element ร่วมของทุกชั้น ("<path ..." ไม่ปิดแท็ก ไม่มี transform) · still / frames[k] = โครงของชั้น โดย "@n" = els[n]
// เส้นใช้ currentColor · สีใช้ var(--cat) var(--cat-ear) var(--cat-white) var(--paper)
// url(#wob-line) / url(#wob-fill) ถูกแทนด้วย id เฉพาะตัวตอน render

export const CAT_POSES = [
${SLUGS.map(s => `  ${JSON.stringify(s)},`).join('\n')}
] as const;

export type CatPose = (typeof CAT_POSES)[number];

export interface CatPoseData {
  /** ตัดภาพที่ขอบกรอบ 200×200 */
  clip: boolean;
  /** element ร่วมของทุกชั้น */
  els: readonly string[];
  /** ภาพนิ่ง: motion ปิด / ลดการเคลื่อนไหว / CSS ไม่โหลด */
  still: string;
  /** แมวขยับจริง ${NFRAMES} เฟรม */
  frames: readonly string[];
}

export const MOTION_FRAMES = ${NFRAMES};

export const WOB = ${JSON.stringify(WOB, null, 2).replace(/"(\w+)":/g, '$1:')} as const;

export const POSES: Record<CatPose, CatPoseData> = {
${entries.join('\n')}
};
`;
}
