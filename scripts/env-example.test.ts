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
  for (const file of files) {
    for (const name of extractEnvNames(readFileSync(file, "utf8"))) {
      used.set(name, [...(used.get(name) ?? []), path.relative(root, file)]);
    }
  }
  return used;
}

// รูปที่จับ: process.env.X · process.env["X"] · const { X, Y: y } = process.env · const e = process.env; e.X
// · ไฟล์ที่ส่ง process.env ต่อเป็นอาร์กิวเมนต์ (decide(process.env)) แล้วอ่าน env.X ในฟังก์ชัน
// ไม่จับ: ชื่อตัวพิมพ์เล็ก, process.env ที่ถูกสเปรดทั้งก้อน ({ ...process.env }) โดยไม่อ่านชื่อ
const NAME = "[A-Z][A-Z0-9_]*";
const NAME_ONLY = new RegExp(`^${NAME}$`);
const DIRECT = new RegExp(`process\\.env(?:\\.(${NAME})|\\[\\s*["'](${NAME})["']\\s*\\])`, "g");
const DESTRUCTURE = /\{([^{}]*)\}\s*=\s*process\.env\b(?!\s*[.[])/g;
const ALIAS_DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*process\.env\b(?!\s*[.[])/g;
// process.env เปล่าๆ (ถูกส่งเป็นอาร์กิวเมนต์) ไม่นับการสเปรด
const BARE_PASSED = /(?<!\.\.\.)\bprocess\.env\b(?!\s*[.[])(?!\s*\})/;

export function extractEnvNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const m of text.matchAll(DIRECT)) names.add((m[1] ?? m[2])!);

  for (const m of text.matchAll(DESTRUCTURE)) {
    for (const part of m[1]!.split(",")) {
      const key = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(part)?.[1];
      if (key && NAME_ONLY.test(key)) names.add(key);
    }
  }

  const aliases = new Set<string>();
  for (const m of text.matchAll(ALIAS_DECL)) aliases.add(m[1]!);
  if (BARE_PASSED.test(text)) aliases.add("env");
  for (const a of aliases) {
    const esc = a.replace(/\$/g, "\\$");
    const re = new RegExp(`(?<![\\w$.])${esc}(?:\\??\\.(${NAME})\\b|\\[\\s*["'](${NAME})["']\\s*\\])`, "g");
    for (const m of text.matchAll(re)) names.add((m[1] ?? m[2])!);
  }
  return names;
}

const example = readFileSync(path.join(root, ".env.example"), "utf8");
const declared = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!));

describe("extractEnvNames (ตัวจับตัวแปร env)", () => {
  it("จับรูปตรง", () => {
    expect([...extractEnvNames('const a = process.env.FOO_BAR; const b = process.env["BAZ"];')].sort()).toEqual(["BAZ", "FOO_BAR"]);
  });
  it("จับ destructuring", () => {
    expect([...extractEnvNames('const { AAA, BBB: renamed = "x", lower } = process.env;')].sort()).toEqual(["AAA", "BBB"]);
  });
  it("จับ alias", () => {
    expect([...extractEnvNames("const e = process.env;\nconst v = e.ALIAS_ONE + e['ALIAS_TWO'];")].sort()).toEqual(["ALIAS_ONE", "ALIAS_TWO"]);
    expect([...extractEnvNames("const env: NodeJS.ProcessEnv = process.env;\nenv.TYPED_ALIAS;")]).toEqual(["TYPED_ALIAS"]);
  });
  it("จับ env.X เมื่อไฟล์ส่ง process.env ต่อเป็นอาร์กิวเมนต์", () => {
    const code = "export function decide(env: Record<string, string | undefined>) { return env.MIGRATE_ON_DEPLOY; }\ndecide(process.env);";
    expect([...extractEnvNames(code)]).toEqual(["MIGRATE_ON_DEPLOY"]);
  });
  it("ไม่ false positive", () => {
    expect(extractEnvNames("const env = { NOT_ENV: 1 }; env.NOT_ENV; other.env.SOMETHING;").size).toBe(0);
    expect(extractEnvNames("const x = { ...process.env, NODE_ENV: 'production' }; const y = env.lower;").size).toBe(0);
    expect(extractEnvNames("const { lower } = process.env; foo.BAR;").size).toBe(0);
  });
  it("ตัวแปรที่ใช้จริงใน release-migrate.ts ถูกจับ", () => {
    const names = extractEnvNames(readFileSync(path.join(root, "scripts/release-migrate.ts"), "utf8"));
    expect(names.has("MIGRATE_ON_DEPLOY")).toBe(true);
    expect(names.has("DATABASE_URL_UNPOOLED")).toBe(true);
  });
});

describe(".env.example", () => {
  it("มีทุกตัวแปรที่โค้ดอ่านผ่าน process.env", () => {
    const missing = [...envNamesUsedInCode()].filter(([name]) => !PROVIDED.has(name) && !declared.has(name)).map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("มีทุกตัวแปรใน ARCHITECTURE ข้อ 5", () => {
    const required = [
      "DATABASE_URL", "DATABASE_URL_UNPOOLED", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
      "EMAIL_TRANSPORT", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "OTP_DAILY_CAP", "CRON_SECRET",
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
