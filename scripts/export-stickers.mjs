// ส่งออกแมวทุกท่าจาก docs/design/samples.html เป็นไฟล์สติกเกอร์แยกตัว + sprite ดุ๊กดิ๊ก 3 เฟรม
// ใช้: node scripts/export-stickers.mjs          (SVG + PNG)
//      node scripts/export-stickers.mjs --no-png (SVG อย่างเดียว)
//      node scripts/export-stickers.mjs --resume (ทำ PNG ต่อจากรอบที่ค้าง)
// ต้นฉบับของภาพอยู่ใน samples.html ที่เดียว — แก้ที่นั่นแล้วรันสคริปต์นี้ใหม่
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'docs', 'design', 'samples.html');
const out = join(root, 'assets', 'stickers');

// ชื่อไฟล์ตามลำดับใน samples.html
const SLUGS = [
  'standing', 'side', 'running', 'dumbbell', 'squat', 'overhead-press', 'jump-rope', 'new-record',
  'scale', 'eating', 'full', 'lying', 'back', 'poop', 'push-up', 'treadmill',
  'stretch', 'swim', 'stopwatch', 'drink', 'trophy', 'thanks', 'confused', 'offline',
  'cycling', 'pull-up', 'kettlebell', 'boxing', 'badminton', 'football', 'sit-up', 'meditate',
  'tired', 'fish', 'party', 'peek'
];

// ชุดสี: color = ลงสี (พื้นสว่าง) · line = เส้นดำตัวขาว · line-white = เส้นขาว (พื้นมืด)
const VARIANTS = {
  color:        { ink: '#171717', cat: '#F9A03A', ear: '#F4A19B', white: '#FFFFFF', paper: '#FFFFFF' },
  line:         { ink: '#171717', cat: '#FFFFFF', ear: '#FFFFFF', white: '#FFFFFF', paper: '#FFFFFF' },
  'line-white': { ink: '#F2EFEA', cat: '#161514', ear: '#161514', white: '#161514', paper: '#161514' }
};

// เฟรมดุ๊กดิ๊ก: เปลี่ยน seed ของเส้นสั่น (เส้น "เดือด" แบบการ์ตูนวาดมือ) + ขยับตัวเล็กน้อยรอบจุดกลางล่าง
const FRAMES = [
  { line: 4, fill: 11, tf: '' },
  { line: 7, fill: 15, tf: 'translate(0 -3) rotate(-2 100 196)' },
  { line: 9, fill: 19, tf: 'translate(100 196) scale(1.03 .97) translate(-100 -196) rotate(2 100 196)' }
];
const PAD = 16, BOX = 200 + PAD * 2; // เผื่อขอบ เพราะบางท่ามีของยื่นออกนอกกรอบ 200×200

const filters = (k, f) => `
  <filter id="wob-line${k}" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="${f.line}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5"/>
  </filter>
  <filter id="wob-fill${k}" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="${f.fill}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="8"/>
  </filter>`;
const CLIP = `<clipPath id="frame"><rect x="${-PAD}" y="${-PAD}" width="${BOX}" height="${BOX - PAD}"/></clipPath>`;

// ดึงโค้ดวาดแมวออกจาก samples.html แล้วรันเพื่อเอารายการ cats
const html = readFileSync(src, 'utf8');
const a = html.indexOf('// ---------- ชิ้นส่วนพื้นฐาน ----------');
const b = html.indexOf("document.getElementById('heroCat')");
if (a < 0 || b < 0) throw new Error('หาโค้ดวาดแมวใน samples.html ไม่เจอ');
const cats = new Function(html.slice(a, b) + '; return cats;')();
if (cats.length !== SLUGS.length) throw new Error(`จำนวนแมว (${cats.length}) ไม่ตรงกับรายชื่อไฟล์ (${SLUGS.length}) — แก้ SLUGS ในสคริปต์`);

