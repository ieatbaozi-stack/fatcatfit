import http from "node:http";
import { randomUUID } from "node:crypto";
import { request as pwRequest, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { msg, presetTheme, setLocale, TOKENS, waitForCachedPages, waitForServiceWorker } from "./helpers";
import { applySession, residue, signUp, sql, userIdOf, type TestUser } from "./support/auth";
import { audit, contrast } from "./support/design-audit";

// R2 คลังท่า (R2_CATALOG_CONTRACT.md เกณฑ์ 6, 7, 8, 10 + บันทึกท้ายไฟล์: เพดานนับเฉพาะแถวที่ใช้งาน · is_unilateral · overrides)
// หลังบ้าน e2e seed คลังจริงทั้งก้อน (support/backend.ts) — ไม่ใช่ข้อมูลจำลอง
// ชื่อในเทสต์เป็นชื่อสมมติ · ผู้ใช้ทุกคนสร้างใหม่ต่อเทสต์ (แก้ข้อมูลของตัวเอง)

test.use({ auth: "none" });

// id คลังเป็น UUID v5 (ADR 0008) — หาจากฐานด้วย source_ref ไม่ฝังค่าในเทสต์
const BENCH = { sourceRef: "Barbell_Bench_Press_-_Medium_Grip", name: "Barbell Bench Press - Medium Grip", th: "บาร์เบลเบนช์เพรส กริปกลาง" };
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BADMINTON = { name: "Badminton", th: "แบดมินตัน" };

type Op = { entity: string; id: string; action: "upsert" | "delete"; data?: unknown; client_updated_at?: string; op_id?: string };
type Result = { op_id: string | null; status: "applied" | "stale" | "rejected"; code?: string };

async function push(u: TestUser, ops: Op[]): Promise<Result[]> {
  const body = { v: 1, ops: ops.map((o) => ({ ...o, op_id: o.op_id ?? randomUUID(), client_updated_at: o.client_updated_at ?? new Date().toISOString() })) };
  const res = await u.api.post("/api/sync/push", { data: body });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}
const status = (r: Result) => (r.status === "rejected" ? `rejected:${r.code}` : r.status);
const exData = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  track_type: "weight_reps",
  load_mode: "external",
  is_unilateral: false,
  category: "chest",
  equipment: null,
  ...extra,
});
const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

async function bootstrap(u: TestUser) {
  const res = await u.api.get("/api/bootstrap");
  expect(res.status()).toBe(200);
  return (await res.json()) as { places: { id: string; name: string; archived_at: string | null; last_used_at: string | null }[]; my_exercises: { id: string; name: string }[]; catalog_version: string };
}

// =====================================================================================================
test.describe("R2 API · สิทธิ์ (เกณฑ์ 6)", () => {
  test("B อ่าน/เขียนท่าและสถานที่ของ A ไม่ได้ · ท่าคลังเขียนทับไม่ได้ · ช่องต้องห้าม = invalid", async ({ baseURL }) => {
    const [a, b] = await Promise.all([signUp(baseURL!), signUp(baseURL!)]);
    const aId = (await userIdOf(a.email))!;
    const bId = (await userIdOf(b.email))!;
    const exA = randomUUID();
    const plA = randomUUID();
    expect((await push(a, [
      { entity: "exercise", id: exA, action: "upsert", data: exData("QA ท่าของ A") },
      { entity: "place", id: plA, action: "upsert", data: { name: "QA ที่ของ A" } },
    ])).map(status)).toEqual(["applied", "applied"]);

    // bootstrap: ของใครของมัน
    const bootA = await bootstrap(a);
    const bootB = await bootstrap(b);
    expect(bootA.my_exercises.map((e) => e.id)).toContain(exA);
    expect(bootA.places.map((p) => p.id)).toContain(plA);
    expect(bootB.my_exercises.map((e) => e.id)).not.toContain(exA);
    expect(bootB.places.map((p) => p.id)).not.toContain(plA);
    expect(JSON.stringify(bootB)).not.toContain("QA ท่าของ A");
    expect(JSON.stringify(bootB)).not.toContain(aId);

    // B เขียนด้วย id ของ A
    expect((await push(b, [
      { entity: "exercise", id: exA, action: "upsert", data: exData("B ทับ") },
      { entity: "exercise", id: exA, action: "delete" },
      { entity: "place", id: plA, action: "upsert", data: { name: "B ทับ" } },
      { entity: "place", id: plA, action: "upsert", data: { name: "B ทับ", archived_at: new Date().toISOString() } },
    ])).map(status)).toEqual(["rejected:id_conflict", "rejected:id_conflict", "rejected:id_conflict", "rejected:id_conflict"]);
    // B ลบสถานที่ของ A: CR3 เปิดการลบสถานที่แล้ว (D4) → ของคนอื่น = id_conflict (เดิม R2 D7 = invalid ทุกกรณี)
    expect((await push(b, [{ entity: "place", id: plA, action: "delete" }])).map(status)).toEqual(["rejected:id_conflict"]);
    const [exRow] = await sql<{ name: string; owner_user_id: string; deleted_at: string | null }>(`select name, owner_user_id, deleted_at from exercise where id = $1`, [exA]);
    expect(exRow).toEqual({ name: "QA ท่าของ A", owner_user_id: aId, deleted_at: null });
    const [plRow] = await sql<{ name: string; user_id: string; archived_at: string | null }>(`select name, user_id, archived_at from place where id = $1`, [plA]);
    expect(plRow).toEqual({ name: "QA ที่ของ A", user_id: aId, archived_at: null });

    // ท่าคลังกลาง: id เป็น v5 · push รับเฉพาะ v4 → ใครก็ upsert/delete ไม่ได้ (invalid ก่อนถึงฐาน)
    const bench = await sql<{ id: string; name: string }>(`select id, name from exercise where owner_user_id is null and source_ref = $1`, [BENCH.sourceRef]);
    expect(bench).toHaveLength(1);
    expect(bench[0].name).toBe(BENCH.name);
    const benchId = bench[0].id;
    expect(benchId).toMatch(UUID_V5);
    expect(await sql(`select count(*)::int as n from exercise where owner_user_id is null and id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-5'`)).toEqual([{ n: 0 }]);
    const before = await sql(`select * from exercise where id = $1`, [benchId]);
    expect((await push(a, [
      { entity: "exercise", id: benchId, action: "upsert", data: exData("Hijacked") },
      { entity: "exercise", id: benchId, action: "delete" },
      { entity: "exercise", id: benchId, action: "upsert", data: exData("Hijacked", { archived_at: new Date().toISOString() }) },
    ])).map(status)).toEqual(["rejected:invalid", "rejected:invalid", "rejected:invalid"]);
    expect(await sql(`select * from exercise where id = $1`, [benchId])).toEqual(before);

    // ช่องที่เซิร์ฟเวอร์ตั้งเอง: ส่งมา = invalid ทั้งรายการ ไม่มีแถวเกิด
    const forbidden: Array<[string, Record<string, unknown>]> = [
      ["owner_user_id", { owner_user_id: bId }],
      ["owner_null", { owner_user_id: null }],
      ["license", { license: "MIT" }],
      ["attribution", { attribution: "x" }],
      ["source_dataset", { source_dataset: "free-exercise-db" }],
      ["source_ref", { source_ref: "x" }],
      ["met", { met: 8 }],
      ["name_th", { name_th: "ชื่อไทย" }],
      ["search_terms", { search_terms: "a|b" }],
    ];
    const ids = forbidden.map(() => randomUUID());
    const res = await push(b, forbidden.map(([, extra], i) => ({ entity: "exercise", id: ids[i], action: "upsert" as const, data: exData("QA forbidden", extra) })));
    expect(res.map(status), JSON.stringify(forbidden.map(([k]) => k))).toEqual(forbidden.map(() => "rejected:invalid"));
    const plX = randomUUID();
    expect((await push(b, [{ entity: "place", id: plX, action: "upsert", data: { name: "x", user_id: aId } }])).map(status)).toEqual(["rejected:invalid"]);
    expect(await sql(`select id from exercise where id = any($1::uuid[]) union all select id from place where id = $2`, [ids, plX])).toEqual([]);
    await Promise.all([a.api.dispose(), b.api.dispose()]);
  });

  test("ไม่ล็อกอิน = 401 · ยังไม่ยินยอม = 403 consent_required (catalog · bootstrap · push)", async ({ baseURL }) => {
    const anon = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL!, "x-forwarded-for": "10.9.9.9" } });
    const pending = await signUp(baseURL!, { stage: "signed_in" });
    const body = { v: 1, ops: [{ op_id: "x", entity: "place", id: randomUUID(), action: "upsert", data: { name: "x" }, client_updated_at: new Date().toISOString() }] };
    for (const [ctx, code] of [
      [anon, 401],
      [pending.api, 403],
    ] as const) {
      for (const r of [await ctx.get("/api/catalog"), await ctx.get("/api/bootstrap"), await ctx.post("/api/sync/push", { data: body })]) {
        expect(r.status(), r.url()).toBe(code);
        if (code === 403) expect(await r.json()).toEqual({ code: "consent_required" });
      }
    }
    expect(await sql(`select id from place where id = $1`, [body.ops[0].id])).toEqual([]);
    await anon.dispose();
    await pending.api.dispose();
  });
});

