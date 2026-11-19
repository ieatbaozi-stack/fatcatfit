// หลังบ้านจำลองสำหรับ E2E (qa-test) — รันด้วย tsx จาก playwright.config.ts (webServer ตัวแรก)
// ไม่ต่ออินเทอร์เน็ต ไม่แตะ Neon ทุกอย่างอยู่ในหน่วยความจำของโปรเซสนี้ และฟังเฉพาะ 127.0.0.1
//
// 1. Postgres: PGlite (รัน migration จริงจาก drizzle/) + ตัวแปลง wire protocol บน TCP ให้ `pg` ของแอปต่อได้
//    PGlite มี session เดียว → ล็อกทั้งฐานต่อการเชื่อมต่อจนกว่า ReadyForQuery = 'I' (ไม่อยู่ใน transaction)
// 2. SMTP ปลอม: แอปส่งอีเมล OTP ด้วย EMAIL_TRANSPORT=smtp ตามจริง (nodemailer) แล้วเก็บเมลไว้ให้เทสต์อ่าน
//    — ไม่ข้ามด่าน OTP: เทสต์ต้องอ่านรหัสจากเมลที่แอปส่งจริงเหมือนผู้ใช้
// 3. HTTP ควบคุม (127.0.0.1 เท่านั้น): ออกโค้ดเชิญด้วยฟังก์ชันเดียวกับ scripts/invite.ts · อ่านเมล · query ตรวจผล

import { createServer as createHttpServer, type IncomingMessage } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../src/db/schema";
import type { AppDb } from "../../../src/db/types";
import { createInvite, revokeInvite } from "../../../src/lib/auth/invite-store";
import { E2E_CTRL_PORT, E2E_PG_PORT, E2E_SMTP_PORT } from "./ports";
import { otpEmailKeys, otpVerificationIdentifiers } from "../../../src/lib/auth/throttle";

const PG_PORT = E2E_PG_PORT;
const SMTP_PORT = E2E_SMTP_PORT;
const CTRL_PORT = E2E_CTRL_PORT;
const HOST = "127.0.0.1";

const pg = new PGlite();
const db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

// ---------------------------------------------------------------- Postgres wire
let lockTail: Promise<void> = Promise.resolve();
function acquire(): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const prev = lockTail;
  lockTail = prev.then(() => next);
  return prev.then(() => release);
}
/** ล็อกเดียวกับการเชื่อมต่อ TCP — ให้ HTTP ควบคุม query ได้โดยไม่แทรกกลาง transaction ของแอป */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

function startupReply(): Buffer {
  const parts: Buffer[] = [];
  const msg = (type: string, body: Buffer) => {
    const head = Buffer.alloc(5);
    head.write(type, 0, "latin1");
    head.writeInt32BE(body.length + 4, 1);
    parts.push(head, body);
  };
  const int32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
  };
  msg("R", int32(0)); // AuthenticationOk
  for (const [k, v] of [
    ["server_version", "17.0"],
    ["server_encoding", "UTF8"],
    ["client_encoding", "UTF8"],
    ["DateStyle", "ISO, MDY"],
    ["integer_datetimes", "on"],
    ["standard_conforming_strings", "on"],
    ["TimeZone", "UTC"],
  ]) {
    msg("S", Buffer.concat([Buffer.from(k + "\0"), Buffer.from(v + "\0")]));
  }
  msg("K", Buffer.concat([int32(1), int32(1)]));
  msg("Z", Buffer.from("I"));
  return Buffer.concat(parts);
}

/** สถานะใน ReadyForQuery ตัวสุดท้ายของคำตอบ ('I' | 'T' | 'E') หรือ null ถ้าไม่มี */
function lastReadyStatus(out: Uint8Array): string | null {
  let i = 0;
  let status: string | null = null;
  const view = Buffer.from(out.buffer, out.byteOffset, out.byteLength);
  while (i + 5 <= view.length) {
    const type = String.fromCharCode(view[i]);
    const len = view.readInt32BE(i + 1);
    if (type === "Z" && i + 6 <= view.length) status = String.fromCharCode(view[i + 5]);
    i += 1 + len;
  }
  return status;
}

