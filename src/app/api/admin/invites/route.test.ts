import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { appAdmin, authThrottle, inviteCode, session, user } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/testing/pglite";
import { hashInviteCode, normalizeInviteCode } from "@/lib/auth/invite-code";
import { createInvite, revokeInvite } from "@/lib/auth/invite-store";
import { inviteCookie, makeAuth, newInvite, otpSignIn, TEST_SECRET } from "@/lib/auth/testing";
import { adminInviteKey, sha256Hex } from "@/lib/auth/throttle";
import { deleteAccount } from "@/lib/data/server/account";

let t: TestDb;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));

import { GET as invitesGet, POST as invitesPost, PUT, PATCH, DELETE as invitesDelete, OPTIONS } from "./route";
import * as revokeRoute from "./[id]/revoke/route";
import { POST as checkPost } from "../../invite/check/route";
import { GET as meGet } from "../../me/route";

const HOST = "localhost:3000";
const NOT_FOUND_BODY = '{"code":"not_found"}';
let n = 0;
type Cookie = Record<string, string>;
const cookieHeader = (c: Cookie) =>
  Object.entries(c)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

function req(method: string, url: string, c?: Cookie, body?: unknown, headers: Record<string, string | null> = {}) {
  const h = new Headers({ host: HOST, origin: `http://${HOST}`, "content-type": "application/json" });
  if (c) h.set("cookie", cookieHeader(c));
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) h.delete(k);
    else h.set(k, v);
  }
  return new Request(`http://${HOST}${url}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function signUp(email: string): Promise<Cookie> {
  const { auth, sent, clock } = makeAuth(t.db);
  clock.t = new Date(Date.now() + ++n * 1000);
  const inv = await newInvite(t.db, clock.t, 1);
  const { session: s } = await otpSignIn(auth, sent, email, inviteCookie(inv.code), `203.0.113.${(n % 250) + 1}`);
  if (!s) throw new Error("signup failed");
  return s;
}

// เพิ่มแอดมินด้วย SQL ตรงในเทสต์เท่านั้น (ในแอปไม่มีทางเขียน app_admin)
async function makeAdmin(email: string): Promise<{ c: Cookie; id: string }> {
  const c = await signUp(email);
  const [u] = await t.db.select().from(user).where(eq(user.email, email));
  await t.db.insert(appAdmin).values({ userId: u.id, createdAt: new Date() });
  return { c, id: u.id };
}

const good = { label: "  เพื่อนใหม่  ", days: 7, maxUses: 3 };
const postInvite = (c?: Cookie, body: unknown = good, h: Record<string, string | null> = {}) =>
  invitesPost(req("POST", "/api/admin/invites", c, body, h));
const revoke = (id: string, c?: Cookie, h: Record<string, string | null> = {}) =>
  revokeRoute.POST(req("POST", `/api/admin/invites/${id}/revoke`, c, undefined, h), { params: Promise.resolve({ id }) });
const check = async (code: string) =>
  (
    await (
      await checkPost(
        new Request(`http://${HOST}/api/invite/check`, {
          method: "POST",
          headers: { host: HOST, origin: `http://${HOST}`, "content-type": "application/json", "x-forwarded-for": `198.51.100.${(++n % 200) + 1}` },
          body: JSON.stringify({ code }),
        }),
      )
    ).json()
  ).result;