// =====================================================================================================
test.describe("R2 API · push ส่งซ้ำ / LWW / ขีดจำกัด (เกณฑ์ 5 ซ้ำแบบ end-to-end)", () => {
  test("ส่งชุดเดิม 2 ครั้ง + ยิงพร้อมกัน 5 คำขอ = แถวเดียว · เก่ากว่า = stale · ลบแล้ว upsert = stale · load_mode ผิดชนิด / is_unilateral กับวิ่ง = invalid", async ({ baseURL }) => {
    const u = await signUp(baseURL!);
    const id = randomUUID();
    const op: Op = { op_id: "same-op", entity: "exercise", id, action: "upsert", data: exData("QA ซ้ำ"), client_updated_at: at(60_000) };
    expect((await push(u, [op])).map(status)).toEqual(["applied"]);
    expect((await push(u, [op])).map(status)).toEqual(["applied"]);
    expect(await sql(`select count(*)::int as n from exercise where id = $1`, [id])).toEqual([{ n: 1 }]);

    // กดซ้ำเร็วๆ / เน็ตกระตุกแล้วส่งซ้ำพร้อมกัน
    const pid = randomUUID();
    const pop: Op = { entity: "place", id: pid, action: "upsert", data: { name: "QA ซ้ำพร้อมกัน" }, client_updated_at: at(1000) };
    const all = await Promise.all(Array.from({ length: 5 }, () => push(u, [pop])));
    expect(all.flat().map(status)).toEqual(Array(5).fill("applied"));
    expect(await sql(`select count(*)::int as n from place where user_id = $1 and name = 'QA ซ้ำพร้อมกัน'`, [await userIdOf(u.email)])).toEqual([{ n: 1 }]);

    // LWW
    expect((await push(u, [{ ...op, op_id: undefined, data: exData("เก่ากว่า"), client_updated_at: at(120_000) }])).map(status)).toEqual(["stale"]);
    expect((await sql<{ name: string }>(`select name from exercise where id = $1`, [id]))[0].name).toBe("QA ซ้ำ");
    // ลบแล้ว upsert (แม้เวลาใหม่กว่า) = stale · ลบซ้ำ = applied
    expect((await push(u, [{ entity: "exercise", id, action: "delete" }])).map(status)).toEqual(["applied"]);
    expect((await push(u, [{ entity: "exercise", id, action: "delete" }])).map(status)).toEqual(["applied"]);
    expect((await push(u, [{ entity: "exercise", id, action: "upsert", data: exData("ฟื้น") }])).map(status)).toEqual(["stale"]);
    expect((await bootstrap(u)).my_exercises.map((e) => e.id)).not.toContain(id);

    // ชนิดผิด (CHECK + zod)
    const bad = await push(u, [
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("x", { track_type: "duration", load_mode: "assisted" }) },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("x", { track_type: "distance_duration", is_unilateral: true }) },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("x", { track_type: "incline_speed_duration", is_unilateral: true }) },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("x", { category: "legs_glutes" }) },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("x", { equipment: "unspecified" }) },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("   ") },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("ก".repeat(61)) },
      { entity: "place", id: randomUUID(), action: "upsert", data: { name: "" } },
      { entity: "session", id: randomUUID(), action: "upsert", data: {} },
    ]);
    expect(bad.map(status)).toEqual(Array(9).fill("rejected:invalid"));
    // ทีละข้างกับชนิดที่อนุญาต + ชื่อไทยยาว 60 ตัวพอดี = ได้
    expect((await push(u, [{ entity: "exercise", id: randomUUID(), action: "upsert", data: exData("ข".repeat(60), { track_type: "weight_duration", is_unilateral: true }) }])).map(status)).toEqual(["applied"]);
    await u.api.dispose();
  });

  test("เพดานสถานที่ 30 นับเฉพาะแถวที่ใช้งาน · เก็บแห่งสุดท้ายเข้ากรุไม่ได้ · เอาออกจากกรุตอนเต็ม = limit_reached", async ({ baseURL }) => {
    const u = await signUp(baseURL!); // มีที่ 1 แห่งจากแบบสอบถาม
    const boot = await bootstrap(u);
    expect(boot.places).toHaveLength(1);
    const home = boot.places[0];
    // แห่งสุดท้าย
    expect((await push(u, [{ entity: "place", id: home.id, action: "upsert", data: { name: home.name, archived_at: new Date().toISOString() } }])).map(status)).toEqual(["rejected:invalid"]);
    const ids = Array.from({ length: 29 }, () => randomUUID());
    expect((await push(u, ids.map((id, i) => ({ entity: "place", id, action: "upsert" as const, data: { name: `QA ที่ ${i}` } })))).every((r) => r.status === "applied")).toBe(true);
    expect((await push(u, [{ entity: "place", id: randomUUID(), action: "upsert", data: { name: "QA ที่ 31" } }])).map(status)).toEqual(["rejected:limit_reached"]);
    // เก็บเข้ากรุ 1 → เพิ่มได้อีก 1 → เอาที่ในกรุออกตอนเต็ม = limit_reached
    expect((await push(u, [{ entity: "place", id: ids[0], action: "upsert", data: { name: "QA ที่ 0", archived_at: new Date().toISOString() } }])).map(status)).toEqual(["applied"]);
    expect((await push(u, [{ entity: "place", id: randomUUID(), action: "upsert", data: { name: "QA ที่ใหม่" } }])).map(status)).toEqual(["applied"]);
    expect((await push(u, [{ entity: "place", id: ids[0], action: "upsert", data: { name: "QA ที่ 0", archived_at: null } }])).map(status)).toEqual(["rejected:limit_reached"]);
    // แก้ชื่อที่ใช้งานอยู่ตอนเต็ม = ได้ (ไม่ใช่แถวใช้งานใหม่)
    expect((await push(u, [{ entity: "place", id: ids[1], action: "upsert", data: { name: "QA แก้ชื่อตอนเต็ม" } }])).map(status)).toEqual(["applied"]);
    const uid = await userIdOf(u.email);
    expect(await sql(`select count(*)::int as n from place where user_id = $1 and archived_at is null`, [uid])).toEqual([{ n: 30 }]);
    await u.api.dispose();
  });

  test("เพดานท่าของฉัน 300 นับเฉพาะแถวที่ใช้งาน (ท่าที่ลบ/ในกรุไม่นับ)", async ({ baseURL }) => {
    test.setTimeout(120_000);
    const u = await signUp(baseURL!);
    const ids = Array.from({ length: 300 }, () => randomUUID());
    for (let i = 0; i < 300; i += 100) {
      const r = await push(u, ids.slice(i, i + 100).map((id, j) => ({ entity: "exercise", id, action: "upsert" as const, data: exData(`QA ท่า ${i + j}`) })));
      expect(r.every((x) => x.status === "applied"), JSON.stringify(r.find((x) => x.status !== "applied"))).toBe(true);
    }
    expect((await push(u, [{ entity: "exercise", id: randomUUID(), action: "upsert", data: exData("QA ท่า 301") }])).map(status)).toEqual(["rejected:limit_reached"]);
    expect((await push(u, [
      { entity: "exercise", id: ids[0], action: "delete" },
      { entity: "exercise", id: ids[1], action: "upsert", data: exData("QA ท่า 1", { archived_at: new Date().toISOString() }) },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("QA ท่าใหม่ 1") },
      { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("QA ท่าใหม่ 2") },
      { entity: "exercise", id: ids[1], action: "upsert", data: exData("QA ท่า 1", { archived_at: null }) },
    ])).map(status)).toEqual(["applied", "applied", "applied", "applied", "rejected:limit_reached"]);
    await u.api.dispose();
  });
});

