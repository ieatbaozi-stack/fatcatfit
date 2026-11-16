// ตัวช่วยของ Lead: ตั้งเลขรุ่นใน CHANGELOG.md + package.json (+ package-lock.json)
// ใช้:  npx tsx scripts/release.ts 0.1.0 [--date 2026-11-20] [--dry-run]
// ไม่ commit ไม่ tag ไม่ push — tag และ GitHub release สร้างโดย .github/workflows/release.yml หลัง merge เข้า main
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyRelease, assertVersion, compareSemver, setJsonVersion, setLockVersion } from "./release-lib";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dateIdx = args.indexOf("--date");
const date = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);
const version = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--date");

function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

if (!version || !date) fail("ใช้: npx tsx scripts/release.ts <X.Y.Z> [--date YYYY-MM-DD] [--dry-run]");

try {
  assertVersion(version);
  const read = (f: string) => readFileSync(path.join(root, f), "utf8");
  const pkgText = read("package.json");
  const current = (JSON.parse(pkgText) as { version: string }).version;
  if (compareSemver(version, current) <= 0) fail(`รุ่นใหม่ ${version} ต้องสูงกว่าที่ package.json มีอยู่ (${current})`);

  const next: Record<string, string> = {
    "CHANGELOG.md": applyRelease(read("CHANGELOG.md"), version, date),
    "package.json": setJsonVersion(pkgText, version),
  };
  try {
    next["package-lock.json"] = setLockVersion(read("package-lock.json"), version);
  } catch (e) {
    console.warn(`release: ข้าม package-lock.json — ${(e as Error).message}`);
  }

  for (const [file, text] of Object.entries(next)) {
    if (!dryRun) writeFileSync(path.join(root, file), text);
    console.log(`release: ${dryRun ? "(dry-run) จะแก้" : "แก้แล้ว"} ${file}`);
  }
  console.log(`release: ${current} -> ${version} (${date}) · ตรวจ git diff แล้ว commit เอง — ยังไม่ได้ tag/push`);
} catch (e) {
  fail((e as Error).message);
}
