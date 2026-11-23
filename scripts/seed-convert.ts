// แปลงชุดข้อมูลต้นทาง → ไฟล์คลัง content/exercises/*.json + เอกสารให้ตรวจใน docs/content/ (R2 · ADR 0008 ข้อ 4)
//
// ใช้: npx tsx scripts/seed-convert.ts <path/to/exercises.json> --commit <sha40> [--content-dir DIR] [--docs-dir DIR]
//   · อ่านเฉพาะ id name force equipment category primaryMuscles ของต้นทาง (ไม่อ่าน/ไม่เก็บ instructions, images)
//   · ไฟล์ดิบอยู่นอก repo (ดาวน์โหลดจาก commit ที่ล็อก) · สคริปต์ไม่รันโค้ดในนั้น
//   · แถวที่มีอยู่แล้ว (จับด้วย source_ref): คง id, name_th, search_terms เดิม (แก้มือในไฟล์คลังได้) · คำนวณหมวด/อุปกรณ์/track_type ใหม่ + overrides.json
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ALLOWED_SOURCES,
  KNOWN_RAW_CATEGORIES,
  KNOWN_RAW_EQUIPMENT,
  KNOWN_RAW_MUSCLES,
  mapRaw,
  type CatalogFile,
  type FileRow,
  type Overrides,
  type RawExercise,
} from "./seed-lib";
import { buildSearchTerms, composeNameTh } from "./seed-name-th";
import { OWN_ENTRIES } from "./seed-own-list";
import { EXERCISE_LIMITS } from "../src/lib/data/shared/exercise-meta";

export const UPSTREAM_URL = "https://github.com/yuhonas/free-exercise-db";

type Opts = { rawPath: string; commit: string; contentDir: string; docsDir: string };

const readJson = <T>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback);

/** หนึ่งแถวต่อบรรทัด — diff ใน git อ่านง่าย */
export function serializeFile(f: CatalogFile): string {
  const { exercises, ...meta } = f;
  const head = JSON.stringify(meta, null, 2).replace(/\n}$/, "");
  return `${head},\n  "exercises": [\n${exercises.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`;
}

const rowOrder = (a: FileRow, b: FileRow) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en");

export function convertFreeExerciseDb(raw: RawExercise[], existing: FileRow[], overrides: Overrides): { rows: FileRow[]; missingTokens: Map<string, string[]>; tooLong: string[] } {
  const byRef = new Map(existing.map((r) => [r.source_ref, r]));
  const missingTokens = new Map<string, string[]>();
  const tooLong: string[] = [];
  const rows: FileRow[] = [];
  for (const r of raw) {
    for (const [what, v, known] of [
      ["category", r.category, KNOWN_RAW_CATEGORIES],
      ["equipment", r.equipment, KNOWN_RAW_EQUIPMENT],
      ["primaryMuscles", r.primaryMuscles?.[0], KNOWN_RAW_MUSCLES],
    ] as const) {
      if (v && !known.includes(v)) throw new Error(`ค่า ${what} ของต้นทางที่ไม่รู้จัก "${v}" (${r.id}) — ตรวจ schema.json ที่ commit ที่ล็อก แล้วแก้กติกาแมป`);
    }
    const mapped = mapRaw(r, overrides);
    if ([...mapped.name].length > EXERCISE_LIMITS.nameMax) tooLong.push(`${r.id}: ${mapped.name}`);
    const prev = byRef.get(r.id);
    let nameTh = prev?.name_th;
    if (!nameTh) {
      const c = composeNameTh(r.name);
      if (c.missing.length) missingTokens.set(r.name, c.missing);
      nameTh = c.text;
    }
    rows.push({
      id: prev?.id ?? randomUUID(),
      source_ref: r.id,
      ...mapped,
      name_th: nameTh,
      search_terms: prev?.search_terms ?? buildSearchTerms(r.name, nameTh),
    });
  }
  rows.sort(rowOrder);
  return { rows, missingTokens, tooLong };
}

export function convertOwn(existing: FileRow[]): FileRow[] {
  const byRef = new Map(existing.map((r) => [r.source_ref, r]));
  const rows = OWN_ENTRIES.map<FileRow>((e) => {
    const prev = byRef.get(e.slug);
    return {
      id: prev?.id ?? randomUUID(),
      source_ref: e.slug,
      name: e.name,
      name_th: e.name_th,
      search_terms: [...(e.terms ?? [])],
      track_type: e.track_type,
      load_mode: "external",
      is_unilateral: false,
      category: e.category,
      equipment: null,
    };
  });
  rows.sort(rowOrder);
  return rows;
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|");
}