// =====================================================================================================
/** GET ดิบ (ไม่คลาย gzip) — วัดขนาดที่ส่งจริงบนสาย */
function rawGet(url: string, headers: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; bytes: number }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        let bytes = 0;
        res.on("data", (c: Buffer) => (bytes += c.length));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, bytes }));
      })
      .on("error", reject);
  });
}

test.describe("R2 API · คลังกลาง (เกณฑ์ 3 บนฐานจริง · 10)", () => {
  test("/api/catalog คลังจริงครบ · ไม่มีวิธีทำท่า/รูป · ETag → 304 · ขนาด gzip บนสาย", async ({ baseURL }, info) => {
    const u = await signUp(baseURL!);
    const res = await u.api.get("/api/catalog");
    expect(res.status()).toBe(200);
    const etag = res.headers()["etag"];
    const body = (await res.json()) as { catalog_version: string; exercises: Record<string, unknown>[] };
    expect(etag).toBe(`"${body.catalog_version}"`);
    expect(body.exercises.length).toBe(961);
    expect(body.catalog_version).toMatch(/^961-\d+$/);
    expect((await bootstrap(u)).catalog_version).toBe(body.catalog_version);
    for (const e of body.exercises) {
      expect(Object.keys(e).filter((k) => /instruction|image|video|gif|description/i.test(k))).toEqual([]);
      expect(e.name_th && e.source_dataset && e.license && e.attribution, String(e.name)).toBeTruthy();
      expect(e).not.toHaveProperty("owner_user_id");
    }
    const sports = body.exercises.filter((e) => e.category === "cardio" || e.category === "sport").length;
    expect(sports).toBeGreaterThanOrEqual(60);
    expect(sports).toBeLessThanOrEqual(100);

    const again = await u.api.get("/api/catalog", { headers: { "If-None-Match": etag } });
    expect(again.status()).toBe(304);
    expect(await again.body()).toHaveLength(0);
    expect((await u.api.get("/api/catalog", { headers: { "If-None-Match": `W/${etag}` } })).status()).toBe(304);
    expect((await u.api.get("/api/catalog", { headers: { "If-None-Match": `"0-0"` } })).status()).toBe(200);

    // ขนาดบนสาย (next start บีบอัดเอง · Vercel บีบที่ edge — ตัวเลขนี้เป็นค่าประมาณ)
    const cookie = u.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const gz = await rawGet(`${baseURL}/api/catalog`, { cookie, "accept-encoding": "gzip", "x-forwarded-for": u.ip });
    const plain = await rawGet(`${baseURL}/api/catalog`, { cookie, "accept-encoding": "identity", "x-forwarded-for": u.ip });
    expect(gz.status).toBe(200);
    expect(gz.headers["content-encoding"]).toBe("gzip");
    const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
    info.annotations.push({ type: "catalog-size", description: `gzip ${kb(gz.bytes)} · ไม่บีบ ${kb(plain.bytes)}` });
    console.log(`[qa] /api/catalog: gzip ${kb(gz.bytes)} · uncompressed ${kb(plain.bytes)}`);
    expect.soft(gz.bytes, "เกณฑ์ 10: เกิน 200 KB ต้องให้ Lead ตัดสิน").toBeLessThan(200 * 1024);
    await u.api.dispose();
  });
});

