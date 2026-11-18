// ส่งออกแมวทุกท่าจาก docs/design/samples.html เป็นไฟล์สติกเกอร์ภาพนิ่งแยกตัว
// และข้อมูลท่าของ component <Cat> (src/components/doodle/poses.generated.ts: ภาพนิ่ง + แมวขยับจริง 5 เฟรมจาก scripts/sprites/rigs.mjs)
// แผ่น sprite 5 เฟรม (PNG) สร้างแยกด้วย node scripts/sprites/build.mjs → assets/stickers/motion/
// ใช้: node scripts/export-stickers.mjs          (poses + SVG + PNG)
//      node scripts/export-stickers.mjs --no-png (poses + SVG อย่างเดียว)
//      node scripts/export-stickers.mjs --resume (ทำ PNG ต่อจากรอบที่ค้าง)
// ต้นฉบับของภาพอยู่ใน samples.html ที่เดียว — แก้ที่นั่นแล้วรันสคริปต์นี้ใหม่ (ไอคอนแอป: scripts/export-icons.mjs)
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SAMPLES, POSES_FILE, SLUGS, VARIANTS, loadCats, stickerSVG, stickerName, buildPosesModule } from './cat-source.mjs';

const out = join(ROOT, 'assets', 'stickers');
const html = readFileSync(SAMPLES, 'utf8');
const cats = loadCats(html);

// ข้อมูลท่าของ component — commit ไฟล์นี้ (เทสต์ตรวจว่าตรงกับต้นฉบับ)
mkdirSync(dirname(POSES_FILE), { recursive: true });
writeFileSync(POSES_FILE, buildPosesModule(html));
console.log(`poses: ${POSES_FILE}`);

// --resume: ทำต่อจากรอบที่ค้าง (ไม่ลบของเดิม สร้างเฉพาะ PNG ที่ยังไม่มี)
if (!process.argv.includes('--resume')) for (const sub of ['svg', 'png']) if (existsSync(join(out, sub))) rmSync(join(out, sub), { recursive: true });
const jobs = []; // { svg, png, w, h }
for (const [variant, colors] of Object.entries(VARIANTS)) {
  mkdirSync(join(out, 'svg', variant), { recursive: true });
  cats.forEach((cat, i) => {
    const name = stickerName(i);
    const clip = SLUGS[i] === 'peek';
    const one = join(out, 'svg', variant, name + '.svg');
    writeFileSync(one, stickerSVG(cat.svg, colors, clip));
    jobs.push({ svg: one, png: join(out, 'png', variant, name + '.png'), w: 512, h: 512 });
  });
}
console.log(`SVG: ${jobs.length} ไฟล์`);

writeFileSync(join(out, 'README.md'),
`# สติกเกอร์แมว (${cats.length} ท่า)

สร้างจาก \`docs/design/samples.html\` ด้วย \`node scripts/export-stickers.mjs\` — อย่าแก้ไฟล์ในโฟลเดอร์นี้ตรงๆ ให้แก้ต้นฉบับแล้วรันใหม่

**ในแอปใช้ component แทนไฟล์เหล่านี้:** \`import { Cat } from "@/components/doodle"\` → \`<Cat pose="standing" size={120} motion title="..." />\` (สคริปต์เดียวกันสร้าง \`src/components/doodle/poses.generated.ts\` ซึ่งมีทั้งภาพนิ่งและแมวขยับจริง 5 เฟรม) · ไอคอนแอปสร้างด้วย \`node scripts/export-icons.mjs\`

## ภาพนิ่ง
- \`svg/color\` \`png/color\` — ลงสี ใช้บนพื้นสว่าง
- \`svg/line\` \`png/line\` — เส้นดำ ตัวขาว
- \`svg/line-white\` \`png/line-white\` — เส้นขาว ใช้บนพื้นมืด

PNG ขนาด 512×512 พื้นโปร่งใส

**ใน git มีเฉพาะ \`svg/\`** — โฟลเดอร์ \`png/\` และ \`motion/\` เป็นไฟล์ภาพขนาดใหญ่ที่สร้างใหม่ได้ จึงอยู่ในเครื่องเท่านั้น (ต้องมี Edge หรือ Chrome)

## แมวขยับจริง (sprite 5 เฟรม)
- สคริปต์และวิธีแก้ท่าอยู่ที่ \`scripts/sprites/\` (ดู \`scripts/sprites/README.md\`) · ท่าขยับของทุกตัวอยู่ใน \`scripts/sprites/rigs.mjs\`
- \`node scripts/sprites/build.mjs\` สร้างแผ่น 2560×512 (5 เฟรม × 512 px) ทั้ง 3 ชุดสีไว้ที่ \`motion/png/<ชุดสี>/\` และ \`motion/svg/<ชุดสี>/\` · \`node scripts/sprites/demo.mjs\` สร้าง \`motion/demo.html\`
- ในแอปไม่ใช้ไฟล์ PNG — \`<Cat motion>\` วาดท่าเดียวกันเป็น SVG inline

## รายการ

| # | ไฟล์ | ชื่อ | ใช้ที่ |
|---|---|---|---|
${cats.map((c, i) => `| ${i + 1} | \`${stickerName(i)}\` | ${c.name} | ${c.use} |`).join('\n')}
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
