import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// พิสูจน์ว่ากฎขอบเขตโมดูล (ARCHITECTURE ข้อ 3) ใน eslint.config.mjs ทำให้ lint ล้มจริง
// และ import ที่อนุญาตไม่ถูกบล็อก

const root = path.resolve(import.meta.dirname, "..");
const eslint = new ESLint({ cwd: root });

async function restrictedMessages(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports").map((m) => m.message);
}

const forbidden: Array<[string, string, string]> = [
  // [คำอธิบาย, ไฟล์, โค้ด]
  ["component import @/db/client", "src/components/x.tsx", 'import { getDb } from "@/db/client";\nexport const a = getDb;\n'],
  ["component import src/db แบบ relative", "src/components/x.tsx", 'import { getDb } from "../db/client";\nexport const a = getDb;\n'],
  ["หน้าจอ import repository ฝั่งเซิร์ฟเวอร์", "src/app/page.tsx", 'import { isDatabaseHealthy } from "@/lib/data/server/health";\nexport const a = isDatabaseHealthy;\n'],
  ["หน้าจอ import lib/auth/server", "src/app/me/page.tsx", 'import { createAuth } from "@/lib/auth/server";\nexport const a = createAuth;\n'],
  // relative path ต้องถูกบล็อกเหมือน alias (qa: เดิมหลุด)
  ["หน้าจอ import repository แบบ relative", "src/app/page.tsx", 'import { isDatabaseHealthy } from "../lib/data/server/health";\nexport const a = isDatabaseHealthy;\n'],
  ["หน้าจอย่อย import lib/auth/server แบบ relative", "src/app/me/page.tsx", 'import { createAuth } from "../../lib/auth/server";\nexport const a = createAuth;\n'],
  ["component import lib/email แบบ relative", "src/components/x.tsx", 'import { send } from "../lib/email";\nexport const a = send;\n'],
  ["หน้าจอ import lib/email", "src/app/page.tsx", 'import { send } from "@/lib/email";\nexport const a = send;\n'],
  ["API route import @/db ตรงๆ", "src/app/api/x/route.ts", 'import { getDb } from "@/db/client";\nexport const a = getDb;\n'],
  ["API route import @/db/schema", "src/app/api/x/route.ts", 'import { user } from "@/db/schema";\nexport const a = user;\n'],
  ["offline import โค้ดเซิร์ฟเวอร์", "src/lib/offline/queue.ts", 'import { getDb } from "@/db/client";\nexport const a = getDb;\n'],
  ["offline import React", "src/lib/offline/queue.ts", 'import { useState } from "react";\nexport const a = useState;\n'],
  ["offline import component", "src/lib/offline/queue.ts", 'import { Button } from "@/components/button";\nexport const a = Button;\n'],
  ["repository import src/app", "src/lib/data/server/x.ts", 'import { x } from "@/app/x";\nexport const a = x;\n'],
  ["lib/auth import src/app", "src/lib/auth/server.ts", 'import { x } from "@/app/x";\nexport const a = x;\n'],
  ["auth client import server", "src/lib/auth/client.ts", 'import { createAuth } from "@/lib/auth/server";\nexport const a = createAuth;\n'],
  ["stats import ฐานข้อมูล", "src/lib/stats/pr.ts", 'import { getDb } from "@/db/client";\nexport const a = getDb;\n'],
  ["data/shared import pg", "src/lib/data/shared/x.ts", 'import { Pool } from "pg";\nexport const a = Pool;\n'],
  ["pwa import โค้ดแอป", "src/pwa/sw.ts", 'import { x } from "@/lib/offline/queue";\nexport const a = x;\n'],
];

const allowed: Array<[string, string, string]> = [
  ["หน้าจอ import lib/offline + data/shared", "src/app/page.tsx", 'import { q } from "@/lib/offline/queue";\nimport { t } from "@/lib/data/shared/track-types";\nexport const a = [q, t];\n'],
  ["route handler import repository", "src/app/api/x/route.ts", 'import { f } from "@/lib/data/server/health";\nexport const a = f;\n'],
  ["repository import src/db", "src/lib/data/server/x.ts", 'import { getDb } from "@/db/client";\nexport const a = getDb;\n'],
  ["lib/auth/server import src/db", "src/lib/auth/server.ts", 'import { getDb } from "@/db/client";\nexport const a = getDb;\n'],
  ["stats import data/shared", "src/lib/stats/pr.ts", 'import { t } from "@/lib/data/shared/track-types";\nexport const a = t;\n'],
  ["เทสต์ของ route ใช้ตัวช่วยฐานข้อมูลได้", "src/app/api/x/route.test.ts", 'import { createTestDb } from "@/db/testing/pglite";\nexport const a = createTestDb;\n'],
];

describe("ขอบเขตโมดูลด้วย ESLint", () => {
  it.each(forbidden)("บล็อก: %s", async (_name, file, code) => {
    const messages = await restrictedMessages(file, code);
    expect(messages.length).toBeGreaterThan(0);
  });

  it.each(allowed)("ผ่าน: %s", async (_name, file, code) => {
    const messages = await restrictedMessages(file, code);
    expect(messages).toEqual([]);
  });

  it("โค้ดจริงของ platform ผ่านกฎ", async () => {
    const results = await eslint.lintFiles(["src/app/api/health/route.ts", "src/lib/data/server/health.ts", "src/lib/auth/server.ts", "src/db/client.ts"]);
    const bad = results.flatMap((r) => r.messages).filter((m) => m.ruleId === "no-restricted-imports");
    expect(bad).toEqual([]);
  });
});
