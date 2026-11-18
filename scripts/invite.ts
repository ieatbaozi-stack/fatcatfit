import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import type { AppDb } from "../src/db/types";
import { normalizeInviteCode } from "../src/lib/auth/invite-code";
import { createInvite, listInvites, revokeInvite } from "../src/lib/auth/invite-store";

// สคริปต์ออกโค้ดเชิญของ boss (ADR 0002 ข้อ 2) — ไม่มีหน้าแอดมินใน v1
//   npm run invite -- create --uses 5 --days 14 --label "เพื่อนกลุ่มแรก"
//   npm run invite -- list
//   npm run invite -- revoke --id <uuid>      หรือ  revoke --code XXXX-XXXX
// โค้ดดิบแสดงครั้งเดียวตอน create (ฐานข้อมูลเก็บแค่ hash) · ไม่ log โค้ด ไม่พิมพ์ connection string
// ลิงก์ที่พิมพ์ใช้ fragment (#invite=) เพื่อไม่ให้โค้ดไปอยู่ใน log ของเซิร์ฟเวอร์ (ADR 0006)

export type Out = { log: (line: string) => void; err: (line: string) => void };

function flags(args: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument: ${a}`);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`missing value for ${a}`);
    m.set(a.slice(2), next);
    i++;
  }
  return m;
}

const USAGE = `usage:
  create --uses <N> --days <D> --label <text> [--base <url>]
  list
  revoke --id <uuid> | --code <XXXX-XXXX>`;

/** ทำงานตามคำสั่ง · คืน exit code (0 สำเร็จ) — แยกจาก main เพื่อเทสต์ได้ */
export async function runInvite(argv: string[], db: AppDb, now: Date, out: Out, env: Record<string, string | undefined> = process.env): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "create") {
      const f = flags(rest);
      const maxUses = Number(f.get("uses"));
      const days = Number(f.get("days"));
      const label = (f.get("label") ?? "").trim();
      if (!Number.isInteger(maxUses) || maxUses < 1) throw new Error("--uses must be an integer >= 1");
      if (!Number.isFinite(days) || days <= 0) throw new Error("--days must be > 0");
      if (!label) throw new Error("--label is required");
      const inv = await createInvite(db, { label, maxUses, days }, now);
      const base = (f.get("base") ?? env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
      out.log(`code:    ${inv.display}`);
      out.log(`link:    ${base}/welcome#invite=${inv.display}`);
      out.log(`uses:    ${inv.maxUses}   expires: ${inv.expiresAt.toISOString()}   id: ${inv.id}`);
      out.log("แสดงโค้ดนี้ครั้งเดียว — เก็บไว้เอง ระบบไม่เก็บโค้ดดิบ (the code is shown once and cannot be recovered)");
      return 0;
    }
    if (cmd === "list") {
      const rows = await listInvites(db, now);
      if (rows.length === 0) out.log("(no invite codes)");
      for (const r of rows) {
        out.log(`${r.id}  ${r.status.padEnd(9)} ${r.usesCount}/${r.maxUses}  expires ${r.expiresAt.toISOString()}  ${r.label}`);
      }
      return 0;
    }
    if (cmd === "revoke") {
      const f = flags(rest);
      const id = f.get("id");
      const code = f.get("code");
      if (!id === !code) throw new Error("give exactly one of --id or --code");
      let n: number;
      if (id) {
        n = await revokeInvite(db, { id }, now);
      } else {
        const normalizedCode = normalizeInviteCode(code);
        if (!normalizedCode) throw new Error("--code is not a valid invite code");
        n = await revokeInvite(db, { normalizedCode }, now);
      }
      out.log(n > 0 ? "revoked" : "nothing revoked (not found or already revoked)");
      return n > 0 ? 0 : 1;
    }
    out.err(USAGE);
    return 2;
  } catch (e) {
    out.err(`invite: ${(e as Error).message}`);
    return 2;
  }
}

async function main() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("invite: DATABASE_URL (or DATABASE_URL_UNPOOLED) is not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool, { schema });
    process.exitCode = await runInvite(process.argv.slice(2), db, new Date(), {
      log: (l) => console.log(l),
      err: (l) => console.error(l),
    });
  } catch (err: unknown) {
    // ไม่ log ทั้ง error object เพราะอาจมี connection string
    const code = (err as { code?: string }).code;
    console.error(`invite failed${code ? ` (${code})` : ""}: ${(err as Error).name}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