export function writeDocs(docsDir: string, fe: FileRow[], own: FileRow[], overrides: Overrides): void {
  mkdirSync(docsDir, { recursive: true });
  const header = (title: string, intro: string[]) => `# ${title}\n\n> สร้างโดย \`scripts/seed-convert.ts\` — อย่าแก้ไฟล์นี้ด้วยมือ (แก้ที่ไฟล์คลังใน content/exercises/ แล้วรันแปลงใหม่)\n\n${intro.join("\n")}\n\n`;

  const cs = [...fe.filter((r) => r.category === "cardio" || r.category === "sport"), ...own].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  writeFileSync(
    path.join(docsDir, "CARDIO_SPORT_LIST.md"),
    header("รายการคาร์ดิโอและกีฬา (R2 · contract D2)", [
      `รวม ${cs.length} รายการ (เป้า 60–100) · ทีมเขียนเองเป็นชื่อกิจกรรมทั่วไป + ท่าหมวด cardio ของ free-exercise-db · ไม่มีค่า MET (D4 ก)`,
      "boss: ดูแล้วอยากเพิ่ม/ตัดรายการไหน บอก Lead ได้เลย (แก้ที่ `scripts/seed-own-list.ts`)",
      "ชนิดการจด: duration = เวลา · distance_duration = ระยะ+เวลา · incline_speed_duration = ลู่วิ่ง ความชัน+ความเร็ว+เวลา",
    ]) +
      "| หมวด | ชื่ออังกฤษ | ชื่อไทย | ชนิดการจด | ที่มา |\n|---|---|---|---|---|\n" +
      cs
        .map((r) => `| ${r.category === "cardio" ? "คาร์ดิโอ" : "กีฬา"} | ${mdEscape(r.name)} | ${mdEscape(r.name_th)} | ${r.track_type} | ${own.includes(r) ? "ทีมเขียนเอง" : "free-exercise-db"} |`)
        .join("\n") +
      "\n",
  );

  const all = [...fe, ...own].sort(rowOrder);
  writeFileSync(
    path.join(docsDir, "NAME_TH_CHECKLIST.md"),
    header("เช็กลิสต์ตรวจชื่อไทยรอบสอง (R2 · contract D3)", [
      `${all.length} แถว · ตรวจในเซสชันใหม่ ทีละแถว ตามเกณฑ์ 4 ข้อ แก้ที่ช่อง \`name_th\` / \`search_terms\` ในไฟล์ \`content/exercises/*.json\` โดยตรง (ตัวแปลงเก็บค่าที่แก้มือไว้)`,
      "",
      "เกณฑ์: (1) สะกดทับศัพท์สม่ำเสมอทั้งคลัง (เช่น เพรส เรส โรว์ เคิร์ล ลิฟต์ สควอท) (2) ตรงกับท่าจริง ไม่ใช่ท่าใกล้เคียง (3) ไม่แปลตรงตัวจนคนยิมไม่พูด (4) ยาวไม่เกิน 60 ตัว ไม่ซ้ำกับแถวอื่น",
      "ขีดสถานะ: ✅ ถูก · ✏️ แก้แล้ว · ❓ ไม่แน่ใจ (ส่งให้ Lead) — เติมในคอลัมน์ซ้ายสุด",
    ]) +
      "| ตรวจ | ชื่ออังกฤษ | ชื่อไทย | คำค้น |\n|---|---|---|---|\n" +
      all.map((r) => `|  | ${mdEscape(r.name)} | ${mdEscape(r.name_th)} | ${mdEscape(r.search_terms.join(", "))} |`).join("\n") +
      "\n",
  );

  const ovr = Object.entries(overrides);
  const nonDefault = fe.filter((r) => !(r.track_type === "weight_reps" && r.load_mode === "external"));
  writeFileSync(
    path.join(docsDir, "TRACK_TYPE_REVIEW.md"),
    header("รายการแมป track_type ที่ต้องดู (R2 · ADR 0008 ข้อ 4)", [
      "แก้หลังมีประวัติใน R3 ไม่ได้ — ตรวจให้ถูกก่อน merge",
      "",
      `## รายการยกเว้นจากกติกา (${ovr.length} แถว · แก้ใน \`content/exercises/overrides.json\`)`,
    ]) +
      (ovr.length
        ? "| source_ref | ช่องที่แก้ | เหตุผล |\n|---|---|---|\n" +
          ovr
            .map(([k, v]) => {
              const { reason, ...f } = v;
              return `| ${k} | ${mdEscape(JSON.stringify(f))} | ${mdEscape(reason)} |`;
            })
            .join("\n")
        : "(ไม่มี)") +
      `\n\n## ท่า free-exercise-db ที่ไม่ใช่ weight_reps/external (${nonDefault.length} แถว)\n\n| ชื่อ | track_type | load_mode | ข้างเดียว |\n|---|---|---|---|\n` +
      nonDefault.map((r) => `| ${mdEscape(r.name)} | ${r.track_type} | ${r.load_mode} | ${r.is_unilateral ? "ใช่" : ""} |`).join("\n") +
      "\n",
  );
}

