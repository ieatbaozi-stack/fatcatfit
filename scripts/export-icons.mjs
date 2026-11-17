// ไอคอนแอปจากแมวท่า standing (ลงสี) บนพื้นขาว — ต้นฉบับคือ docs/design/samples.html
// ใช้: node scripts/export-icons.mjs   (ต้องมี Edge หรือ Chrome — ถ่าย PNG แบบ headless เหมือน export-stickers.mjs)
// ผลลัพธ์ public/icons/: favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
import { writeFileSync, mkdirSync, existsSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT, STILL_SEEDS, VARIANTS, loadCats, paint, filters } from './cat-source.mjs';

const out = join(ROOT, 'public', 'icons');
const standing = loadCats()[0].svg; // ท่าแรกใน samples.html = ยืนเฉยๆ
const body = paint(standing, VARIANTS.color);
const BG = '#FFFFFF';

// จุดกลางของแมว standing ในกรอบ 200×200 (หูบนสุด y≈30 เท้าล่างสุด y≈191 ตัว x≈43–159 หาง x≈176)
// ขยับไปทางหางเล็กน้อยให้ตัวดูอยู่กลาง ส่วนหางยื่นออกขวา
const CX = 106, CY = 110;
// side = ด้านของกรอบที่มองเห็น (หน่วยเดียวกับภาพ 200×200) — ยิ่งมาก แมวยิ่งเล็ก
//  any      : แมวสูง ~76% ของภาพ
//  maskable : จุดไกลสุดของแมว (รวมเส้นและเส้นสั่น) ห่างจากกลาง ~102 หน่วย ต้องอยู่ในวงกลม safe zone
//             รัศมี 40% ของภาพ → side ≥ 255 · ใช้ 270 เผื่อขอบ
//  apple    : iOS ตัดมุมมนเอง เผื่อขอบมากกว่า any เล็กน้อย
//  favicon  : แสดงที่ 16px ต้องให้แมวเต็มกรอบที่สุด (พื้นขาวมุมมน)
const SIDE = { any: 220, maskable: 270, apple: 236, favicon: 200 };

const iconSvg = (side, { rounded = false } = {}) => {
  const x = CX - side / 2, y = CY - side / 2;
  const bg = rounded
    ? `<rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${side * 0.22}" fill="${BG}"/>`
    : `<rect x="${x - 1}" y="${y - 1}" width="${side + 2}" height="${side + 2}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}">
<defs>${filters('', STILL_SEEDS)}</defs>
${bg}
<g>${body}</g>
</svg>
`;
};

const browser = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].find(existsSync);
if (!browser) throw new Error('ไม่พบ Edge/Chrome — ต้องใช้ถ่ายภาพ PNG');

// อ่านขนาดจริงจากหัวไฟล์ PNG (IHDR)
const pngSize = file => {
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} ไม่ใช่ PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'fcf-icons-'));
try {
  writeFileSync(join(out, 'favicon.svg'), iconSvg(SIDE.favicon, { rounded: true }));

  const jobs = [
    { name: 'icon-192.png', size: 192, side: SIDE.any },
    { name: 'icon-512.png', size: 512, side: SIDE.any },
    { name: 'icon-maskable-512.png', size: 512, side: SIDE.maskable },
    { name: 'apple-touch-icon.png', size: 180, side: SIDE.apple }
  ];
  for (const j of jobs) {
    // หน้าต่าง headless มีความกว้างขั้นต่ำ (ขนาดเล็กอย่าง 180/192 จะได้ viewport ใหญ่กว่าที่ขอ)
    // จึงวาง SVG ขนาดพิกเซลตายตัวไว้มุมซ้ายบนของหน้า HTML แล้วถ่ายเฉพาะกรอบนั้น
    const svg = join(tmp, j.name.replace(/\.png$/, '.html'));
    const png = join(out, j.name);
    writeFileSync(svg, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${BG};overflow:hidden}svg{display:block;width:${j.size}px;height:${j.size}px}</style></head><body>${iconSvg(j.side)}</body></html>`);
    if (existsSync(png)) rmSync(png);
    // เบราว์เซอร์ headless พลาดเป็นครั้งคราว — ลองซ้ำสูงสุด 3 รอบ
    for (let round = 0; round < 3 && !existsSync(png); round++) {
      try {
        execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
          `--window-size=${j.size},${j.size}`, `--default-background-color=FFFFFFFF`, `--screenshot=${png}`, pathToFileURL(svg).href],
          { stdio: 'ignore', timeout: 30000 });
      } catch { /* ลองใหม่ */ }
    }
    if (!existsSync(png)) throw new Error(`สร้าง ${j.name} ไม่สำเร็จ`);
    const { w, h } = pngSize(png);
    if (w !== j.size || h !== j.size) throw new Error(`${j.name} ได้ ${w}×${h} ไม่ใช่ ${j.size}×${j.size}`);
    console.log(`${j.name} ${w}×${h}`);
  }
  console.log('favicon.svg');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
