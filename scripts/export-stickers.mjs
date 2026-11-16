// ส่งออกแมวทุกท่าจาก docs/design/samples.html เป็นไฟล์สติกเกอร์แยกตัว + sprite ดุ๊กดิ๊ก 3 เฟรม
// และข้อมูลท่าของ component <Cat> (src/components/doodle/poses.generated.ts)
// ใช้: node scripts/export-stickers.mjs          (poses + SVG + PNG)
//      node scripts/export-stickers.mjs --no-png (poses + SVG อย่างเดียว)
//      node scripts/export-stickers.mjs --resume (ทำ PNG ต่อจากรอบที่ค้าง)
// ต้นฉบับของภาพอยู่ใน samples.html ที่เดียว — แก้ที่นั่นแล้วรันสคริปต์นี้ใหม่ (ไอคอนแอป: scripts/export-icons.mjs)
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SAMPLES, POSES_FILE, SLUGS, FRAMES, VARIANTS, loadCats, paint, filters, buildPosesModule } from './cat-source.mjs';

const out = join(ROOT, 'assets', 'stickers');
const html = readFileSync(SAMPLES, 'utf8');
const cats = loadCats(html);

// ข้อมูลท่าของ component — commit ไฟล์นี้ (เทสต์ตรวจว่าตรงกับต้นฉบับ)
mkdirSync(dirname(POSES_FILE), { recursive: true });
writeFileSync(POSES_FILE, buildPosesModule(html));
console.log(`poses: ${POSES_FILE}`);

const PAD = 16, BOX = 200 + PAD * 2; // เผื่อขอบ เพราะบางท่ามีของยื่นออกนอกกรอบ 200×200
const CLIP = `<clipPath id="frame"><rect x="${-PAD}" y="${-PAD}" width="${BOX}" height="${BOX - PAD}"/></clipPath>`;
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

**ในแอปใช้ component แทนไฟล์เหล่านี้:** \`import { Cat } from "@/components/doodle"\` → \`<Cat pose="standing" size={120} wiggle title="..." />\` (สคริปต์เดียวกันสร้าง \`src/components/doodle/poses.generated.ts\`) · ไอคอนแอปสร้างด้วย \`node scripts/export-icons.mjs\`

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