function handlePgSocket(sock: Socket) {
  let buf = Buffer.alloc(0);
  let started = false;
  let release: (() => void) | null = null;
  let txStatus = "I";
  let chain: Promise<void> = Promise.resolve();
  let closed = false;

  const pump = async () => {
    for (;;) {
      if (!started) {
        if (buf.length < 8) return;
        const len = buf.readInt32BE(0);
        if (buf.length < len) return;
        const code = buf.readInt32BE(4);
        buf = buf.subarray(len);
        if (code === 80877103 || code === 80877104) {
          sock.write("N"); // ไม่รองรับ SSL/GSS
          continue;
        }
        if (code === 80877102) {
          sock.end(); // CancelRequest — ไม่รองรับ
          return;
        }
        started = true;
        sock.write(startupReply());
        continue;
      }
      // เก็บข้อความที่ครบแล้วทั้งหมดในก้อนนี้
      let end = 0;
      let terminate = false;
      while (end + 5 <= buf.length) {
        const len = buf.readInt32BE(end + 1);
        if (end + 1 + len > buf.length) break;
        if (buf[end] === 0x58 /* X */) {
          terminate = true;
          break;
        }
        end += 1 + len;
      }
      if (end > 0) {
        const chunk = new Uint8Array(buf.subarray(0, end));
        buf = buf.subarray(end);
        if (!release) release = await acquire();
        const out = await pg.execProtocolRaw(chunk);
        const st = lastReadyStatus(out);
        if (st) txStatus = st;
        if (st === "I" && release) {
          release();
          release = null;
        }
        if (!closed && out.length) sock.write(Buffer.from(out));
      }
      if (terminate) {
        sock.end();
        return;
      }
      if (end === 0) return;
    }
  };

  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    chain = chain.then(pump).catch((e) => {
      console.error("[e2e-backend] pg error", e);
      sock.destroy();
    });
  });
  sock.on("close", () => {
    closed = true;
    void chain.then(async () => {
      if (release) {
        if (txStatus !== "I") await pg.exec("ROLLBACK").catch(() => {});
        release();
        release = null;
      }
    });
  });
  sock.on("error", () => {});
}

createTcpServer(handlePgSocket).listen(PG_PORT, HOST);

// ---------------------------------------------------------------- SMTP ปลอม
export type Mail = { to: string[]; subject: string; text: string; raw: string; at: number };
const mails: Mail[] = [];

function decodeWords(s: string): string {
  // คำที่เข้ารหัสติดกันคั่นด้วยช่องว่าง = ต่อกันโดยไม่มีช่องว่าง (RFC 2047)
  return s.replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, _cs, enc: string, data: string) =>
    enc.toUpperCase() === "B"
      ? Buffer.from(data, "base64").toString("utf8")
      : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"),
  );
}

function decodeBody(body: string, cte: string): string {
  const e = cte.trim().toLowerCase();
  if (e === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (e === "quoted-printable") {
    const bytes = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(bytes, "latin1").toString("utf8");
  }
  return body;
}

function parseHeaders(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

/** ดึง text/plain จาก MIME (รองรับ multipart ชั้นเดียว/ซ้อน) */
function plainText(raw: string): { subject: string; text: string } {
  const sep = raw.search(/\r?\n\r?\n/);
  const headers = parseHeaders(raw.slice(0, sep));
  const body = raw.slice(sep).replace(/^\r?\n\r?\n/, "");
  const subject = decodeWords(headers["subject"] ?? "");
  const ct = headers["content-type"] ?? "text/plain";
  const boundary = /boundary="?([^";]+)"?/i.exec(ct)?.[1];
  if (!boundary) return { subject, text: decodeBody(body, headers["content-transfer-encoding"] ?? "7bit") };
  for (const part of body.split(`--${boundary}`)) {
    const p = part.replace(/^\r?\n/, "");
    if (!p.trim() || p.startsWith("--")) continue;
    const inner = plainText(p);
    const ph = parseHeaders(p.slice(0, p.search(/\r?\n\r?\n/)));
    if ((ph["content-type"] ?? "").toLowerCase().startsWith("text/plain") || /multipart/i.test(ph["content-type"] ?? "")) {
      if (inner.text.trim()) return { subject, text: inner.text };
    }
  }
  return { subject, text: "" };
}

