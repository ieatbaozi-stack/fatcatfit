// พิมพ์เนื้อหา release notes ของรุ่นหนึ่งจาก CHANGELOG.md ออก stdout (ใช้ใน release.yml)
// ใช้:  npx tsx scripts/release-notes.ts 0.1.0   · ไม่พบรุ่นหรือเนื้อหาว่าง = exit 1
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertVersion, extractReleaseNotes } from "./release-lib";

const version = process.argv[2] ?? "";
try {
  assertVersion(version);
  const notes = extractReleaseNotes(readFileSync(path.resolve(import.meta.dirname, "..", "CHANGELOG.md"), "utf8"), version);
  if (notes === null) {
    console.error(`release-notes: CHANGELOG.md ไม่มีหัวข้อ ## [${version}] ที่มีเนื้อหา`);
    process.exit(1);
  }
  process.stdout.write(`${notes}\n`);
} catch (e) {
  console.error(`release-notes: ${(e as Error).message}`);
  process.exit(1);
}
