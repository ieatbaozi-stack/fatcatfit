import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// S2: ตรวจไฟล์ migration เทียบกติกาชนิดข้อมูลของ ADR 0001
const dir = path.resolve(process.cwd(), "drizzle");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
const sqlText = files.map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");

describe("migration ผ่านกติกาชนิดข้อมูล ADR 0001", () => {
  it("มีไฟล์ migration", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each([
    ["enum type", /CREATE TYPE/i],
    ["jsonb/json", /\bjsonb?\b/i],
    ["array", /\[\]/],
    ["trigger/function/procedure", /CREATE (OR REPLACE )?(TRIGGER|FUNCTION|PROCEDURE)/i],
    ["RLS", /ROW LEVEL SECURITY|CREATE POLICY/i],
    ["extension", /CREATE EXTENSION/i],
    ["default ที่เป็นฟังก์ชันฝั่ง DB", /DEFAULT\s+(now|gen_random_uuid|uuid_generate|pg_catalog|current_timestamp|\()/i],
    ["serial", /\bserial\b/i],
    // ADR 0001 ฉบับแก้ 2026-11-17: ห้าม bigint (epoch ms ใช้ double precision)
    ["bigint/int8", /\b(bigint|int8|bigserial)\b/i],
    ["timestamp ที่ไม่ใช่ (3) with time zone", /timestamp(?! \(3\) with time zone)/i],
  ])("ไม่มี %s", (_name, re) => {
    expect(sqlText).not.toMatch(re);
  });

  it("คอลัมน์ id และ *_id ทุกตัวเป็น uuid", () => {
    const cols = [...sqlText.matchAll(/^\t"(id|[a-z_]*_id)" (\w+)/gm)].filter(
      // account_id / provider_id ของ Better Auth เป็นรหัสจากผู้ให้บริการภายนอก (ไม่ใช่ FK)
      (m) => !["account_id", "provider_id"].includes(m[1]),
    );
    expect(cols.length).toBeGreaterThan(0);
    for (const [, name, type] of cols) expect({ name, type }).toEqual({ name, type: "uuid" });
  });
});
