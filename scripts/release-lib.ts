// logic ล้วนของระบบออกรุ่น (ไม่มี I/O) — ใช้โดย scripts/release.ts, scripts/release-notes.ts และเทสต์
// รูปแบบ CHANGELOG: Keep a Changelog 1.1.0 (https://keepachangelog.com/en/1.1.0/)

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const REPO_URL = "https://github.com/ieatbaozi-stack/fatcatfit";

export function assertVersion(version: string): void {
  if (!SEMVER.test(version)) throw new Error(`เลขรุ่นต้องเป็น X.Y.Z (ไม่มี v นำหน้า ไม่มี pre-release): "${version}"`);
}

export function compareSemver(a: string, b: string): number {
  assertVersion(a);
  assertVersion(b);
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! < pb[i]! ? -1 : 1;
  }
  return 0;
}

type Section = { heading: string; start: number; end: number };

/** หา "## [..." ทุกหัวข้อระดับ 2 (ตำแหน่งเป็นบรรทัด) · end = บรรทัดก่อนหัวข้อถัดไปหรือก่อนบล็อกลิงก์ท้ายไฟล์ */
function sections(lines: string[]): Section[] {
  const heads: Array<{ heading: string; start: number }> = [];
  lines.forEach((line, i) => {
    if (/^## \[/.test(line)) heads.push({ heading: line, start: i });
  });
  let linkBlock = lines.findIndex((l) => /^\[[^\]]+\]:\s*\S+/.test(l));
  if (linkBlock === -1) linkBlock = lines.length;
  return heads.map((h, idx) => ({ ...h, end: Math.min(heads[idx + 1]?.start ?? lines.length, linkBlock > h.start ? linkBlock : lines.length) }));
}

function bodyOf(lines: string[], s: Section): string {
  return lines.slice(s.start + 1, s.end).join("\n").trim();
}

/** มีรายการจริงใต้หัวข้อไหม (หัวข้อย่อย ### ว่างๆ ไม่นับ) */
export function hasEntries(body: string): boolean {
  return body.split("\n").some((l) => l.trim() !== "" && !/^###\s/.test(l));
}

export function extractReleaseNotes(changelog: string, version: string): string | null {
  assertVersion(version);
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const s = sections(lines).find((x) => x.heading.startsWith(`## [${version}]`));
  if (!s) return null;
  const body = bodyOf(lines, s);
  return body === "" ? null : body;
}

export function unreleasedBody(changelog: string): string | null {
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const s = sections(lines).find((x) => x.heading.trim() === "## [Unreleased]");
  return s ? bodyOf(lines, s) : null;
}

/** ย้ายเนื้อหา [Unreleased] เป็น [version] - date และเปิด [Unreleased] เปล่าไว้ใหม่ */
export function applyRelease(changelog: string, version: string, date: string): string {
  assertVersion(version);
  if (!DATE.test(date)) throw new Error(`วันที่ต้องเป็น YYYY-MM-DD: "${date}"`);
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const all = sections(lines);
  const unreleased = all.find((s) => s.heading.trim() === "## [Unreleased]");
  if (!unreleased) throw new Error("ไม่พบหัวข้อ ## [Unreleased] ใน CHANGELOG.md");
  if (all.some((s) => s.heading.startsWith(`## [${version}]`))) throw new Error(`CHANGELOG.md มีรุ่น ${version} อยู่แล้ว`);
  const body = bodyOf(lines, unreleased);
  if (!hasEntries(body)) throw new Error("[Unreleased] ว่าง — ไม่มีอะไรให้ออกรุ่น");

  const previous = all.map((s) => /^## \[(\d+\.\d+\.\d+)\]/.exec(s.heading)?.[1]).find((v): v is string => v !== undefined);
  if (previous && compareSemver(version, previous) <= 0) throw new Error(`รุ่น ${version} ต้องสูงกว่ารุ่นล่าสุดใน CHANGELOG (${previous})`);

  const out = [
    ...lines.slice(0, unreleased.start + 1),
    "",
    `## [${version}] - ${date}`,
    "",
    body,
    "",
    ...lines.slice(unreleased.end).filter((_, i, rest) => !(i === 0 && rest[0] === "")),
  ];
  let text = out.join("\n").replace(/\n{3,}/g, "\n\n");

  // ลิงก์อ้างอิงท้ายไฟล์ (ถ้ามี)
  if (/^\[Unreleased\]:/m.test(text)) {
    const versionLink = previous ? `[${version}]: ${REPO_URL}/compare/v${previous}...v${version}` : `[${version}]: ${REPO_URL}/releases/tag/v${version}`;
    text = text.replace(/^\[Unreleased\]:.*$/m, `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD\n${versionLink}`);
  }
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** แก้ "version" ตัวแรกในข้อความ JSON โดยไม่จัดรูปแบบไฟล์ใหม่ */
export function setJsonVersion(jsonText: string, version: string): string {
  assertVersion(version);
  const re = /("version"\s*:\s*")[^"]*(")/;
  if (!re.test(jsonText)) throw new Error('ไม่พบ "version" ในไฟล์ JSON');
  return jsonText.replace(re, `$1${version}$2`);
}

/** package-lock.json มี version 2 จุด: ราก และ packages[""] */
export function setLockVersion(lockText: string, version: string): string {
  assertVersion(version);
  const data = JSON.parse(lockText) as { version?: string; packages?: Record<string, { version?: string }> };
  const eol = lockText.endsWith("\n") ? "\n" : "";
  if (JSON.stringify(data, null, 2) + eol !== lockText.replace(/\r\n/g, "\n")) {
    throw new Error("รูปแบบ package-lock.json ไม่ตรงกับที่ npm เขียน — ไม่แก้อัตโนมัติ (รัน npm install --package-lock-only หลังแก้ package.json)");
  }
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  return JSON.stringify(data, null, 2) + eol;
}

/** เลขรุ่นใน package.json ต้องมีส่วนของตัวเองใน CHANGELOG (ยกเว้นก่อนออกรุ่นแรก 0.0.0) */
export function checkVersionConsistency(pkgVersion: string, changelog: string): string[] {
  const problems: string[] = [];
  if (unreleasedBody(changelog) === null) problems.push("CHANGELOG.md ไม่มีหัวข้อ ## [Unreleased]");
  if (pkgVersion !== "0.0.0" && extractReleaseNotes(changelog, pkgVersion) === null) {
    problems.push(`package.json เป็น ${pkgVersion} แต่ CHANGELOG.md ไม่มีหัวข้อ ## [${pkgVersion}] ที่มีเนื้อหา`);
  }
  return problems;
}