let logs: string[];
beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = TEST_SECRET;
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  logs = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe("เกณฑ์ 3: คนนอกได้ 404 not_found เหมือนกันทุกไบต์ ทุก method", () => {
  it("ไม่มี session / cookie ปลอม / session หมดอายุ / ผู้ใช้ทั่วไป", async () => {
    const plain = await signUp("plain@example.com");
    const expired = await signUp("expired@example.com");
    const [eu] = await t.db.select().from(user).where(eq(user.email, "expired@example.com"));
    await t.db.update(session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(session.userId, eu.id));
    const someId = crypto.randomUUID();
    const victims: [string, (c?: Cookie) => Promise<Response> | Response][] = [
      ["GET list", (c) => invitesGet(req("GET", "/api/admin/invites", c))],
      ["POST create", (c) => postInvite(c)],
      ["PUT", () => PUT()],
      ["PATCH", () => PATCH()],
      ["DELETE", () => invitesDelete()],
      ["POST revoke", (c) => revoke(someId, c)],
      ["GET revoke", () => revokeRoute.GET()],
      ["PUT revoke", () => revokeRoute.PUT()],
      ["PATCH revoke", () => revokeRoute.PATCH()],
      ["DELETE revoke", () => revokeRoute.DELETE()],
    ];
    for (const [name, fn] of victims) {
      const bodies = new Set<string>();
      for (const c of [undefined, { "better-auth.session_token": "forged.value" }, expired, plain]) {
        const res = await fn(c);
        expect(res.status, name).toBe(404);
        expect(res.headers.get("cache-control"), name).toBe("no-store");
        expect(res.headers.get("content-type"), name).toContain("application/json");
        bodies.add(await res.text());
      }
      expect([...bodies], name).toEqual([NOT_FOUND_BODY]);
    }
  });

  it("คนนอกส่ง body พัง/ใหญ่เกิน → ยังได้ 404 (ไม่เห็น 400/413) และไม่นับ throttle", async () => {
    const plain = await signUp("plain2@example.com");
    for (const body of ["not json", JSON.stringify({ label: "x".repeat(50_000) }), JSON.stringify({ junk: 1 })]) {
      const res = await invitesPost(
        new Request(`http://${HOST}/api/admin/invites`, {
          method: "POST",
          headers: { host: HOST, origin: `http://${HOST}`, cookie: cookieHeader(plain) },
          body,
        }),
      );
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(NOT_FOUND_BODY);
    }
    const rows = await t.db.select().from(authThrottle);
    expect(rows.filter((r) => r.key.startsWith("admin-invite:"))).toHaveLength(0);
  });

  // Next 16 (auto-implement-methods.js): HEAD ที่ไม่ export = เรียก handler GET (จึงผ่าน requireAdmin เหมือนกัน · เซิร์ฟเวอร์ตัด body)
  // ส่วน OPTIONS ที่ไม่ export = 204 + Allow ให้ทุกคน (บอกว่าเส้นทางมี) → เรา export OPTIONS เป็น 404 เอง
  it("HEAD ไม่ export (Next ใช้ GET) · OPTIONS ตอบ 404 เหมือนคนนอกเสมอ", async () => {
    expect(Object.keys(revokeRoute)).not.toContain("HEAD");
    const a = await OPTIONS();
    const b = await revokeRoute.OPTIONS();
    for (const res of [a, b]) {
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(NOT_FOUND_BODY);
      expect(res.headers.get("allow")).toBeNull();
    }
    // HEAD → GET: คนนอกได้ 404 เหมือน GET
    expect((await invitesGet(req("HEAD", "/api/admin/invites"))).status).toBe(404);
  });
});

describe("GET /api/admin/invites (เกณฑ์ 7)", () => {
  it("เรียงใหม่สุดก่อน · ไม่มีโค้ดหรือ hash · สถานะครบ 4 แบบ · ISO UTC", async () => {
    const { c } = await makeAdmin("admin-list@example.com");
    const now = new Date();
    await t.db.delete(inviteCode);
    const a = await createInvite(t.db, { label: "active", maxUses: 2, days: 3 }, new Date(now.getTime() - 4000));
    const b = await createInvite(t.db, { label: "expired", maxUses: 2, days: 1 }, new Date(now.getTime() - 3 * 86_400_000));
    const r = await createInvite(t.db, { label: "revoked", maxUses: 2, days: 3 }, new Date(now.getTime() - 2000));
    await revokeInvite(t.db, { id: r.id }, now);
    const x = await createInvite(t.db, { label: "exhausted", maxUses: 1, days: 3 }, new Date(now.getTime() - 1000));
    await t.db.update(inviteCode).set({ usesCount: 1 }).where(eq(inviteCode.id, x.id));
    const res = await invitesGet(req("GET", "/api/admin/invites", c));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const j = JSON.parse(text) as { invites: Record<string, unknown>[] };
    expect(j.invites.map((i) => [i.label, i.status])).toEqual([
      ["exhausted", "exhausted"],
      ["revoked", "revoked"],
      ["active", "active"],
      ["expired", "expired"],
    ]);
    expect(Object.keys(j.invites[0]).sort()).toEqual(["createdAt", "expiresAt", "id", "label", "maxUses", "status", "usesCount"]);
    expect(j.invites[0].expiresAt).toMatch(/Z$/);
    for (const inv of [a, b, r, x]) {
      expect(text).not.toContain(inv.code);
      expect(text).not.toContain(inv.display);
      expect(text).not.toContain(hashInviteCode(inv.code));
    }
    expect(text).not.toMatch(/code|hash/i);
  });

  it("เพดาน 200 แถว (ใหม่สุดก่อน)", async () => {
    const { c } = await makeAdmin("admin-cap@example.com");
    await t.db.delete(inviteCode);
    const base = Date.now() - 1_000_000;
    await t.db.insert(inviteCode).values(
      Array.from({ length: 205 }, (_, i) => ({
        id: crypto.randomUUID(),
        codeHash: sha256Hex(`cap${i}`),
        label: `L${i}`,
        maxUses: 1,
        usesCount: 0,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(base + i),
      })),
    );
    const j = await (await invitesGet(req("GET", "/api/admin/invites", c))).json();
    expect(j.invites).toHaveLength(200);
    expect(j.invites[0].label).toBe("L204");
    await t.db.delete(inviteCode);
  });
});

