// ตรวจคลังท่า (R2 · contract เกณฑ์ผ่านข้อ 3) — รัน: npx tsx scripts/seed-check.ts [content-dir]
// ล้มเมื่อ: ท่าเวท < 750 · คาร์ดิโอ+กีฬานอก 60–100 · id ไม่ใช่ UUID v5 ที่คำนวณได้/ซ้ำ · name ซ้ำ · ขาด name_th/source/license/attribution
//         · หมวด/อุปกรณ์/track_type นอกรายการ · มีช่อง instructions/รูป · distance/incline ที่เป็นทีละข้าง
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkCatalog, DEFAULT_CONTENT_DIR, loadCatalog } from "./seed-lib";

export function runCheck(dir: string = DEFAULT_CONTENT_DIR): { ok: boolean; lines: string[] } {
  const { rows, errors } = loadCatalog(dir);
  const res = checkCatalog(rows, errors);
  const s = res.stats;
  const lines = [
    `คลังท่า: ${s.total} แถว · ท่าเวท ${s.weights} · คาร์ดิโอ ${s.cardio} · กีฬา ${s.sport}`,
    `แยกตามแหล่ง: ${Object.entries(s.bySource).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
    `แยกตาม track_type: ${Object.entries(s.byTrackType).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
    `แยกตามหมวด: ${Object.entries(s.byCategory).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
    ...res.warnings.map((w) => `เตือน: ${w}`),
    ...res.errors.map((e) => `ผิด: ${e}`),
    res.errors.length ? `ไม่ผ่าน (${res.errors.length} ข้อ)` : "ผ่าน",
  ];
  return { ok: res.errors.length === 0, lines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = runCheck(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(r.lines.join("\n"));
  process.exit(r.ok ? 0 : 1);
}