// =====================================================================================================
test.describe("R2 ลบบัญชี (เกณฑ์ 7)", () => {
  test("ท่าของฉัน (ใช้งาน/ในกรุ/ลบแล้ว) + สถานที่หายหมด · ท่าคลังครบ · ตาราง owner_user_id ถูกนับ · ผู้ใช้อื่นไม่ถูกแตะ", async ({ baseURL }) => {
    const [u, other] = await Promise.all([signUp(baseURL!), signUp(baseURL!)]);
    const uid = (await userIdOf(u.email))!;
    const oid = (await userIdOf(other.email))!;
    const [e1, e2, e3, p1, p2, oe] = Array.from({ length: 6 }, () => randomUUID());
    await push(u, [
      { entity: "exercise", id: e1, action: "upsert", data: exData("QA ลบ 1") },
      { entity: "exercise", id: e2, action: "upsert", data: exData("QA ลบ 2", { archived_at: new Date().toISOString() }) },
      { entity: "exercise", id: e3, action: "upsert", data: exData("QA ลบ 3") },
      { entity: "place", id: p1, action: "upsert", data: { name: "QA ลบที่ 1", last_used_at: new Date().toISOString() } },
      { entity: "place", id: p2, action: "upsert", data: { name: "QA ลบที่ 2" } },
    ]);
    await push(u, [{ entity: "exercise", id: e3, action: "delete" }]);
    await push(other, [{ entity: "exercise", id: oe, action: "upsert", data: exData("QA คนอื่น") }]);
    const catalogBefore = await sql(`select count(*)::int as n, max(updated_at)::text as m from exercise where owner_user_id is null`);
    const before = await residue(uid, u.email);
    expect(before["exercise.owner_user_id"], JSON.stringify(before)).toBe(3); // รวมแถวที่ลบแบบ tombstone
    expect(before.place).toBe(3);
    const otherBefore = await residue(oid, other.email);

    const del = await u.api.delete("/api/me");
    expect(del.status()).toBe(200);
    const left = await residue(uid, u.email);
    expect(Object.keys(left)).toContain("exercise.owner_user_id"); // ตารางที่มีเจ้าของผ่าน owner_user_id ถูกวน
    expect(Object.values(left).every((n) => n === 0), JSON.stringify(left)).toBe(true);
    expect(await sql(`select count(*)::int as n from exercise where id = any($1::uuid[])`, [[e1, e2, e3]])).toEqual([{ n: 0 }]);
    expect(await sql(`select count(*)::int as n, max(updated_at)::text as m from exercise where owner_user_id is null`)).toEqual(catalogBefore);
    expect(catalogBefore[0]).toMatchObject({ n: 961 });
    expect(await residue(oid, other.email)).toEqual(otherBefore);
    await Promise.all([u.api.dispose(), other.api.dispose()]);
  });
});

// =====================================================================================================
// UI (เกณฑ์ 8): จอกว้าง 360 px · เฉพาะโปรเจกต์ mobile (desktop เป็นจอคอม ไม่ใช่เกณฑ์ข้อนี้)

const W360 = { width: 360, height: 760 };
type L = "th" | "en";

async function asUser(page: Page, baseURL: string, l: L, theme: "light" | "dark") {
  const u = await signUp(baseURL, { locale: l });
  await setLocale(page.context(), baseURL, l);
  await presetTheme(page, theme);
  await applySession(page.context(), u);
  return u;
}

/** ผลค้นหา (section ที่ชื่อเท่าหัวหน้า เมื่อมีคำค้น) */
const results = (page: Page, l: L) => page.getByRole("region", { name: msg(l, "exercises.title") });
const search = (page: Page) => page.getByRole("searchbox");