describe("POST /api/admin/invites", () => {
  it("เกณฑ์ 5/11: ออกโค้ด 201 · ใช้กับ /api/invite/check ได้ · DB มีแค่ hash · ไม่มีโค้ด/ป้ายใน log", async () => {
    const { c } = await makeAdmin("admin-create@example.com");
    const res = await postInvite(c);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const j = await res.json();
    expect(Object.keys(j).sort()).toEqual(["code", "expiresAt", "id", "label", "maxUses"]);
    expect(j.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(j.label).toBe("เพื่อนใหม่");
    expect(j.maxUses).toBe(3);
    const days = (new Date(j.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);

    const raw = normalizeInviteCode(j.code)!;
    const [row] = await t.db.select().from(inviteCode).where(eq(inviteCode.id, j.id));
    expect(row.codeHash).toBe(hashInviteCode(raw));
    expect(row.label).toBe("เพื่อนใหม่");
    expect(JSON.stringify(row)).not.toContain(raw);

    expect(await check(j.code)).toBe("ok");

    const all = logs.join("\n");
    expect(all).not.toContain(raw);
    expect(all).not.toContain(j.code);
    expect(all).not.toContain("เพื่อนใหม่");
  });

  it("ข้อผิดพลาดไม่ log โค้ด/ป้าย/body", async () => {
    const { c } = await makeAdmin("admin-nolog@example.com");
    await postInvite(c, { label: "SECRETLABEL", days: 99, maxUses: 1 });
    await postInvite(c, "{broken SECRETLABEL");
    expect(logs.join("\n")).not.toContain("SECRETLABEL");
  });

  it.each([
    ["days นอกชุด", { ...good, days: 2 }],
    ["days เป็นสตริง", { ...good, days: "7" }],
    ["days ทศนิยม", { ...good, days: 7.5 }],
    ["maxUses 0", { ...good, maxUses: 0 }],
    ["maxUses 11", { ...good, maxUses: 11 }],
    ["maxUses ทศนิยม", { ...good, maxUses: 2.5 }],
    ["label ว่าง", { ...good, label: "" }],
    ["label มีแต่ช่องว่าง", { ...good, label: "   " }],
    ["label 41 ตัว", { ...good, label: "a".repeat(41) }],
    ["label มีอักขระควบคุม", { ...good, label: "a\u0007b" }],
    ["label มีขึ้นบรรทัดใหม่", { ...good, label: "a\nb" }],
    ["label ไม่ใช่สตริง", { ...good, label: 5 }],
    ["ขาด maxUses", { label: "x", days: 7 }],
    ["key แปลก", { ...good, extra: 1 }],
    ["body เป็น array", []],
    ["body เป็น null", null],
  ])("400 invalid_input: %s", async (_name, body) => {
    const { c } = await makeAdmin(`admin-bad-${++n}@example.com`);
    const before = (await t.db.select().from(inviteCode)).length;
    const res = await postInvite(c, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "invalid_input" });
    expect((await t.db.select().from(inviteCode)).length).toBe(before);
  });

  it("label นับ code point (40 ผ่าน 41 ไม่ผ่าน) · ค่าขอบ days/maxUses", async () => {
    const { c } = await makeAdmin("admin-edge@example.com");
    expect((await postInvite(c, { label: "😀".repeat(40), days: 1, maxUses: 1 })).status).toBe(201);
    expect((await postInvite(c, { label: "😀".repeat(41), days: 1, maxUses: 1 })).status).toBe(400);
    expect((await postInvite(c, { label: "x", days: 14, maxUses: 10 })).status).toBe(201);
    expect((await postInvite(c, { label: "x", days: 3, maxUses: 1 })).status).toBe(201);
  });

  it("body ไม่ใช่ JSON → 400 invalid_json · ใหญ่เกิน → 413 (สำหรับแอดมิน)", async () => {
    const { c } = await makeAdmin("admin-json@example.com");
    const raw = (body: string) =>
      invitesPost(
        new Request(`http://${HOST}/api/admin/invites`, {
          method: "POST",
          headers: { host: HOST, origin: `http://${HOST}`, cookie: cookieHeader(c) },
          body,
        }),
      );
    const bad = await raw("not json");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ code: "invalid_json" });
    expect((await raw(JSON.stringify({ label: "x".repeat(20_000) }))).status).toBe(413);
  });

  it("เกณฑ์ 10: ไม่มี Origin / ต่าง host / null / ผิดรูป / cross-site → 403 bad_origin (ทุกคน) · ไม่สร้างโค้ด", async () => {
    const { c } = await makeAdmin("admin-origin@example.com");
    const plain = await signUp("plain-origin@example.com");
    const before = (await t.db.select().from(inviteCode)).length;
    const cases: Record<string, string | null>[] = [
      { origin: null },
      { origin: "https://evil.example" },
      { origin: "null" },
      { origin: "not a url" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const who of [c, plain, undefined]) {
      for (const h of cases) {
        for (const res of [await postInvite(who, good, h), await revoke(crypto.randomUUID(), who, h)]) {
          expect(res.status, JSON.stringify(h)).toBe(403);
          expect(await res.json()).toEqual({ code: "bad_origin" });
        }
      }
    }
    expect((await t.db.select().from(inviteCode)).length).toBe(before);
    expect((await postInvite(c, good, { "sec-fetch-site": "same-origin" })).status).toBe(201);
  });

  it("เกณฑ์ 6: ครั้งที่ 21 → 429 + X-Retry-After · นับรวมที่ input ผิด · แอดมินอีกคนไม่กระทบ · GET ไม่นับ", async () => {
    const a = await makeAdmin("admin-thr-a@example.com");
    const b = await makeAdmin("admin-thr-b@example.com");
    for (let i = 0; i < 19; i++) expect((await postInvite(a.c)).status).toBe(201);
    expect((await postInvite(a.c, { ...good, days: 99 })).status).toBe(400); // ครั้งที่ 20 ถูกนับแม้ input ผิด
    const res = await postInvite(a.c);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "too_many_requests" });
    const retry = Number(res.headers.get("x-retry-after"));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(86400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await postInvite(b.c)).status).toBe(201);
    const keys = (await t.db.select().from(authThrottle)).map((r) => r.key);
    expect(keys).toContain(`admin-invite:${sha256Hex(a.id)}`);
    expect(keys.some((k) => k.includes(a.id))).toBe(false);
    const [row] = await t.db.select().from(authThrottle).where(eq(authThrottle.key, adminInviteKey(b.id)));
    await invitesGet(req("GET", "/api/admin/invites", b.c));
    const [row2] = await t.db.select().from(authThrottle).where(eq(authThrottle.key, adminInviteKey(b.id)));
    expect(row2.count).toBe(row.count);
  });
});

