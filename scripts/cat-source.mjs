// ดึงภาพแมวจากต้นฉบับ docs/design/samples.html — ใช้ร่วมกันโดย export-stickers.mjs, export-icons.mjs
// และเทสต์ที่ตรวจว่า src/components/doodle/poses.generated.ts ตรงกับต้นฉบับ
// โมดูลนี้ไม่มีผลข้างเคียง (ไม่เขียนไฟล์) — import ได้จากเทสต์
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// เฟรมดุ๊กดิ๊ก: เปลี่ยน seed ของเส้นสั่น (เส้น "เดือด" แบบการ์ตูนวาดมือ) + ขยับตัวเล็กน้อยรอบจุดกลางล่าง
// ค่าเดียวกับ <animate> ใน samples.html (seed 4;7;9 และ 11;15;19) และ @keyframes wig
export const FRAMES = [
  { line: 4, fill: 11, tf: '' },
  { line: 7, fill: 15, tf: 'translate(0 -3) rotate(-2 100 196)' },
  { line: 9, fill: 19, tf: 'translate(100 196) scale(1.03 .97) translate(-100 -196) rotate(2 100 196)' }
];

// ตัวกรองเส้นสั่น — ค่าเดียวกับ <filter id="wob-line"> และ "wob-fill" ใน samples.html
export const WOB = {
  line: { baseFrequency: '0.03', scale: '5' },
  fill: { baseFrequency: '0.022', scale: '8' }
};

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

export const filters = (k, f) => `
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

// ---------- ข้อมูลท่าสำหรับ <Cat> ----------
const compact = s => s.replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><').trim();

export function buildPosesModule(html) {
  const cats = loadCats(html);
  const entries = cats.map((c, i) => {
    const body = compact(innerOf(c.svg));
    for (const ref of body.match(/url\(#[^)]*\)/g) ?? []) {
      if (ref !== 'url(#wob-line)' && ref !== 'url(#wob-fill)') throw new Error(`ท่า ${SLUGS[i]} อ้าง ${ref} ที่ component ไม่รู้จัก`);
    }
    // ชื่อท่า/ที่ใช้ (ภาษาไทย) อยู่ในคอมเมนต์เท่านั้น — เกต i18n ห้ามอักษรไทยใน string ของ src/components
    if (new RegExp('[\\u0E00-\\u0E7F]').test(body)) throw new Error(`ท่า ${SLUGS[i]} มีอักษรไทยใน markup`);
    const note = `${c.name} · ${c.use}`.replace(/\*\//g, '');
    return `  // ${i + 1}. ${note}\n  ${JSON.stringify(SLUGS[i])}: {\n    clip: ${isClipped(c.svg)},\n    body: ${JSON.stringify(body)},\n  },`;
  });
  return `// ไฟล์สร้างอัตโนมัติจาก docs/design/samples.html โดย \`node scripts/export-stickers.mjs\` — ห้ามแก้มือ
// แก้ภาพแมวที่ samples.html แล้วรันสคริปต์ใหม่ · เทสต์ poses.generated.test.ts ตรวจว่าไฟล์นี้ตรงกับต้นฉบับ
// body = เนื้อใน <svg viewBox="0 0 200 200"> · เส้นใช้ currentColor · สีใช้ var(--cat) var(--cat-ear) var(--cat-white) var(--paper)
// url(#wob-line) / url(#wob-fill) ถูกแทนด้วย id เฉพาะตัวตอน render

export const CAT_POSES = [
${SLUGS.map(s => `  ${JSON.stringify(s)},`).join('\n')}
] as const;

export type CatPose = (typeof CAT_POSES)[number];

export interface CatPoseData {
  /** ตัดภาพที่ขอบกรอบ 200×200 */
  clip: boolean;
  body: string;
}

export const FRAMES = ${JSON.stringify(FRAMES, null, 2).replace(/"(\w+)":/g, '$1:')} as const;

export const WOB = ${JSON.stringify(WOB, null, 2).replace(/"(\w+)":/g, '$1:')} as const;

export const POSES: Record<CatPose, CatPoseData> = {
${entries.join('\n')}
};
`;
}