// ไฟล์ SVG เดี่ยวเป็น XML เข้มงวด ห้ามมี attribute ซ้ำ — เก็บตัวแรกไว้ เหมือนที่ HTML ทำใน samples.html
const dedupe = tag => {
  const seen = new Set();
  return tag.replace(/\s([\w:-]+)="[^"]*"/g, (m, k) => (seen.has(k) ? '' : (seen.add(k), m)));
};
const paint = (svg, c) => svg
  .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  .replace(/<[a-zA-Z][^>]*>/g, dedupe)
  .replaceAll('currentColor', c.ink)
  .replaceAll('var(--cat-white)', c.white)
  .replaceAll('var(--cat-ear)', c.ear)
  .replaceAll('var(--cat)', c.cat)
  .replaceAll('var(--paper)', c.paper);
const clipped = (body, clip) => `<g${clip ? ' clip-path="url(#frame)"' : ''}>${body}</g>`;

const single = (svg, c, clip) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${BOX} ${BOX}">\n<defs>${filters('', FRAMES[0])}\n${CLIP}</defs>\n${clipped(paint(svg, c), clip)}\n</svg>\n`;

const sprite = (svg, c, clip) => {
  const body = paint(svg, c);
  const frames = FRAMES.map((f, k) =>
    `<g transform="translate(${BOX * k} 0)"><g transform="${f.tf}">${clipped(body.replaceAll('url(#wob-line)', `url(#wob-line${k})`).replaceAll('url(#wob-fill)', `url(#wob-fill${k})`), clip)}</g></g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${BOX * FRAMES.length} ${BOX}">\n<defs>${FRAMES.map((f, k) => filters(k, f)).join('')}\n${CLIP}</defs>\n${frames.join('\n')}\n</svg>\n`;
};

// --resume: ทำต่อจากรอบที่ค้าง (ไม่ลบของเดิม สร้างเฉพาะ PNG ที่ยังไม่มี)
if (!process.argv.includes('--resume')) for (const sub of ['svg', 'png', 'sprites']) if (existsSync(join(out, sub))) rmSync(join(out, sub), { recursive: true });
const jobs = []; // { svg, png, w, h }
for (const [variant, colors] of Object.entries(VARIANTS)) {
  mkdirSync(join(out, 'svg', variant), { recursive: true });
  mkdirSync(join(out, 'sprites', 'svg', variant), { recursive: true });
  cats.forEach((cat, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${SLUGS[i]}`;
    const clip = SLUGS[i] === 'peek';
    const one = join(out, 'svg', variant, name + '.svg');
    writeFileSync(one, single(cat.svg, colors, clip));
    jobs.push({ svg: one, png: join(out, 'png', variant, name + '.png'), w: 512, h: 512 });
    const sheet = join(out, 'sprites', 'svg', variant, name + '.svg');
    writeFileSync(sheet, sprite(cat.svg, colors, clip));
    jobs.push({ svg: sheet, png: join(out, 'sprites', 'png', variant, name + '.png'), w: 512 * FRAMES.length, h: 512 });
  });
}
console.log(`SVG: ${jobs.length} ไฟล์`);

writeFileSync(join(out, 'README.md'),
`# สติกเกอร์แมว (${cats.length} ท่า)

สร้างจาก \`docs/design/samples.html\` ด้วย \`node scripts/export-stickers.mjs\` — อย่าแก้ไฟล์ในโฟลเดอร์นี้ตรงๆ ให้แก้ต้นฉบับแล้วรันใหม่

## ภาพนิ่ง
- \`svg/color\` \`png/color\` — ลงสี ใช้บนพื้นสว่าง
- \`svg/line\` \`png/line\` — เส้นดำ ตัวขาว
- \`svg/line-white\` \`png/line-white\` — เส้นขาว ใช้บนพื้นมืด

PNG ขนาด 512×512 พื้นโปร่งใส

**ใน git มีเฉพาะ \`svg/\`** — โฟลเดอร์ \`png/\` และ \`sprites/\` เป็นไฟล์ภาพขนาดใหญ่ที่สร้างใหม่ได้ จึงอยู่ในเครื่องเท่านั้น (รันสคริปต์ด้านบนเพื่อสร้าง ต้องมี Edge หรือ Chrome)

## แมวดุ๊กดิ๊ก (sprite ${FRAMES.length} เฟรม)
- \`sprites/png/<ชุดสี>/\` — แผ่นภาพ ${512 * FRAMES.length}×512 เรียง ${FRAMES.length} เฟรมแนวนอน พื้นโปร่งใส
- \`sprites/svg/<ชุดสี>/\` — แบบเวกเตอร์ของแผ่นเดียวกัน
- \`sprites/demo.html\` — เปิดดูทุกตัวขยับ

วิธีใช้บนเว็บ:

\`\`\`css
.cat { --s: 120px; width: var(--s); height: var(--s);
  background: url(sprites/png/color/01-standing.png) 0 0 / ${FRAMES.length * 100}% 100% no-repeat;
  animation: cat-wiggle .6s steps(${FRAMES.length}) infinite; }
@keyframes cat-wiggle { to { background-position-x: calc(var(--s) * -${FRAMES.length}); } }
@media (prefers-reduced-motion: reduce) { .cat { animation: none; } }
\`\`\`

## รายการ

| # | ไฟล์ | ชื่อ | ใช้ที่ |
|---|---|---|---|
${cats.map((c, i) => `| ${i + 1} | \`${String(i + 1).padStart(2, '0')}-${SLUGS[i]}\` | ${c.name} | ${c.use} |`).join('\n')}
`);

// หน้า demo ของ sprite
writeFileSync(join(out, 'sprites', 'demo.html'),
`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>แมวดุ๊กดิ๊ก</title>
<style>
  body { margin: 0; padding: 20px; font: 14px/1.5 system-ui, sans-serif; background: #fff; color: #171717; }
  body.dark { background: #161514; color: #F2EFEA; }
  button { font: inherit; padding: 6px 14px; margin: 0 6px 16px 0; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; }
  figure { margin: 0; text-align: center; }
  .cat { --s: 120px; width: var(--s); height: var(--s); margin: 0 auto; background-size: ${FRAMES.length * 100}% 100%; background-repeat: no-repeat;
    animation: cat-wiggle .6s steps(${FRAMES.length}) infinite; }
  .still .cat { animation: none; }
  @keyframes cat-wiggle { to { background-position-x: calc(var(--s) * -${FRAMES.length}); } }
  @media (prefers-reduced-motion: reduce) { .cat { animation: none; } }
</style></head><body>
<button onclick="setV('color',false)">ลงสี</button><button onclick="setV('line',false)">เส้นดำ</button><button onclick="setV('line-white',true)">เส้นขาว (พื้นมืด)</button><button onclick="document.body.classList.toggle('still')">หยุด/เล่น</button>
<div class="grid">${cats.map((c, i) => `<figure><div class="cat" data-n="${String(i + 1).padStart(2, '0')}-${SLUGS[i]}"></div><figcaption>${c.name}</figcaption></figure>`).join('')}</div>
<script>
  function setV(v, dark) { document.body.classList.toggle('dark', dark);
    document.querySelectorAll('.cat').forEach((e, i) => { e.style.backgroundImage = 'url(png/' + v + '/' + e.dataset.n + '.png)'; e.style.animationDelay = (-(i % 5) * 0.13) + 's'; }); }
  setV('color', false);
</script></body></html>
`);

// PNG: ใช้ Edge/Chrome แบบ headless ถ่ายแต่ละ SVG (ได้ผลเหมือนที่เห็นในเบราว์เซอร์)
if (!process.argv.includes('--no-png')) {
  const browser = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
  ].find(existsSync);
  if (!browser) { console.log('ไม่พบ Edge/Chrome — ข้าม PNG'); process.exit(0); }
  const shoot = j => {
    mkdirSync(dirname(j.png), { recursive: true });
    try {
      execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${j.w},${j.h}`,
        '--default-background-color=00000000', `--screenshot=${j.png}`, pathToFileURL(j.svg).href], { stdio: 'ignore', timeout: 30000 });
    } catch { /* ลองใหม่ในรอบถัดไป */ }
  };
  // เบราว์เซอร์ headless พลาดบางไฟล์เป็นครั้งคราว — ลองซ้ำเฉพาะไฟล์ที่ยังไม่มี สูงสุด 3 รอบ
  for (let round = 0; round < 3; round++) jobs.filter(j => !existsSync(j.png)).forEach(shoot);
  console.log(`PNG: ${jobs.filter(j => existsSync(j.png)).length}/${jobs.length} ไฟล์`);
}