createTcpServer((sock) => {
  let buf = "";
  let inData = false;
  let rcpt: string[] = [];
  let authStep = 0;
  sock.write("220 localhost ESMTP e2e\r\n");
  sock.on("data", (d) => {
    buf += d.toString("latin1");
    for (;;) {
      if (inData) {
        const i = buf.indexOf("\r\n.\r\n");
        if (i < 0) return;
        const raw = Buffer.from(buf.slice(0, i).replace(/\r\n\.\./g, "\r\n."), "latin1").toString("latin1");
        buf = buf.slice(i + 5);
        inData = false;
        const { subject, text } = plainText(raw);
        mails.push({ to: rcpt, subject, text, raw, at: Date.now() });
        rcpt = [];
        sock.write("250 OK queued\r\n");
        continue;
      }
      const nl = buf.indexOf("\r\n");
      if (nl < 0) return;
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      if (authStep > 0) {
        authStep = authStep === 1 ? 2 : 0;
        sock.write(authStep === 2 ? "334 UGFzc3dvcmQ6\r\n" : "235 Authentication successful\r\n");
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") sock.write("250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
      else if (cmd === "HELO") sock.write("250 localhost\r\n");
      else if (cmd === "AUTH") {
        if (/^AUTH LOGIN/i.test(line)) {
          authStep = 1;
          sock.write("334 VXNlcm5hbWU6\r\n");
        } else sock.write("235 Authentication successful\r\n");
      } else if (cmd === "MAIL") sock.write("250 OK\r\n");
      else if (cmd === "RCPT") {
        const m = /<([^>]+)>/.exec(line);
        if (m) rcpt.push(m[1].toLowerCase());
        sock.write("250 OK\r\n");
      } else if (cmd === "DATA") {
        inData = true;
        sock.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (cmd === "QUIT") {
        sock.end("221 Bye\r\n");
        return;
      } else if (cmd === "RSET" || cmd === "NOOP") sock.write("250 OK\r\n");
      else sock.write("502 Not implemented\r\n");
    }
  });
  sock.on("error", () => {});
}).listen(SMTP_PORT, HOST);

// ---------------------------------------------------------------- HTTP ควบคุม
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? (JSON.parse(s) as Record<string, unknown>) : {};
}

createHttpServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    if (req.method === "GET" && url.pathname === "/ready") return send(200, { ok: true });
    if (req.method === "POST" && url.pathname === "/invite") {
      const b = await readBody(req);
      const now = new Date(Date.now() + Number(b.shiftMs ?? 0));
      const created = await withLock(() =>
        createInvite(db as unknown as AppDb, { label: "e2e", maxUses: Number(b.maxUses ?? 5), days: Number(b.days ?? 7) }, now),
      );
      if (b.revoke) await withLock(() => revokeInvite(db as unknown as AppDb, { id: created.id }, new Date()));
      return send(200, created);
    }
    if (req.method === "GET" && url.pathname === "/mail") {
      const to = (url.searchParams.get("to") ?? "").toLowerCase();
      return send(200, mails.filter((m) => !to || m.to.includes(to)).map((m) => ({ to: m.to, subject: m.subject, text: m.text, at: m.at })));
    }
    if (req.method === "GET" && url.pathname === "/residue") {
      // สิ่งที่เหลือของบัญชีหนึ่ง (เกณฑ์ 10): ทุกตารางที่มีคอลัมน์ user_id (หาเองจาก information_schema — ตารางใหม่ถูกนับอัตโนมัติ)
      // + user + verification/auth_throttle ของอีเมลนั้น (key ตรงตัวจากฟังก์ชันเดียวกับแอป)
      const userId = url.searchParams.get("userId") ?? "";
      const email = url.searchParams.get("email") ?? "";
      const out = await withLock(async () => {
        const counts: Record<string, number> = {};
        const tables = await pg.query<{ table_name: string }>(
          "select table_name from information_schema.columns where table_schema='public' and column_name='user_id' order by table_name",
        );
        for (const { table_name } of tables.rows) {
          const r = await pg.query<{ n: number }>(`select count(*)::int as n from "${table_name}" where user_id = $1`, [userId]);
          counts[table_name] = r.rows[0].n;
        }
        counts["user"] = (await pg.query<{ n: number }>(`select count(*)::int as n from "user" where id = $1 or lower(email) = lower($2)`, [userId, email])).rows[0].n;
        counts["verification(email)"] = (
          await pg.query<{ n: number }>(`select count(*)::int as n from verification where identifier = any($1::text[])`, [otpVerificationIdentifiers(email)])
        ).rows[0].n;
        counts["auth_throttle(email)"] = (
          await pg.query<{ n: number }>(`select count(*)::int as n from auth_throttle where key = any($1::text[])`, [otpEmailKeys(email)])
        ).rows[0].n;
        return counts;
      });
      return send(200, out);
    }
    if (req.method === "POST" && url.pathname === "/sql") {
      const b = await readBody(req);
      const r = await withLock(() => pg.query(String(b.sql), (b.params as unknown[]) ?? []));
      return send(200, { rows: r.rows });
    }
    send(404, { error: "not found" });
  } catch (e) {
    send(500, { error: e instanceof Error ? e.message : String(e) });
  }
}).listen(CTRL_PORT, HOST, () => {
  console.log(`[e2e-backend] pg:${PG_PORT} smtp:${SMTP_PORT} ctrl:${CTRL_PORT}`);
});
