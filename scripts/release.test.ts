import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyRelease, assertVersion, checkVersionConsistency, compareSemver, extractReleaseNotes, setJsonVersion, setLockVersion } from "./release-lib";

const root = path.resolve(import.meta.dirname, "..");

const BASE = `# Changelog

intro

## [Unreleased]

### Added

- อย่างหนึ่ง
- อีกอย่าง

### Fixed

- แก้บั๊ก

## [0.1.0] - 2026-11-20

### Added

- รุ่นแรก
`;

describe("assertVersion / compareSemver", () => {
  it("รับเฉพาะ X.Y.Z", () => {
    for (const ok of ["0.1.0", "1.12.3", "10.0.0"]) expect(() => assertVersion(ok)).not.toThrow();
    for (const bad of ["v0.1.0", "0.1", "1.0.0-rc.1", "01.0.0", "", "1.0.0 "]) expect(() => assertVersion(bad)).toThrow();
  });
  it("เทียบเลขเป็นตัวเลข ไม่ใช่ข้อความ", () => {
    expect(compareSemver("0.10.0", "0.9.0")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("0.1.9", "0.2.0")).toBe(-1);
  });
});

describe("applyRelease", () => {
  it("ย้ายเนื้อหา [Unreleased] เป็นรุ่นใหม่ และเปิด [Unreleased] ว่างไว้", () => {
    const out = applyRelease(BASE, "0.2.0", "2026-12-01");
    expect(out).toMatch(/## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-12-01\n\n### Added\n\n- อย่างหนึ่ง/);
    expect(out).toContain("## [0.1.0] - 2026-11-20");
    expect(out.indexOf("[0.2.0]")).toBeLessThan(out.indexOf("[0.1.0]"));
    expect(out.endsWith("\n")).toBe(true);
    expect(out).not.toMatch(/\n{3,}/);
    expect(extractReleaseNotes(out, "0.2.0")).toBe("### Added\n\n- อย่างหนึ่ง\n- อีกอย่าง\n\n### Fixed\n\n- แก้บั๊ก");
    expect(extractReleaseNotes(out, "0.1.0")).toBe("### Added\n\n- รุ่นแรก");
  });

  it("ปฏิเสธเมื่อ [Unreleased] ว่าง (มีแต่หัวข้อย่อย)", () => {
    const empty = BASE.replace(/## \[Unreleased\][\s\S]*?(?=## \[0\.1\.0\])/, "## [Unreleased]\n\n### Added\n\n");
    expect(() => applyRelease(empty, "0.2.0", "2026-12-01")).toThrow(/ว่าง/);
  });

  it("ปฏิเสธรุ่นที่ซ้ำ ต่ำกว่า หรือวันที่ผิดรูปแบบ", () => {
    expect(() => applyRelease(BASE, "0.1.0", "2026-12-01")).toThrow(/มี.*อยู่แล้ว/);
    expect(() => applyRelease(BASE, "0.0.9", "2026-12-01")).toThrow(/สูงกว่า/);
    expect(() => applyRelease(BASE, "0.2.0", "1/12/2026")).toThrow(/YYYY-MM-DD/);
  });

  it("ไม่มี [Unreleased] = error", () => {
    expect(() => applyRelease("# Changelog\n", "0.1.0", "2026-12-01")).toThrow(/Unreleased/);
  });

  it("ออกรุ่นแรกได้เมื่อยังไม่มีรุ่นก่อนหน้า", () => {
    const first = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- x\n";
    const out = applyRelease(first, "0.1.0", "2026-11-20");
    expect(out).toBe("# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-20\n\n### Added\n\n- x\n");
  });

  it("แก้ลิงก์อ้างอิงท้ายไฟล์ถ้ามี", () => {
    const withLinks = `${BASE}\n[Unreleased]: https://github.com/ieatbaozi-stack/fatcatfit/compare/v0.1.0...HEAD\n[0.1.0]: https://github.com/ieatbaozi-stack/fatcatfit/releases/tag/v0.1.0\n`;
    const out = applyRelease(withLinks, "0.2.0", "2026-12-01");
    expect(out).toContain("[Unreleased]: https://github.com/ieatbaozi-stack/fatcatfit/compare/v0.2.0...HEAD");
    expect(out).toContain("[0.2.0]: https://github.com/ieatbaozi-stack/fatcatfit/compare/v0.1.0...v0.2.0");
    expect(out).toContain("[0.1.0]: https://github.com/ieatbaozi-stack/fatcatfit/releases/tag/v0.1.0");
    expect(extractReleaseNotes(out, "0.1.0")).toBe("### Added\n\n- รุ่นแรก");
  });

  it("รองรับ CRLF", () => {
    const out = applyRelease(BASE.replace(/\n/g, "\r\n"), "0.2.0", "2026-12-01");
    expect(out).not.toContain("\r");
    expect(extractReleaseNotes(out, "0.2.0")).toContain("- อย่างหนึ่ง");
  });
});

describe("extractReleaseNotes", () => {
  it("ไม่พบรุ่น = null · [Unreleased] ไม่ใช่รุ่น", () => {
    expect(extractReleaseNotes(BASE, "9.9.9")).toBeNull();
    expect(extractReleaseNotes(BASE, "0.1.0")).toBe("### Added\n\n- รุ่นแรก");
  });
  it("0.1.0 ไม่ตรงกับ 0.1.01 หรือ 0.1.0 ที่เป็นแค่คำนำหน้าของรุ่นอื่น", () => {
    const text = "## [Unreleased]\n\n## [0.1.10] - 2026-01-01\n\n- a\n";
    expect(extractReleaseNotes(text, "0.1.1")).toBeNull();
  });
});

describe("setJsonVersion / setLockVersion", () => {
  it("แก้เฉพาะ version ตัวแรก ไม่จัดรูปแบบไฟล์ใหม่", () => {
    const pkg = '{\n  "name": "x",\n  "version": "0.0.0",\n  "dependencies": { "a": "1.0.0" }\n}\n';
    expect(setJsonVersion(pkg, "0.1.0")).toBe('{\n  "name": "x",\n  "version": "0.1.0",\n  "dependencies": { "a": "1.0.0" }\n}\n');
  });
  it("lockfile: แก้ทั้งรากและ packages[''] และคงรูปแบบ", () => {
    const lock = JSON.stringify({ name: "x", version: "0.0.0", lockfileVersion: 3, packages: { "": { name: "x", version: "0.0.0" }, "node_modules/a": { version: "1.0.0" } } }, null, 2) + "\n";
    const out = JSON.parse(setLockVersion(lock, "0.1.0"));
    expect(out.version).toBe("0.1.0");
    expect(out.packages[""].version).toBe("0.1.0");
    expect(out.packages["node_modules/a"].version).toBe("1.0.0");
  });
  it("lockfile: รูปแบบไม่ตรงที่ npm เขียน = ไม่แตะ", () => {
    expect(() => setLockVersion('{"version":"0.0.0"}', "0.1.0")).toThrow(/ไม่แก้อัตโนมัติ/);
  });
});

describe("repo นี้เอง", () => {
  it("CHANGELOG.md มี [Unreleased] และเลขรุ่นใน package.json สอดคล้องกับ CHANGELOG", () => {
    const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
    expect(checkVersionConsistency(pkg.version, changelog)).toEqual([]);
  });

  it("checkVersionConsistency จับกรณีลืมแก้ CHANGELOG", () => {
    expect(checkVersionConsistency("0.2.0", BASE)).toHaveLength(1);
    expect(checkVersionConsistency("0.1.0", BASE)).toEqual([]);
    expect(checkVersionConsistency("0.0.0", "# x\n")).toHaveLength(1);
  });
});