/** จอไม่เลื่อนแนวนอน และไม่มีอะไรล้นจอ (ยกเว้นของในแถบเลื่อนแนวนอน เช่นชิปหมวด) */
async function expectFits(page: Page) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (cs.position === "absolute" && (cs.clipPath === "inset(50%)" || /rect\(0px/.test(cs.clip))) continue;
      if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
      let p = el.parentElement;
      let scroller = false;
      for (; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) scroller = true;
      if (scroller) continue;
      const b = el.getBoundingClientRect();
      if (b.width && b.height && (b.right > vw + 0.5 || b.left < -0.5)) out.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 50)}`);
      // ข้อความล้นกล่องตัวเอง (ไม่ได้ตั้งใจตัดด้วย truncate/line-clamp)
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === "visible" && el.children.length === 0 && el.textContent?.trim()) out.push(`text-overflow: ${el.textContent.trim().slice(0, 30)}`);
    }
    return { vw, scrollW, out: out.slice(0, 10) };
  });
  expect(r.scrollW, "scrollWidth > viewport").toBeLessThanOrEqual(r.vw);
  expect(r.out, "sticking out").toEqual([]);
}

async function expectDesign(page: Page, l: L, theme: "light" | "dark", where: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(TOKENS[theme].paper);
  await expectFits(page);
  const a = await audit(page);
  const problems: string[] = [];
  for (const t of a.texts) {
    if (t.size < 14) problems.push(`font < 14px: "${t.text}" ${t.size}px`);
    if (!t.disabled && contrast(t.color, t.bg) < 4.5) problems.push(`contrast ${contrast(t.color, t.bg).toFixed(2)}: "${t.text}" (${t.cls})`);
  }
  expect(problems, `${where}: text`).toEqual([]);
  expect(a.small, `${where}: touch targets < 44px`).toEqual([]);
  expect(a.orange.length, `${where}: orange outside the cat: ${a.orange.join(" | ")}`).toBeLessThanOrEqual(1);
  if (l === "en") expect(a.visibleText.match(/[฀-๿][^\n]{0,30}/g) ?? [], `${where}: Thai text on an English screen`).toEqual([]);
}

test.describe("R2 UI · จอ 360 px", () => {
  test.use({ viewport: W360 });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "เกณฑ์ 8 เป็นจอมือถือ 360 px");
  });

  test("ไทย · สว่าง: ค้นท่า (bench / เบนช์ / เบ็นช์เพรส / แบด) · สร้างจากคำค้น · แก้ · เก็บเข้ากรุ/เลิกทำ/เอาออก · ลบ", async ({ page, baseURL }) => {
    const l = "th";
    const u = await asUser(page, baseURL!, l, "light");
    const uid = (await userIdOf(u.email))!;
    await page.goto("/me");
    await page.getByRole("link", { name: msg(l, "me.exercises") }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "exercises.title"));
    await expect(page.getByText(msg(l, "exercises.mineEmpty"))).toBeVisible();

    // bench → อยู่ 3 อันดับแรก · ไทยแสดงชื่อไทยตัวใหญ่ + อังกฤษตัวเล็ก
    for (const q of ["bench", "เบนช์", "เบ็นช์เพรส", "เบนช เพรส"]) {
      await search(page).fill(q);
      const top3 = await results(page, l).getByRole("button").evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent ?? ""));
      expect(top3.some((t) => t.includes(BENCH.th) && t.includes(BENCH.name)), `${q}: ${top3.join(" / ")}`).toBe(true);
    }
    await search(page).fill("แบด");
    await expect(results(page, l).getByRole("button").first()).toContainText(BADMINTON.th);
    await expect(page).toHaveURL(/\?q=/); // คำค้นอยู่ใน URL

    // แผ่นรายละเอียดท่าคลัง (อ่านอย่างเดียว)
    await results(page, l).getByRole("button").first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText(msg(l, "exercise.category.sport"));
    await expect(sheet).toContainText(msg(l, "exercise.track.duration"));
    await sheet.getByRole("button", { name: msg(l, "exercises.detail.close") }).click();
    await expect(sheet).toBeHidden();

    // ค้นไม่เจอ → ปุ่มสร้างจากคำค้น
    const name = `ท่าทดสอบคิวเอ ${Date.now().toString(36)}`;
    await search(page).fill(name);
    await expect(page.getByRole("status").filter({ hasText: msg(l, "exercises.noMatch").replace("{q}", name) })).toBeVisible();
    await page.getByRole("link", { name: msg(l, "exercises.createFrom").replace("{q}", name) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "exerciseForm.newTitle"));
    await expect(page.getByLabel(msg(l, "exerciseForm.name"))).toHaveValue(name);
    const save = page.getByRole("button", { name: msg(l, "exerciseForm.save") });
    await expect(save).toBeDisabled(); // หมวด + ชนิดการจดยังไม่เลือก
    await page.getByRole("radiogroup", { name: msg(l, "exerciseForm.category") }).getByRole("radio", { name: msg(l, "exercise.category.legs") }).click();
    await page.getByRole("radiogroup", { name: msg(l, "exerciseForm.track") }).getByRole("radio", { name: new RegExp(`^${msg(l, "exercise.track.weight_reps")}`) }).click();
    await page.getByRole("radiogroup", { name: msg(l, "exercise.load.label") }).getByRole("radio", { name: msg(l, "exercise.load.bodyweight_plus") }).click();
    await page.getByRole("switch", { name: new RegExp(msg(l, "exerciseForm.unilateral")) }).click();
    // กดบันทึกซ้ำเร็วๆ ต้องได้แถวเดียว
    await save.dblclick();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.saved") })).toBeVisible();
    await expect(page).toHaveURL(/\/me\/exercises\?q=/);
    const rows = await sql<{ id: string; track_type: string; load_mode: string; is_unilateral: boolean; category: string }>(
      `select id, track_type, load_mode, is_unilateral, category from exercise where owner_user_id = $1 and deleted_at is null`,
      [uid],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ track_type: "weight_reps", load_mode: "bodyweight_plus", is_unilateral: true, category: "legs" });
    const myId = rows[0].id;

    // ค้นอีกครั้ง: ท่าของฉันขึ้นก่อน (ลิงก์ ไม่ใช่ปุ่มของคลัง)
    await search(page).fill("ท่าทดสอบคิวเอ");
    await expect(results(page, l).getByRole("listitem").first().getByRole("link")).toContainText(name);
    // ค้น "สควอท" (หมวดขา): คำที่ไม่ได้อยู่ในชื่อของฉัน ไม่ขึ้นท่าของฉัน
    await search(page).fill("สควอท");
    await expect(results(page, l)).not.toContainText(name);

    // แก้ชื่อ
    await search(page).fill("ท่าทดสอบคิวเอ");
    await results(page, l).getByRole("link", { name: new RegExp(name) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "exerciseForm.editTitle"));
    await expect(page.getByRole("switch", { name: new RegExp(msg(l, "exerciseForm.unilateral")) })).toHaveAttribute("aria-checked", "true");
    const renamed = `${name} แก้`;
    await page.getByLabel(msg(l, "exerciseForm.name")).fill(renamed);
    await page.getByRole("button", { name: msg(l, "exerciseForm.save") }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.saved") })).toBeVisible();
    expect((await sql<{ name: string }>(`select name from exercise where id = $1`, [myId]))[0].name).toBe(renamed);

    // เก็บเข้ากรุ → ค้นไม่เจอ → เลิกทำจาก toast → เจออีก
    await results(page, l).getByRole("link", { name: new RegExp(renamed) }).click();
    await page.getByRole("button", { name: msg(l, "exerciseForm.archive"), exact: true }).click();
    const toast = page.getByRole("status").filter({ hasText: msg(l, "toast.archived") });
    await expect(toast).toBeVisible();
    await expect(results(page, l)).toBeHidden(); // ค้นไม่เจอท่าที่อยู่ในกรุ
    await toast.getByRole("button", { name: msg(l, "toast.undo") }).click();
    await expect(results(page, l).getByRole("link", { name: new RegExp(renamed) })).toBeVisible();
    await expect.poll(async () => (await sql<{ a: string | null }>(`select archived_at::text as a from exercise where id = $1`, [myId]))[0].a).toBeNull();

    // เก็บอีกครั้ง แล้วเอาออกจากกรุผ่านรายการ "ในกรุ"
    await results(page, l).getByRole("link", { name: new RegExp(renamed) }).click();
    await page.getByRole("button", { name: msg(l, "exerciseForm.archive"), exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.archived") })).toBeVisible();
    await page.getByRole("button", { name: msg(l, "exercises.clear") }).click();
    await page.getByRole("button", { name: msg(l, "exercises.archived").replace("{count}", "1") }).click();
    await page.getByRole("link", { name: new RegExp(renamed) }).click();
    await page.getByRole("button", { name: msg(l, "exerciseForm.unarchive") }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.unarchived") })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: msg(l, "exercises.mine").replace("{count}", "1") })).toBeVisible();

    // ลบ
    await page.getByRole("link", { name: new RegExp(renamed) }).click();
    await page.getByRole("button", { name: msg(l, "exerciseForm.delete") }).click();
    await page.getByRole("dialog").getByRole("button", { name: msg(l, "exerciseForm.deleteConfirm"), exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.deleted") })).toBeVisible();
    await expect(page.getByText(msg(l, "exercises.mineEmpty"))).toBeVisible();
    expect((await sql<{ d: string | null }>(`select deleted_at::text as d from exercise where id = $1`, [myId]))[0].d).not.toBeNull();
    // เปิด URL ของท่าที่ลบแล้ว = ไม่เจอ (ไม่พัง)
    await page.goto(`/me/exercises/${myId}`);
    await expect(page.getByText(msg(l, "exerciseForm.notFound"))).toBeVisible();
    await u.api.dispose();
  });

  test("อังกฤษ · มืด: สถานที่ เพิ่ม/แก้ชื่อ/เก็บ/เอาออก · แห่งสุดท้ายเก็บไม่ได้ · ชิปหน้าหลักเลือกแล้วรีโหลดยังอยู่ · เครดิต", async ({ page, baseURL }) => {
    const l = "en";
    const u = await asUser(page, baseURL!, l, "dark");
    const uid = (await userIdOf(u.email))!;
    const home = (await bootstrap(u)).places[0];

    await page.goto("/me");
    await expect(page.getByRole("link", { name: new RegExp(msg(l, "me.places")) })).toContainText("1 place");
    await page.getByRole("link", { name: new RegExp(msg(l, "me.places")) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "places.title"));

    // แห่งเดียว = เก็บเข้ากรุไม่ได้
    await page.getByRole("button", { name: home.name }).click();
    let sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: msg(l, "places.archive") })).toBeDisabled();
    await expect(sheet.getByText(msg(l, "places.lastOne"))).toBeVisible();
    await page.keyboard.press("Escape"); // แผ่นปิดด้วยพื้นมืด / ลากลง / Esc (UX 12.3)
    await expect(sheet).toBeHidden();

    // เพิ่ม (ชื่อซ้ำเตือนแต่ไม่บล็อก)
    await page.getByRole("button", { name: `+ ${msg(l, "places.add")}` }).click();
    sheet = page.getByRole("dialog");
    await sheet.getByLabel(msg(l, "places.name")).fill(home.name.toUpperCase());
    await expect(sheet.getByText(msg(l, "places.duplicate"))).toBeVisible();
    await sheet.getByLabel(msg(l, "places.name")).fill("QA Gym");
    await sheet.getByRole("button", { name: msg(l, "places.addButton"), exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.added") })).toBeVisible();

    // แก้ชื่อ
    await page.getByRole("button", { name: "QA Gym" }).click();
    sheet = page.getByRole("dialog");
    await sheet.getByLabel(msg(l, "places.name")).fill("QA Gym Two");
    await sheet.getByRole("button", { name: msg(l, "places.save") }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.saved") })).toBeVisible();

    // เก็บเข้ากรุ แล้วเอาออก
    await page.getByRole("button", { name: "QA Gym Two" }).click();
    await page.getByRole("dialog").getByRole("button", { name: msg(l, "places.archive") }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.archived") })).toBeVisible();
    await page.getByRole("button", { name: msg(l, "places.archivedSection").replace("{count}", "1") }).click();
    await page.getByRole("button", { name: msg(l, "places.unarchive") }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.unarchived") })).toBeVisible();
    await expect.poll(async () => (await sql(`select name from place where user_id = $1 and archived_at is null order by name`, [uid])).map((r) => r.name)).toEqual([home.name, "QA Gym Two"]);

    // ชิปหน้าหลัก: เลือกที่อื่น → รีโหลด → ยังอยู่ (จำที่เซิร์ฟเวอร์)
    await page.goto("/");
    const chip = page.getByRole("button", { name: /^At / });
    await expect(chip).toBeVisible();
    const current = (await chip.getAttribute("aria-label"))!;
    const target = current.includes("QA Gym Two") ? home.name : "QA Gym Two";
    await chip.click();
    sheet = page.getByRole("dialog", { name: msg(l, "placePicker.title") });
    await sheet.getByRole("button", { name: new RegExp(`^${target}`) }).click();
    await expect(chip).toHaveAttribute("aria-label", msg(l, "placePicker.chipLabel").replace("{place}", target));
    await expect.poll(async () => (await sql<{ name: string }>(`select name from place where user_id = $1 order by last_used_at desc nulls last limit 1`, [uid]))[0].name).toBe(target);
    await page.reload();
    await expect(page.getByRole("button", { name: /^At / })).toHaveAttribute("aria-label", msg(l, "placePicker.chipLabel").replace("{place}", target));
    // เครื่องอื่น (context ใหม่) เห็นที่เดียวกัน
    const other = await page.context().browser()!.newContext({ viewport: W360, locale: "en-US" });
    await setLocale(other, baseURL!, "en");
    await applySession(other, u);
    const p2 = await other.newPage();
    await p2.goto("/");
    await expect(p2.getByRole("button", { name: /^At / })).toHaveAttribute("aria-label", msg(l, "placePicker.chipLabel").replace("{place}", target));
    await other.close();

    // เครดิต
    await page.goto("/me");
    await page.getByRole("link", { name: msg(l, "me.credits") }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "credits.title"));
    await expect(page.getByRole("heading", { level: 2, name: "free-exercise-db" })).toBeVisible();
    await expect(page.getByText(msg(l, "credits.license").replace("{license}", "Unlicense"))).toBeVisible();
    await expect(page.getByRole("link", { name: "https://github.com/yuhonas/free-exercise-db" })).toHaveAttribute("rel", /noopener/);
    await u.api.dispose();
  });

  // BUG R2-QA-2 (qa แก้แล้ว): คำตอบของ push หายระหว่างทาง (เซิร์ฟเวอร์บันทึกแล้ว) → กด "ลองใหม่" เคยสร้าง id ใหม่ = สถานที่ซ้ำ
  test("BUG R2-QA-2: คำตอบหายแล้วกดลองใหม่ = ไม่เกิดสถานที่/ท่าซ้ำ", async ({ page, baseURL }) => {
    const l = "en";
    const u = await asUser(page, baseURL!, l, "light");
    const uid = (await userIdOf(u.email))!;
    let drop = 0;
    await page.route("**/api/sync/push", async (route) => {
      if (drop > 0) {
        drop -= 1;
        await route.fetch(); // ถึงเซิร์ฟเวอร์แล้ว
        await route.abort("failed"); // แต่คำตอบหาย
        return;
      }
      await route.continue();
    });
    // สถานที่ (หน้า สถานที่)
    await page.goto("/me/places");
    await page.getByRole("button", { name: `+ ${msg(l, "places.add")}` }).click();
    let sheet = page.getByRole("dialog");
    await sheet.getByLabel(msg(l, "places.name")).fill("QA Lost Reply");
    drop = 1;
    await sheet.getByRole("button", { name: msg(l, "places.addButton"), exact: true }).click();
    await sheet.getByRole("button", { name: msg(l, "places.retry") }).click();
    await expect(sheet).toBeHidden();
    // สถานที่ (แผ่นเลือกบนหน้าหลัก)
    await page.goto("/");
    await page.getByRole("button", { name: /^At / }).click();
    sheet = page.getByRole("dialog");
    await sheet.getByLabel(msg(l, "places.add")).fill("QA Lost Chip");
    drop = 1;
    await sheet.getByRole("button", { name: msg(l, "places.addButton"), exact: true }).click();
    await sheet.getByRole("button", { name: msg(l, "places.retry") }).click();
    await expect(sheet).toBeHidden();
    expect(await sql(`select name, count(*)::int as n from place where user_id = $1 and name like 'QA Lost%' group by name order by name`, [uid])).toEqual([
      { name: "QA Lost Chip", n: 1 },
      { name: "QA Lost Reply", n: 1 },
    ]);
    // ท่าของฉัน (id คงที่ในฟอร์มอยู่แล้ว — กันถอยหลัง)
    await page.goto("/me/exercises?q=QA%20Lost%20Ex");
    await page.getByRole("link", { name: msg(l, "exercises.createFrom").replace("{q}", "QA Lost Ex") }).last().click();
    await page.getByRole("radiogroup", { name: msg(l, "exerciseForm.category") }).getByRole("radio", { name: msg(l, "exercise.category.chest") }).click();
    await page.getByRole("radiogroup", { name: msg(l, "exerciseForm.track") }).getByRole("radio").first().click();
    drop = 1;
    await page.getByRole("button", { name: msg(l, "exerciseForm.save") }).click();
    await page.getByRole("button", { name: msg(l, "exerciseForm.retry") }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.saved") })).toBeVisible();
    expect(await sql(`select count(*)::int as n from exercise where owner_user_id = $1`, [uid])).toEqual([{ n: 1 }]);
    await u.api.dispose();
  });

  for (const theme of ["light", "dark"] as const) {
    for (const l of ["th", "en"] as const) {
      test(`หน้าตา ${theme} · ${l}: คอนทราสต์ · ฟอนต์ · ปุ่ม ≥ 44px · ไม่ล้นจอ · ส้ม ≤ 1 · ${l === "en" ? "ไม่มีไทยหลุด" : "ไทย"}`, async ({ page, baseURL }) => {
        const u = await asUser(page, baseURL!, l, theme);
        // ท่าของฉันชื่อยาว (ทดสอบล้นจอ) + ในกรุ 1 ท่า · สถานที่ชื่อยาว
        const long = l === "th" ? "ท่าของฉันชื่อยาวมากๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆ" : "My very very long custom exercise name that goes on and on";
        await push(u, [
          { entity: "exercise", id: randomUUID(), action: "upsert", data: exData(long.slice(0, 60)) },
          { entity: "exercise", id: randomUUID(), action: "upsert", data: exData("Archived one", { archived_at: new Date().toISOString() }) },
          { entity: "place", id: randomUUID(), action: "upsert", data: { name: "W".repeat(60), last_used_at: new Date().toISOString() } },
        ]);
        const screens: Array<[string, () => Promise<unknown>]> = [
          ["me", async () => {
            await page.goto("/me");
            await expect(page.getByRole("link", { name: msg(l, "me.credits") })).toBeVisible();
          }],
          ["home-chip", async () => {
            await page.goto("/");
            await expect(page.getByRole("button", { name: /^(At|เล่นที่)/ })).toBeVisible();
          }],
          ["place-picker", async () => {
            await page.getByRole("button", { name: /^(At|เล่นที่)/ }).click();
            await expect(page.getByRole("dialog")).toBeVisible();
          }],
          ["exercises-browse", async () => {
            await page.goto("/me/exercises");
            await expect(page.getByRole("heading", { level: 2, name: msg(l, "exercises.mine").replace("{count}", "1") })).toBeVisible();
          }],
          ["exercises-category", async () => {
            await page.getByRole("group", { name: msg(l, "exercises.categories") }).getByRole("button", { name: msg(l, "exercise.category.chest") }).click();
            await expect(page.getByRole("heading", { level: 2, name: new RegExp(msg(l, "exercise.category.chest")) })).toBeVisible();
          }],
          ["exercises-search", async () => {
            await page.goto("/me/exercises?q=press");
            await expect(results(page, l).getByRole("listitem").first()).toBeVisible();
          }],
          ["exercises-nomatch", async () => {
            await page.goto(`/me/exercises?q=${"z".repeat(60)}`);
            await expect(page.getByRole("link", { name: new RegExp(msg(l, "exercises.createFrom").split("{q}")[0]) }).last()).toBeVisible();
          }],
          ["exercise-detail", async () => {
            await page.goto("/me/exercises?q=bench");
            await results(page, l).getByRole("button").first().click();
            await expect(page.getByRole("dialog")).toBeVisible();
          }],
          ["exercise-new", async () => {
            await page.goto("/me/exercises/new");
            await page.getByRole("radiogroup", { name: msg(l, "exerciseForm.track") }).getByRole("radio").first().click();
            await expect(page.getByRole("radiogroup", { name: msg(l, "exercise.load.label") })).toBeVisible();
          }],
          ["places", async () => {
            await page.goto("/me/places");
            await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "places.title"));
          }],
          ["place-edit", async () => {
            await page.getByRole("button", { name: "W".repeat(60) }).click();
            await expect(page.getByRole("dialog")).toBeVisible();
          }],
          ["credits", async () => {
            await page.goto("/me/credits");
            await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg(l, "credits.title"));
          }],
        ];
        for (const [name, open] of screens) {
          await open();
          await expectDesign(page, l, theme, name);
        }
        await u.api.dispose();
      });
    }
  }
});

// =====================================================================================================
// ออฟไลน์ (R2 ออนไลน์อย่างเดียว · /me/exercises /me/places /me/credits ไม่อยู่ใน OFFLINE_PAGES) — ต้องไม่พัง
test.describe("R2 ออฟไลน์: เปิดหน้าใหม่ของรอบตรงๆ ไม่พัง", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "พฤติกรรม SW เหมือนกันทุกจอ");
  });

  async function offlineAt(page: Page, context: import("@playwright/test").BrowserContext, baseURL: string) {
    const u = await asUser(page, baseURL, "th", "light");
    await page.goto("/");
    await waitForServiceWorker(page);
    await waitForCachedPages(page, ["/"]);
    await context.setOffline(true);
    return u;
  }

  test("เปิด /me/exercises /me/places /me/credits ตอนออฟไลน์ = app shell พร้อมแถบล่าง (ไม่ใช่หน้า error ของเบราว์เซอร์)", async ({ page, context, baseURL }) => {
    const u = await offlineAt(page, context, baseURL!);
    for (const p of ["/me/exercises", "/me/places", "/me/credits"]) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(200);
      await expect(page.getByRole("navigation", { name: msg("th", "nav.label") }), p).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 }), p).toBeVisible();
    }
    await context.setOffline(false);
    await u.api.dispose();
  });

  // BUG R2-QA-1 (ยังไม่แก้ · รายงาน Lead): URL ของฟอร์มท่า (/me/exercises/new, /me/exercises/<id>) ไม่อยู่ใน cache
  // → SW ถอยไป app shell (เนื้อหาหน้าหลัก) แต่ hidesTabs() ซ่อนแถบล่างตาม URL → จอหน้าหลักที่ไม่มีทางไปไหน (แอปที่ติดตั้งไม่มีปุ่มย้อน)
  // test.fail = พฤติกรรมที่ถูกคือมีทางออก · แก้แล้วเทสต์นี้จะแดงให้เอา test.fail ออก
  test("R2-QA-1: เปิดฟอร์มท่าตอนออฟไลน์ ต้องมีทางออก (แถบล่าง หรือจอบอกต้องต่อเน็ต)", async ({ page, context, baseURL }) => {
    const u = await offlineAt(page, context, baseURL!);
    for (const p of ["/me/exercises/new", `/me/exercises/${randomUUID()}`]) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }), p).toBeVisible();
      const nav = await page.getByRole("navigation", { name: msg("th", "nav.label") }).count();
      const close = await page.getByRole("button", { name: msg("th", "exerciseForm.close") }).count();
      expect(nav + close, `${p}: ไม่มีทางออกจากจอ`).toBeGreaterThan(0);
    }
    await context.setOffline(false);
    await u.api.dispose();
  });

  test("อยู่ในแอปแล้วเน็ตหลุด: จอท่า/สถานที่บอกต้องต่อเน็ต · ปุ่มสร้าง/เพิ่มปิด · ไม่ยิงคำขอเขียน", async ({ page, context, baseURL }) => {
    const u = await asUser(page, baseURL!, "th", "light");
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/sync/push")) writes.push(r.url());
    });
    await page.goto("/me/exercises");
    await expect(page.getByText(msg("th", "exercises.mineEmpty"))).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: msg("th", "exercises.needNet") })).toBeVisible();
    await expect(page.getByRole("link", { name: `+ ${msg("th", "exercises.create")}` })).toHaveCount(0);
    // ค้นยังได้ (คลังอยู่ในหน่วยความจำของแท็บ)
    await search(page).fill("bench");
    await expect(results(page, "th").getByRole("button").first()).toBeVisible();

    await context.setOffline(false);
    await page.goto("/me/places");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(msg("th", "places.title"));
    await expect(page.getByRole("button", { name: `+ ${msg("th", "places.add")}` })).toBeEnabled();
    await context.setOffline(true);
    await expect(page.getByRole("button", { name: `+ ${msg("th", "places.add")}` })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: msg("th", "places.needNet") })).toBeVisible();
    expect(writes).toEqual([]);
    await context.setOffline(false);
    await u.api.dispose();
  });
});

