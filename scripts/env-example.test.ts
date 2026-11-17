import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// เกณฑ์ R0 ข้อ 16: ทุก process.env.X ที่โค้ดอ่านต้องมีใน .env.example · และไฟล์ตัวอย่างต้องไม่มีค่าจริง

const root = path.resolve(import.meta.dirname, "..");

// ตัวแปรที่ระบบ/ผู้ให้บริการตั้งให้เอง ไม่ต้องอยู่ใน .env.example
const PROVIDED = new Set(["NODE_ENV", "CI", "VERCEL_ENV"]);

const SCAN_DIRS = ["src", "scripts", "tests"];
const SCAN_FILES = ["next.config.ts", "drizzle.config.ts", "vitest.config.ts", "eslint.config.mjs", "playwright.config.ts"];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
}

function envNamesUsedInCode(): Map<string, string[]> {
  const files: string[] = SCAN_FILES.map((f) => path.join(root, f)).filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  });
  for (const d of SCAN_DIRS) {
    try {
      if (statSync(path.join(root, d)).isDirectory()) walk(path.join(root, d), files);
    } catch {
      // ไม่มีโฟลเดอร์นี้
    }
  }
  const used = new Map<string, string[]>();
  const re = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])/g;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      const name = (m[1] ?? m[2])!;
      used.set(name, [...(used.get(name) ?? []), path.relative(root, file)]);
    }
  }
  return used;
}

const example = readFileSync(path.join(root, ".env.example"), "utf8");
const declared = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!));

describe(".env.example", () => {
  it("มีทุกตัวแปรที่โค้ดอ่านผ่าน process.env", () => {
    const missing = [...envNamesUsedInCode()].filter(([name]) => !PROVIDED.has(name) && !declared.has(name)).map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("มีทุกตัวแปรใน ARCHITECTURE ข้อ 5", () => {
    const required = [
      "DATABASE_URL", "DATABASE_URL_UNPOOLED", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
      "EMAIL_TRANSPORT", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "OTP_DAILY_CAP", "CRON_SECRET", "TRUSTED_IP_HEADER",
    ];
    expect(required.filter((n) => !declared.has(n))).toEqual([]);
  });

  it("ไม่มีค่าที่ดูเหมือนความลับจริง (ค่าต้องเป็น placeholder)", () => {
    const suspicious: string[] = [];
    for (const line of example.split(/\r?\n/)) {
      const m = /^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (!m) continue;
      const [, name, value] = m;
      if (/(SECRET|PASS|URL|KEY|TOKEN)/.test(name!) && value && !/<[^>]+>|localhost|example\.com/.test(value)) suspicious.push(name!);
      if (/\b(?:sk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|npg_[A-Za-z0-9]{8,}/.test(value!)) suspicious.push(name!);
    }
    expect(suspicious).toEqual([]);
  });
});