describe("เกณฑ์ 4: ถอนสิทธิ์มีผลทันที", () => {
  it("ลบแถว app_admin → คำขอถัดไป 404 ทุกเส้นทาง และ isAdmin เป็น false", async () => {
    const { c, id } = await makeAdmin("admin-revoked-rights@example.com");
    expect((await invitesGet(req("GET", "/api/admin/invites", c))).status).toBe(200);
    expect((await (await meGet(req("GET", "/api/me", c))).json()).isAdmin).toBe(true);
    await t.db.delete(appAdmin).where(eq(appAdmin.userId, id));
    for (const res of [await invitesGet(req("GET", "/api/admin/invites", c)), await postInvite(c), await revoke(crypto.randomUUID(), c)]) {
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(NOT_FOUND_BODY);
    }
    expect((await (await meGet(req("GET", "/api/me", c))).json()).isAdmin).toBe(false);
  });
});

describe("POST /api/admin/invites/{id}/revoke (เกณฑ์ 8)", () => {
  it("revoked → unchanged · check ตอบ invalid · exhausted ที่ยังไม่หมดอายุ → revoked · หมดอายุแล้ว → unchanged · ไม่พบ/id ผิดรูป → 404", async () => {
    const { c } = await makeAdmin("admin-revoke@example.com");
    const j = await (await postInvite(c)).json();
    expect(await check(j.code)).toBe("ok");
    const r1 = await revoke(j.id, c);
    expect(r1.status).toBe(200);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    expect(await r1.json()).toEqual({ result: "revoked" });
    expect(await check(j.code)).toBe("invalid");
    expect(await (await revoke(j.id, c)).json()).toEqual({ result: "unchanged" });
    const lst = await (await invitesGet(req("GET", "/api/admin/invites", c))).json();
    expect(lst.invites.find((i: { id: string }) => i.id === j.id).status).toBe("revoked");

    const full = await createInvite(t.db, { label: "full", maxUses: 1, days: 3 }, new Date());
    await t.db.update(inviteCode).set({ usesCount: 1 }).where(eq(inviteCode.id, full.id));
    expect(await (await revoke(full.id, c)).json()).toEqual({ result: "revoked" });

    const old = await createInvite(t.db, { label: "old", maxUses: 1, days: 1 }, new Date(Date.now() - 5 * 86_400_000));
    expect(await (await revoke(old.id, c)).json()).toEqual({ result: "unchanged" });
    const [oldRow] = await t.db.select().from(inviteCode).where(eq(inviteCode.id, old.id));
    expect(oldRow.revokedAt).toBeNull();

    for (const id of [crypto.randomUUID(), "not-a-uuid", j.id.toUpperCase(), j.id.replace(/-/g, "")]) {
      const res = await revoke(id, c);
      expect(res.status, id).toBe(404);
      expect(await res.text()).toBe(NOT_FOUND_BODY);
    }
  });

  it("ไม่อ่าน body (body ใหญ่ก็ไม่เป็นไร)", async () => {
    const { c } = await makeAdmin("admin-revoke-body@example.com");
    const inv = await createInvite(t.db, { label: "b", maxUses: 1, days: 3 }, new Date());
    const res = await revokeRoute.POST(
      new Request(`http://${HOST}/api/admin/invites/${inv.id}/revoke`, {
        method: "POST",
        headers: { host: HOST, origin: `http://${HOST}`, cookie: cookieHeader(c) },
        body: "x".repeat(50_000),
      }),
      { params: Promise.resolve({ id: inv.id }) },
    );
    expect(await res.json()).toEqual({ result: "revoked" });
  });
});