export function runConvert(opts: Opts): { feCount: number; ownCount: number; tooLong: string[]; missing: Map<string, string[]> } {
  const feFile = path.join(opts.contentDir, "free-exercise-db.json");
  const ownFile = path.join(opts.contentDir, "fatcatfit.json");
  const overrides = readJson<Overrides>(path.join(opts.contentDir, "overrides.json"), {});
  const rawAll = JSON.parse(readFileSync(opts.rawPath, "utf8")) as RawExercise[];
  // เก็บเฉพาะช่องที่ใช้ — ไม่ถือ instructions/images ต่อ
  const raw = rawAll.map<RawExercise>((r) => ({ id: r.id, name: r.name, force: r.force ?? null, equipment: r.equipment ?? null, category: r.category, primaryMuscles: r.primaryMuscles }));

  const prevFe = readJson<CatalogFile | null>(feFile, null)?.exercises ?? [];
  const prevOwn = readJson<CatalogFile | null>(ownFile, null)?.exercises ?? [];
  const fe = convertFreeExerciseDb(raw, prevFe, overrides);
  if (fe.tooLong.length || fe.missingTokens.size) return { feCount: 0, ownCount: 0, tooLong: fe.tooLong, missing: fe.missingTokens };
  const own = convertOwn(prevOwn);

  const feMeta = ALLOWED_SOURCES["free-exercise-db"]!;
  const ownMeta = ALLOWED_SOURCES["fatcatfit"]!;
  mkdirSync(opts.contentDir, { recursive: true });
  writeFileSync(feFile, serializeFile({ source_dataset: "free-exercise-db", license: feMeta.license, attribution: feMeta.attribution, upstream_commit: opts.commit, upstream_url: UPSTREAM_URL, exercises: fe.rows }));
  writeFileSync(ownFile, serializeFile({ source_dataset: "fatcatfit", license: ownMeta.license, attribution: ownMeta.attribution, upstream_commit: null, upstream_url: null, exercises: own }));
  if (!existsSync(path.join(opts.contentDir, "overrides.json"))) writeFileSync(path.join(opts.contentDir, "overrides.json"), "{}\n");
  writeDocs(opts.docsDir, fe.rows, own, overrides);
  return { feCount: fe.rows.length, ownCount: own.length, tooLong: [], missing: new Map() };
}

function main(): void {
  const args = process.argv.slice(2);
  const flag = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const rawPath = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const commit = flag("--commit");
  if (!rawPath || !commit || !/^[0-9a-f]{40}$/.test(commit)) {
    console.error("ใช้: tsx scripts/seed-convert.ts <exercises.json> --commit <sha 40 ตัว> [--content-dir DIR] [--docs-dir DIR]");
    process.exit(2);
  }
  const res = runConvert({
    rawPath: path.resolve(rawPath),
    commit,
    contentDir: path.resolve(flag("--content-dir") ?? "content/exercises"),
    docsDir: path.resolve(flag("--docs-dir") ?? "docs/content"),
  });
  if (res.tooLong.length) {
    console.error(`ชื่อยาวเกิน ${EXERCISE_LIMITS.nameMax} ตัว ${res.tooLong.length} แถว (ย่อใน overrides.json ช่อง name):\n  ${res.tooLong.join("\n  ")}`);
    process.exit(1);
  }
  if (res.missing.size) {
    console.error(`คำที่ยังไม่มีในพจนานุกรม (${res.missing.size} ชื่อ):`);
    for (const [n, w] of res.missing) console.error(`  ${n} -> ${w.join(", ")}`);
    process.exit(1);
  }
  console.log(`seed-convert: free-exercise-db ${res.feCount} แถว · fatcatfit ${res.ownCount} แถว`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