describe("เกณฑ์ 12/13: /api/me และลบบัญชี", () => {
  it("/api/me: isAdmin true/false (state consent_required)", async () => {
    const a = await makeAdmin("me-admin@example.com");
    const p = await signUp("me-plain@example.com");
    const ja = await (await meGet(req("GET", "/api/me", a.c))).json();
    const jp = await (await meGet(req("GET", "/api/me", p))).json();
    expect(ja.state).toBe("consent_required");
    expect(ja.isAdmin).toBe(true);
    expect(jp.isAdmin).toBe(false);
  });

  it("ลบบัญชีแอดมิน → แถว app_admin และ key throttle admin-invite หาย · ของแอดมินอื่นอยู่", async () => {
    const a = await makeAdmin("del-admin@example.com");
    const keep = await makeAdmin("del-admin-keep@example.com");
    await postInvite(a.c);
    await postInvite(keep.c);
    expect((await t.db.select().from(authThrottle).where(eq(authThrottle.key, adminInviteKey(a.id)))).length).toBe(1);
    await deleteAccount(t.db, a.id, "del-admin@example.com");
    expect(await t.db.select().from(appAdmin).where(eq(appAdmin.userId, a.id))).toHaveLength(0);
    const keys = (await t.db.select().from(authThrottle)).map((r) => r.key);
    expect(keys).not.toContain(adminInviteKey(a.id));
    expect(keys).toContain(adminInviteKey(keep.id));
    expect(await t.db.select().from(appAdmin).where(eq(appAdmin.userId, keep.id))).toHaveLength(1);
  });
});

describe("เกณฑ์ 2: ในแอปมีแต่ SELECT ตาราง app_admin", () => {
  it("ไม่มีโค้ดใน src/ (ไม่นับ *.test.ts) ที่ insert/update/delete appAdmin", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) {
          const s = readFileSync(p, "utf8");
          if (/\.(insert|update|delete)\(\s*appAdmin\b/.test(s) || /(insert\s+into|update|delete\s+from)\s+"?app_admin/i.test(s)) hits.push(p);
        }
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(hits).toEqual([]);
  });
});
