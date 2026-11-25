import { randomUUID } from "node:crypto";
import type { Page, Request as PwRequest } from "@playwright/test";
import { expect, test } from "./fixtures";
import { msg, presetTheme, setLocale, TOKENS, expectNoHorizontalOverflow, waitForAuthReady, waitForCachedPages, waitForServiceWorker } from "./helpers";
import { applySession, residue, signUp, sql, userIdOf, type TestUser } from "./support/auth";
import { audit, contrast } from "./support/design-audit";
import { normalizeQuery, rankExercise, searchExercises } from "../../src/lib/data/shared/exercise-search";

// R3a จดการออกกำลังกาย (R3_LOGGING_CONTRACT.md เกณฑ์ 9–17 ส่วน e2e) — qa-test
// ชั้น IndexedDB จริง (src/lib/offline/idb-store.ts ไม่มี unit test) ถูกตรวจผ่านเทสต์ชุดนี้บน Chrome จริง
// ผู้ใช้สร้างใหม่ต่อเทสต์ · ชื่อสมมติ

test.use({ auth: "none" });
test.describe.configure({ mode: "parallel" });

type L = "th" | "en";
type Op = { entity: string; id: string; action: "upsert" | "delete"; data?: unknown; client_updated_at?: string };
type Result = { op_id: string | null; status: "applied" | "stale" | "rejected"; code?: string };

const BENCH_REF = "Barbell_Bench_Press_-_Medium_Grip";

async function push(u: TestUser, ops: Op[]): Promise<Result[]> {
  const body = { v: 1, ops: ops.map((o) => ({ ...o, op_id: randomUUID(), client_updated_at: o.client_updated_at ?? new Date().toISOString() })) };
  const res = await u.api.post("/api/sync/push", { data: body });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}

async function catalogId(sourceRef: string): Promise<string> {
  const rows = await sql<{ id: string }>("select id from exercise where source_ref = $1 and owner_user_id is null", [sourceRef]);
  expect(rows.length, `catalog ${sourceRef}`).toBe(1);
  return rows[0].id;
}

async function catalogByTrack(track: string, n: number): Promise<{ id: string; name: string }[]> {
  return sql<{ id: string; name: string }>(
    "select id, name from exercise where owner_user_id is null and archived_at is null and track_type = $1 and load_mode = 'external' order by name limit $2",
    [track, n],
  );
}

async function counts(userId: string) {
  const [r] = await sql<{ s: number; e: number; t: number; open: number }>(
    `select (select count(*)::int from workout_session where user_id=$1 and deleted_at is null) as s,
            (select count(*)::int from session_exercise where user_id=$1 and deleted_at is null) as e,
            (select count(*)::int from set_record where user_id=$1 and deleted_at is null) as t,
            (select count(*)::int from workout_session where user_id=$1 and deleted_at is null and ended_at is null) as open`,
    [userId],
  );
  return r;
}

async function asUser(page: Page, baseURL: string, l: L = "th", theme: "light" | "dark" = "light") {
  const u = await signUp(baseURL, { locale: l });
  await setLocale(page.context(), baseURL, l);
  await presetTheme(page, theme);
  await applySession(page.context(), u);
  const id = (await userIdOf(u.email))!;
  return { u, id };
}

/** มีสถานที่ให้เริ่ม (ผู้ใช้ใหม่อาจยังไม่มี) */
async function ensurePlace(u: TestUser, name = "QA Gym"): Promise<string> {
  const boot = (await (await u.api.get("/api/bootstrap")).json()) as { places: { id: string; archived_at: string | null }[] };
  const p = boot.places.find((x) => !x.archived_at);
  if (p) return p.id;
  const id = randomUUID();
  expect((await push(u, [{ entity: "place", id, action: "upsert", data: { name } }]))[0].status).toBe("applied");
  return id;
}

/** อ่าน store ในฐาน IndexedDB ของผู้ใช้ */
async function idbRead(page: Page, userId: string, store: string): Promise<unknown> {
  return page.evaluate(
    async ([name, st]) => {
      // เปิดฐานที่ยังไม่มี = สร้างฐานเปล่ารุ่น 1 ขวางแอป → ดูก่อนว่ามีไหม
      if (!(await indexedDB.databases()).some((d) => d.name === name)) return null;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      try {
        if (!db.objectStoreNames.contains(st)) return null;
        const tx = db.transaction(st);
        const os = tx.objectStore(st);
        const out = await new Promise<unknown>((res, rej) => {
          const r = st === "outbox" || st === "rejected" || st === "sent" ? os.getAll() : os.get("current");
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        return out;
      } finally {
        db.close();
      }
    },
    [`fcf:v1:${userId}`, store] as const,
  );
}

async function dbNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ""));
}

/** รอจน snapshot + คลังท่าอยู่ในเครื่องแล้ว (ใช้ตอนออฟไลน์ได้) */
async function waitLocalReady(page: Page, userId: string) {
  await expect.poll(async () => {
    const s = (await idbRead(page, userId, "snapshot")) as { data?: unknown } | null;
    const c = (await idbRead(page, userId, "catalog")) as { data?: unknown } | null;
    return Boolean(s?.data) && Boolean(c?.data);
  }, { timeout: 20_000 }).toBe(true);
}

const outbox = async (page: Page, userId: string) => ((await idbRead(page, userId, "outbox")) as { entity: string; id: string; action: string }[] | null) ?? [];


const tick = (page: Page, l: L, n: string | number) => page.getByRole("button", { name: msg(l, "log.tick").replace("{n}", String(n)), exact: true });

/** แตะช่องค่าแล้วพิมพ์ */
async function enter(page: Page, l: L, field: string, value: string) {
  const head = msg(l, `log.field.${field}`);
  await page.getByRole("button", { name: new RegExp(`^${head.replace(/[+−]/g, "\\$&")} `) }).last().click();
  const input = page.getByRole("textbox", { name: new RegExp(`^${head.replace(/[+−]/g, "\\$&")}`) });
  await input.fill(value);
  await page.getByRole("button", { name: msg(l, "log.done"), exact: true }).click();
}

async function pickBySearch(page: Page, term: string, name: RegExp) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox").or(dialog.getByRole("textbox")).first().fill(term);
  await dialog.getByRole("button", { name }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** ติดตั้ง SW + เก็บหน้าครบก่อนตัดเน็ต */
async function installOffline(page: Page, userId: string) {
  await page.goto("/");
  await waitForAuthReady(page);
  await waitForServiceWorker(page);
  await waitForCachedPages(page, ["/", "/log", "/me/exercises", "/me/exercises/new", "/me/exercises/edit", "/me/places", "/me/credits"]);
  await waitLocalReady(page, userId);
}

/** op ที่ถึงเซิร์ฟเวอร์จริง (มีคำตอบ) · attempts = ครั้งที่เบราว์เซอร์พยายามส่ง (รวมตอนออฟไลน์ที่ล้มทันที) */
function countPushOps(page: Page): { ops: { entity: string; action: string; id: string }[]; attempts: number } {
  const box = { ops: [] as { entity: string; action: string; id: string }[], attempts: 0 };
  page.on("request", (r: PwRequest) => {
    if (r.url().endsWith("/api/sync/push") && r.method() === "POST") box.attempts += 1;
  });
  page.on("response", (res) => {
    const r = res.request();
    if (r.url().endsWith("/api/sync/push") && r.method() === "POST") {
      try {
        box.ops.push(...((r.postDataJSON() as { ops: { entity: string; action: string; id: string }[] }).ops ?? []));
      } catch {
        // ignore
      }
    }
  });
  return box;
}

// =====================================================================================================
test.describe("R3a เส้นทางหลัก + ออฟไลน์ (เกณฑ์ 10, 14 บางส่วน)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("ออฟไลน์ตั้งแต่ก่อนเริ่ม: 2 ท่า (สร้างใหม่ 1) · 5 เซ็ต · reload ร่างครบ · ออนไลน์ส่งครบ 1/2/5 · push ซ้ำไม่ซ้ำแถว", async ({ page, context, baseURL }) => {
    const l: L = "en";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    await installOffline(page, id);
    const sent = countPushOps(page);

    await context.setOffline(true);
    await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
    await expect(page).toHaveURL(/\/log$/);
    await pickBySearch(page, "bench press", /Barbell Bench Press - Medium Grip/);

    // ไม่เคยทำ = ช่องว่าง ✓ ปิด
    await expect(tick(page, l, 1)).toBeDisabled();
    await enter(page, l, "weight", "20");
    await enter(page, l, "reps", "10");
    await tick(page, l, 1).click();
    // เซ็ตถัดไปเติมค่าจากเซ็ตก่อน → ✓ ได้เลย
    await expect(tick(page, l, 2)).toBeEnabled();
    await tick(page, l, 2).click();
    await expect(tick(page, l, 3)).toBeEnabled();
    await tick(page, l, 3).click();
    await expect(page.getByRole("button", { name: msg(l, "log.tick").replace("{n}", "3"), pressed: true })).toBeVisible();

    // ท่าที่ 2: สร้างใหม่ตอนออฟไลน์จากจอเลือกท่า (ชนิดเวลา)
    await page.getByRole("button", { name: new RegExp(msg(l, "log.addExercise")) }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox").or(dialog.getByRole("textbox")).first().fill("QA water jug carry");
    await dialog.getByRole("link", { name: /QA water jug carry/ }).click();
    await expect(page).toHaveURL(/\/me\/exercises\/new/);
    await expect(page.getByRole("textbox", { name: msg(l, "exerciseForm.name") })).toHaveValue("QA water jug carry");
    await page.getByRole("radio", { name: msg(l, "exercise.track.duration") }).check().catch(async () => {
      await page.getByText(msg(l, "exercise.track.duration"), { exact: true }).click();
    });
    // หมวด (ถ้ายังไม่เลือก)
    const cat = page.getByRole("radio", { name: msg(l, "exercise.category.full_body") });
    if (await cat.count()) await cat.first().check().catch(() => {});
    await page.getByRole("button", { name: msg(l, "exerciseForm.saveAndAdd") }).click();
    await expect(page).toHaveURL(/\/log$/);
    await expect(page.getByText("QA water jug carry").first()).toBeVisible();
    await enter(page, l, "duration", "45");
    await tick(page, l, 1).click();
    await expect(tick(page, l, 2)).toBeEnabled();
    await tick(page, l, 2).click();
    // รอให้การเขียนลง IndexedDB เสร็จก่อน reload (กัน reload ตัดจังหวะ transaction บนเครื่อง CI ที่ช้า)
    await expect(page.getByRole("button", { name: msg(l, "log.tick").replace("{n}", "2"), pressed: true })).toBeVisible();
    await expect(page.getByText(msg(l, "sync.bar.offlinePending").replace("{count}", "9"))).toBeVisible();

    // ปิดแอปกลางคัน (โหลดทั้งหน้าตอนออฟไลน์) → ร่างอยู่ครบ
    await page.reload();
    await expect(page).toHaveURL(/\/log$/);
    await expect(page.getByText("QA water jug carry").first()).toBeVisible();
    await expect(page.getByRole("button", { name: msg(l, "log.tick").replace("{n}", "2"), pressed: true })).toHaveCount(1);
    await expect(page.getByText(msg(l, "sync.bar.offlinePending").replace("{count}", "9"))).toBeVisible(); // เซสชัน 1 + ท่าในเซสชัน 2 + เซ็ต 5 + ท่าของฉัน 1
    expect(sent.ops, "ไม่มีอะไรถึงเซิร์ฟเวอร์ตอนออฟไลน์").toEqual([]);
    console.log(`[qa] push attempts while offline: ${sent.attempts}`);

    // ตัดคำตอบของ push ทิ้ง 1 ครั้ง (เซิร์ฟเวอร์ทำแล้วแต่เครื่องไม่รู้) → ส่งซ้ำต้องไม่ซ้ำแถว
    let dropped = 0;
    await page.route("**/api/sync/push", async (route) => {
      if (dropped === 0) {
        dropped += 1;
        await route.fetch();
        await route.abort("connectionreset");
      } else await route.continue();
    });
    await context.setOffline(false);
    await expect(page.getByText(msg(l, "sync.bar.done"))).toBeVisible({ timeout: 30_000 });
    expect(dropped).toBe(1);
    expect(await counts(id)).toMatchObject({ s: 1, e: 2, t: 5, open: 1 });
    expect(await outbox(page, id)).toEqual([]);

    // จบ → สรุป
    await page.getByRole("button", { name: msg(l, "log.finish"), exact: true }).click();
    await expect(page.getByText(msg(l, "log.summary.title"))).toBeVisible();
    await expect.poll(async () => (await counts(id)).open, { timeout: 15_000 }).toBe(0);
    expect(await counts(id)).toMatchObject({ s: 1, e: 2, t: 5 });
    // ท่าที่สร้างตอนออฟไลน์ขึ้นเซิร์ฟเวอร์ 1 แถว
    expect((await sql<{ n: number }>("select count(*)::int n from exercise where owner_user_id=$1 and name='QA water jug carry'", [id]))[0].n).toBe(1);
  });

  test("สร้างแล้วลบก่อนส่ง → ไม่มีอะไรถูกส่ง (สถานที่ · เซ็ต · เซสชันทิ้ง)", async ({ page, context, baseURL }) => {
    const l: L = "th";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    await installOffline(page, id);
    const sent = countPushOps(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
    await pickBySearch(page, "bench press", /Bench Press - Medium Grip|เบนช์เพรส กริปกลาง/);
    await enter(page, l, "weight", "20");
    await enter(page, l, "reps", "5");
    await tick(page, l, 1).click();
    expect((await outbox(page, id)).length).toBe(3);
    // เอาติ๊กออก → เซ็ตออกจากคิว (ท่า/เซสชันยังรอ)
    await tick(page, l, 1).click();
    await expect.poll(async () => (await outbox(page, id)).map((o) => o.entity).sort()).toEqual(["session_exercise", "workout_session"]);
    // ทิ้งเซสชัน → คิวว่าง
    await page.getByRole("button", { name: msg(l, "log.sessionMenu") }).click();
    await page.getByRole("button", { name: msg(l, "log.discard") }).click();
    await page.getByRole("button", { name: msg(l, "log.discardConfirm") }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => outbox(page, id)).toEqual([]);
    await context.setOffline(false);
    await page.waitForTimeout(3000);
    expect(sent.ops.filter((o) => o.entity !== "place" && o.entity !== "exercise")).toEqual([]);
    expect(await counts(id)).toMatchObject({ s: 0, e: 0, t: 0 });
  });
});

// ---------------- นาฬิกาจำลอง ----------------

const H = 3600_000;
const MIN = 60_000;

/** เวลา hh:mm ของ "เมื่อวาน" ตามเวลาไทย (UTC+7) เป็น epoch ms — อยู่ในอดีตเสมอ (เซิร์ฟเวอร์ไม่ตอบ bad_clock) */
function bangkokYesterday(hh: number, mm: number, daysBack = 1): { ms: number; date: string } {
  const nowBkk = new Date(Date.now() + 7 * H);
  const y = nowBkk.getUTCFullYear();
  const m = nowBkk.getUTCMonth();
  const d = nowBkk.getUTCDate() - daysBack;
  const ms = Date.UTC(y, m, d, hh, mm) - 7 * H;
  const date = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  return { ms, date };
}

const restClock = (page: Page, l: L) => page.locator("p", { has: page.getByText(msg(l, "log.rest.label"), { exact: true }) }).locator(".num");

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}


test.describe("R3a ข้ามเที่ยงคืน (เกณฑ์ 9)", () => {
  test.use({ timezoneId: "Asia/Bangkok" });
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("เริ่ม 23:50 · ✓ 00:20 · จบ 00:40 → local_date = วันที่เริ่ม · วันเดียวมี 2 เซสชันได้", async ({ page, baseURL }) => {
    const l: L = "th";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    const first = bangkokYesterday(21, 0);
    const late = bangkokYesterday(23, 50);
    await page.clock.install({ time: first.ms });
    await page.goto("/");
    await waitForAuthReady(page);
    await waitLocalReady(page, id);

    async function session(startMs: number, tickMs: number, endMs: number) {
      await page.clock.setSystemTime(startMs);
      await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
      await expect(page).toHaveURL(/\/log$/);
      await pickBySearch(page, "bench press", /Bench Press - Medium Grip|เบนช์เพรส กริปกลาง/);
      await enter(page, l, "weight", "40");
      await enter(page, l, "reps", "8");
      await page.clock.setSystemTime(tickMs);
      await tick(page, l, 1).click();
      await page.clock.setSystemTime(endMs);
      await page.getByRole("button", { name: msg(l, "log.finish"), exact: true }).click();
      await page.getByRole("button", { name: msg(l, "log.summary.done") }).click();
      await expect(page).toHaveURL(/\/$/);
    }
    await session(first.ms, first.ms + 10 * MIN, first.ms + 20 * MIN);
    await session(late.ms, late.ms + 30 * MIN, late.ms + 50 * MIN);

    await expect.poll(async () => (await counts(id)).s, { timeout: 30_000 }).toBe(2);
    await expect.poll(async () => (await counts(id)).open, { timeout: 30_000 }).toBe(0);
    const rows = await sql<{ local_date: string; time_zone: string; started_at: Date; ended_at: Date }>(
      "select to_char(local_date,'YYYY-MM-DD') local_date, time_zone, started_at, ended_at from workout_session where user_id=$1 order by started_at",
      [id],
    );
    expect(rows.map((r) => r.local_date)).toEqual([first.date, first.date]);
    expect(rows.every((r) => r.time_zone === "Asia/Bangkok")).toBe(true);
    // ✓ หลังเที่ยงคืนตกวันถัดไปตามเวลาไทย แต่เซสชันยังเป็นวันที่เริ่ม
    const set = await sql<{ completed_at: Date }>("select s.completed_at from set_record s join session_exercise e on e.id=s.session_exercise_id where e.session_id=(select id from workout_session where user_id=$1 order by started_at desc limit 1)", [id]);
    expect(Math.abs(new Date(set[0].completed_at).getTime() - (late.ms + 30 * MIN))).toBeLessThan(5000); // นาฬิกาจำลองเดินต่อหลังตั้งเวลา
    expect(Math.abs(new Date(rows[1].ended_at).getTime() - (late.ms + 50 * MIN))).toBeLessThan(5000);
  });
});

test.describe("R3a ตัวจับเวลาพักจอดับ (เกณฑ์ 12)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("✓ → 1:30 · ซ่อนหน้า 60 วิ → 0:30 · reload ยังถูก · เกิน → ไปต่อ · คาร์ดิโอไม่เริ่ม · ▶ ท่าเวลา", async ({ page, baseURL }) => {
    const l: L = "en";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    const t0 = Date.now() - 2 * H;
    await page.clock.install({ time: t0 });
    await page.goto("/");
    await waitForAuthReady(page);
    await waitLocalReady(page, id);
    await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
    await pickBySearch(page, "bench press", /Barbell Bench Press - Medium Grip/);
    await enter(page, l, "weight", "20");
    await enter(page, l, "reps", "10");
    await page.clock.pauseAt(t0 + 1 * MIN);
    await tick(page, l, 1).click();
    await page.clock.runFor(500);
    await expect(restClock(page, l)).toHaveText(/^1:(30|29)$/);

    // จอดับ: ไม่มี timer ทำงาน 60 วิ (setSystemTime ไม่ยิง timer) แล้วกลับมา
    await setHidden(page, true);
    await page.clock.setSystemTime(t0 + 2 * MIN);
    await setHidden(page, false);
    await page.clock.runFor(500);
    await expect(restClock(page, l)).toHaveText(/^0:(30|29)$/);

    // ปิดแล้วเปิดหน้าใหม่ → ยังถูก
    await page.reload();
    await page.clock.runFor(500);
    await expect(restClock(page, l)).toHaveText(/^0:(30|29)$/);

    // เกินเวลา → "ไปต่อ"
    await page.clock.runFor(31_000);
    await expect(restClock(page, l)).toHaveText(msg(l, "log.rest.go"));
    await page.getByRole("button", { name: msg(l, "log.rest.dismiss") }).click();
    await expect(restClock(page, l)).toHaveCount(0);

    // คาร์ดิโอ (ระยะ+เวลา) ✓ แล้วไม่เริ่มพัก
    const [run] = await catalogByTrack("distance_duration", 1);
    await page.getByRole("button", { name: new RegExp(msg(l, "log.addExercise")) }).click();
    await pickBySearch(page, run.name, new RegExp(run.name.replace(/[()]/g, ".")));
    await enter(page, l, "distance", "2");
    await enter(page, l, "duration", "1200");
    await tick(page, l, 1).click();
    await page.clock.runFor(1000);
    await expect(restClock(page, l)).toHaveCount(0);

    // ▶ ท่าเวลา: นับจากเวลาจริง แม้ timer ไม่เดิน
    const [hold] = await sql<{ name: string }>("select name from exercise where owner_user_id is null and archived_at is null and track_type='duration' order by name limit 1");
    await page.getByRole("button", { name: new RegExp(msg(l, "log.addExercise")) }).click();
    await pickBySearch(page, hold.name, new RegExp(hold.name.replace(/[()]/g, ".")));
    await page.getByRole("button", { name: msg(l, "log.stopwatchStart") }).click();
    await setHidden(page, true);
    await page.clock.setSystemTime(t0 + 10 * MIN + 45_000);
    await setHidden(page, false);
    await page.clock.runFor(300);
    await page.getByRole("button", { name: msg(l, "log.stopwatchStop") }).click();
    await page.clock.runFor(300);
    // ■ = ใส่เวลา + ติ๊กให้
    const draft = (await idbRead(page, id, "active_session")) as { exercises: { sets: { duration_s: number | null; completed_at: string | null }[] }[] };
    const last = draft.exercises.at(-1)!.sets.find((s) => s.completed_at !== null)!;
    // กด ▶ ราว t0+2:33 (นาฬิกาหยุดไว้ + runFor) · ■ ที่ t0+10:45 → ~8 นาที
    expect(last.duration_s).toBeGreaterThanOrEqual(7 * 60);
    expect(last.duration_s).toBeLessThanOrEqual(9 * 60);
  });
});

test.describe("R3a กลับมาทำต่อ D5 (เกณฑ์ 13)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("≤ 3 ชม. เปิดแอปเข้าหน้าจด · > 3 ชม. ถาม → จบที่เซ็ตสุดท้าย · > 24 ชม. จบเอง + toast", async ({ page, context, baseURL }) => {
    const l: L = "en";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    const t0 = Date.now() - 40 * H;
    await page.clock.install({ time: t0 });
    await page.goto("/");
    await waitForAuthReady(page);
    await waitLocalReady(page, id);
    let p = page;

    async function startAndTick(at: number) {
      await p.clock.setSystemTime(at);
      await p.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
      await pickBySearch(p, "bench press", /Barbell Bench Press - Medium Grip/);
      await enter(p, l, "weight", "20");
      await enter(p, l, "reps", "10");
      await p.clock.setSystemTime(at + MIN);
      await tick(p, l, 1).click();
      await expect.poll(async () => (await counts(id)).open, { timeout: 20_000 }).toBe(1);
    }
    /** "ปิดแอปแล้วเปิดใหม่" = แท็บใหม่ (sessionStorage ใหม่) */
    async function reopen(at: number): Promise<Page> {
      await p.close().catch(() => {});
      await context.clock.setSystemTime(at);
      const np = await context.newPage();
      await np.goto("/");
      return np;
    }

    await startAndTick(t0);
    // ≤ 3 ชม.
    p = await reopen(t0 + 2 * H);
    await expect(p).toHaveURL(/\/log$/, { timeout: 15_000 });
    // > 3 ชม. → ถาม
    p = await reopen(t0 + 4 * H);
    await expect(p.getByRole("heading", { name: msg(l, "log.resume.title") })).toBeVisible({ timeout: 15_000 });
    await p.getByRole("button", { name: msg(l, "log.resume.finish") }).click();
    await expect.poll(async () => (await counts(id)).open, { timeout: 20_000 }).toBe(0);
    const [s1] = await sql<{ ended_at: Date }>("select ended_at from workout_session where user_id=$1", [id]);
    expect(Math.abs(new Date(s1.ended_at).getTime() - (t0 + MIN))).toBeLessThan(5000);

    // > 24 ชม. → จบเองที่เซ็ตสุดท้าย + toast
    const t1 = t0 + 5 * H;
    await startAndTick(t1);
    p = await reopen(t1 + 26 * H);
    await expect(p.getByText(msg(l, "log.autoEnded.one"))).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await counts(id)).open, { timeout: 20_000 }).toBe(0);
    const ends = await sql<{ ended_at: Date }>("select ended_at from workout_session where user_id=$1 order by started_at", [id]);
    expect(Math.abs(new Date(ends[1].ended_at).getTime() - (t1 + MIN))).toBeLessThan(5000);
    await expect(p).toHaveURL(/\/$/);
  });

  test("เซสชันค้างจากอีกเครื่อง → ถาม · เล่นต่อได้ (เซ็ตเดิมอยู่ · ✓ ต่อได้)", async ({ page, baseURL }) => {
    const l: L = "th";
    const { u, id } = await asUser(page, baseURL!, l);
    const placeId = await ensurePlace(u);
    const bench = await catalogId(BENCH_REF);
    const sid = randomUUID();
    const eid = randomUUID();
    const start = new Date(Date.now() - 30 * MIN);
    const bkk = new Date(start.getTime() + 7 * H).toISOString().slice(0, 10);
    const r = await push(u, [
      { entity: "workout_session", id: sid, action: "upsert", data: { place_id: placeId, started_at: start.toISOString(), ended_at: null, local_date: bkk, time_zone: "Asia/Bangkok" } },
      { entity: "session_exercise", id: eid, action: "upsert", data: { session_id: sid, exercise_id: bench, position: 0 } },
      { entity: "set_record", id: randomUUID(), action: "upsert", data: { session_exercise_id: eid, position: 0, set_kind: "normal", completed_at: new Date(start.getTime() + 5 * MIN).toISOString(), weight_input: 30, weight_unit: "kg", reps: 8, duration_s: null, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null } },
    ]);
    expect(r.map((x) => x.status)).toEqual(["applied", "applied", "applied"]);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: msg(l, "log.resume.title") })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: msg(l, "log.resume.continue") }).click();
    await expect(page).toHaveURL(/\/log$/);
    await expect(page.getByRole("button", { name: msg(l, "log.tick").replace("{n}", "1"), pressed: true })).toBeVisible();
    // ✓ เซ็ตถัดไป (ค่าเติมจากเซ็ตก่อน) → ขึ้นเซสชันเดิม
    await tick(page, l, 2).click();
    await expect.poll(async () => (await counts(id)).t, { timeout: 20_000 }).toBe(2);
    expect((await counts(id)).s).toBe(1);
  });
});

test.describe("R3a ส่งไม่ผ่าน / 401 / ออกจากระบบ (เกณฑ์ 11)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("401 → คิวอยู่ครบ · ปฏิเสธ 1 รายการ → ดู/คัดลอก/ทิ้ง · ออกจากระบบขณะมีคิว → ถาม · ฐานถูกลบ", async ({ page, context, baseURL }) => {
    const l: L = "en";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await installOffline(page, id);
    await context.setOffline(true);
    await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
    await pickBySearch(page, "bench press", /Barbell Bench Press - Medium Grip/);
    await enter(page, l, "weight", "20");
    await enter(page, l, "reps", "10");
    await tick(page, l, 1).click();
    await expect(page.getByRole("button", { name: msg(l, "log.tick").replace("{n}", "1"), pressed: true })).toBeVisible();
    await expect.poll(async () => (await outbox(page, id)).length).toBe(3);

    // 401
    await page.route("**/api/sync/push", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: "unauthorized" }) }));
    await context.setOffline(false);
    await expect(page.getByText(/Sign in again to sync 3 items/)).toBeVisible({ timeout: 15_000 });
    expect((await outbox(page, id)).length).toBe(3);
    expect((await counts(id)).t).toBe(0);

    // ปฏิเสธ set_record 1 รายการ (ส่วนที่เหลือ applied จริง)
    await page.unroute("**/api/sync/push");
    await page.route("**/api/sync/push", async (route) => {
      const req = route.request().postDataJSON() as { ops: { op_id: string; entity: string }[] };
      const setOp = req.ops.find((o) => o.entity === "set_record");
      const res = await route.fetch({ postData: JSON.stringify({ ...req, ops: req.ops.filter((o) => o !== setOp) }) });
      const body = (await res.json()) as { results: Result[] };
      if (setOp) body.results.push({ op_id: setOp.op_id, status: "rejected", code: "invalid" });
      await route.fulfill({ response: res, json: body });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText("1 couldn't sync")).toBeVisible({ timeout: 15_000 });
    expect((await counts(id)).t).toBe(0);
    await page.getByRole("button", { name: msg(l, "sync.bar.view") }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(msg(l, "sync.reason.invalid"))).toBeVisible();
    await sheet.getByRole("button", { name: msg(l, "sync.rejected.copy") }).first().click();
    await expect(page.getByText(msg(l, "sync.rejected.copied"))).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("Barbell Bench Press");
    expect(clip).not.toContain(u.email);
    await sheet.getByRole("button", { name: msg(l, "sync.rejected.discard") }).first().click();
    await expect.poll(async () => ((await idbRead(page, id, "rejected")) as unknown[]).length, { timeout: 15_000 }).toBe(0);
    await page.unroute("**/api/sync/push");

    // ออกจากระบบขณะมีคิว: ส่งไม่ได้ (push ล้ม) → ถาม → ทิ้งแล้วออก
    await page.goto("/log");
    await context.setOffline(true);
    await page.getByRole("button", { name: /^Complete set \d+$/, pressed: false }).last().click();
    await expect.poll(async () => (await outbox(page, id)).length).toBeGreaterThan(0);
    await page.route("**/api/sync/push", (route) => route.abort("connectionreset"));
    await context.setOffline(false);
    await page.goto("/me");
    await page.getByRole("button", { name: msg(l, "account.signOut"), exact: true }).click();
    await expect(page.getByRole("button", { name: msg(l, "account.signOutQueue.syncFirst") })).toBeVisible({ timeout: 15_000 });
    expect(await dbNames(page)).toContain(`fcf:v1:${id}`);
    await page.getByRole("button", { name: msg(l, "account.signOutQueue.discard") }).click();
    await expect(page).toHaveURL(/\/welcome/, { timeout: 15_000 });
    expect(await dbNames(page)).not.toContain(`fcf:v1:${id}`);
  });
});

// ---------------- ข้อมูลประวัติผ่าน API ----------------

type SetIn = { kind?: "normal" | "warmup"; w: number; r: number };
const DAY = 24 * H;

async function pushSession(u: TestUser, placeId: string, exerciseId: string, startMs: number, sets: SetIn[]) {
  const sid = randomUUID();
  const eid = randomUUID();
  const bkk = new Date(startMs + 7 * H).toISOString().slice(0, 10);
  const r = await push(u, [
    { entity: "workout_session", id: sid, action: "upsert", data: { place_id: placeId, started_at: new Date(startMs).toISOString(), ended_at: new Date(startMs + 30 * MIN).toISOString(), local_date: bkk, time_zone: "Asia/Bangkok" } },
    { entity: "session_exercise", id: eid, action: "upsert", data: { session_id: sid, exercise_id: exerciseId, position: 0 } },
    ...sets.map((s, i) => ({
      entity: "set_record",
      id: randomUUID(),
      action: "upsert" as const,
      data: { session_exercise_id: eid, position: i, set_kind: s.kind ?? "normal", completed_at: new Date(startMs + (i + 1) * MIN).toISOString(), weight_input: s.w, weight_unit: "kg", reps: s.r, duration_s: null, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null },
    })),
  ]);
  expect(r.map((x) => x.status).every((x) => x === "applied"), JSON.stringify(r)).toBe(true);
}

test.describe("R3a เลือกท่า D7 + เติมค่า (เกณฑ์ 14)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("ล่าสุด 5 ท่าเรียงตามเวลา (รวมที่ค้างส่ง) · ค้นคำเดียวกัน ท่าใช้บ่อยขึ้นก่อน · เติมจากเซ็ตปกติแรกของครั้งก่อน · เริ่ม→ล่าสุด→✓ = 3 แตะ", async ({ page, context, baseURL }) => {
    const l: L = "en";
    const { u, id } = await asUser(page, baseURL!, l);
    const placeId = await ensurePlace(u);
    const ex = await sql<{ id: string; name: string }>(
      "select id, name from exercise where owner_user_id is null and archived_at is null and track_type='weight_reps' and load_mode='external' and name like 'Dumbbell %' and name not like '%(%' order by name limit 8",
    );
    expect(ex.length).toBe(8);
    const now = Date.now();
    // ท่าใช้บ่อย: ท่าที่ตรงคำค้น "curl" ระดับเดียวกับอันดับ 1 แต่ปกติอยู่ท้ายสุดของระดับนั้น · 3 เซสชัน เมื่อนานแล้ว
    type CatEx = Parameters<typeof searchExercises>[0][number] & { id: string; track_type: string };
    const cat = (await (await u.api.get("/api/catalog")).json()) as { exercises: CatEx[] };
    let Q = "";
    let peers: CatEx[] = [];
    for (const q of ["row", "press", "raise", "squat", "curl", "fly"]) {
      const found = searchExercises(cat.exercises, q) as CatEx[];
      const tier0 = rankExercise(found[0], normalizeQuery(q));
      peers = found.filter((e) => rankExercise(e, normalizeQuery(q)) === tier0);
      Q = q;
      if (peers.length > 2 && peers.at(-1)!.track_type === "weight_reps") break;
    }
    expect(peers.length, "ต้องมีหลายท่าที่ตรงเท่ากัน").toBeGreaterThan(2);
    const frequent = peers.at(-1)!;
    ex[7] = { id: frequent.id, name: frequent.name };
    for (let i = 0; i < 3; i++) await pushSession(u, placeId, ex[7].id, now - (40 - i) * DAY, [{ w: 8, r: 10 }]);
    // ex[0..5] คนละวัน · ex[5] ล่าสุด มีวอร์มอัพก่อน
    for (let k = 0; k < 6; k++) {
      const sets: SetIn[] = k === 5 ? [{ kind: "warmup", w: 4, r: 15 }, { w: 12.5, r: 8 }, { w: 15, r: 6 }] : [{ w: 10 + k, r: 5 }];
      await pushSession(u, placeId, ex[k].id, now - (10 - k) * DAY, sets);
    }

    await page.goto("/");
    await waitForAuthReady(page);
    await waitLocalReady(page, id);
    // แตะ 1: เริ่ม → จอเลือกท่าเปิดเอง
    await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
    const recent = page.getByRole("region", { name: msg(l, "log.picker.recent") }).or(page.locator("section[aria-labelledby=recent-heading]"));
    await expect(recent.getByRole("button")).toHaveCount(5);
    const names = await recent.getByRole("button").allTextContents();
    for (const [i, k] of [5, 4, 3, 2, 1].entries()) expect(names[i], `recent #${i}`).toContain(ex[k].name);
    expect(names.join("|")).not.toContain(ex[0].name);
    // แตะ 2: ท่าล่าสุด → แถวแรกเติมจากเซ็ตปกติแรกของครั้งก่อน (ข้ามวอร์มอัพ)
    await recent.getByRole("button").first().click();
    await expect(page.getByRole("button", { name: /^Weight 12\.5 kg$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Reps 8$/ })).toBeVisible();
    // แตะ 3: ✓
    await tick(page, l, 1).click();
    await expect(page.getByRole("button", { name: msg(l, "log.tick").replace("{n}", "1"), pressed: true })).toBeVisible();
    // เซ็ตถัดไปเติมจากเซ็ตก่อน
    await expect(page.getByRole("button", { name: /^Weight 12\.5 kg$/ })).toHaveCount(2);

    // ค้างส่ง (ออฟไลน์) ก็นับเป็นล่าสุด: ex[0] ขึ้นบนสุด
    await context.setOffline(true);
    await page.getByRole("button", { name: new RegExp(msg(l, "log.addExercise")) }).click();
    await pickBySearch(page, ex[0].name, new RegExp(`^${ex[0].name}`));
    await tick(page, l, 1).click(); // ex[0] เคยทำ → เติม 10 × 5
    await page.getByRole("button", { name: new RegExp(msg(l, "log.addExercise")) }).click();
    await expect(recent.getByRole("button").first()).toContainText(ex[0].name);
    await expect(recent.getByRole("button").nth(1)).toContainText(ex[5].name);

    // ค้นคำเดียวกัน: ท่าที่ใช้บ่อยสุด (3 เซสชันใน 90 วัน) ขึ้นก่อนท่าอื่นที่ตรงเท่ากัน
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox").or(dialog.getByRole("textbox")).first().fill(Q);
    await expect(dialog.getByRole("listitem").first()).toContainText(ex[7].name);
    await context.setOffline(false);
  });

  test("ไม่เคยทำ = ช่องว่าง ✓ ปิด · ค่านอกช่วง D4 = ข้อความใต้ช่อง ✓ ปิด", async ({ page, baseURL }) => {
    const l: L = "th";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    await page.goto("/");
    await waitLocalReady(page, id);
    await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
    await pickBySearch(page, "bench press", /Bench Press - Medium Grip|เบนช์เพรส กริปกลาง/);
    await expect(tick(page, l, 1)).toBeDisabled();
    await enter(page, l, "weight", "1000.01");
    await enter(page, l, "reps", "10");
    await expect(page.getByRole("alert").filter({ hasText: msg(l, "log.range.weightMax").replace("{max}", "1,000").replace("{unit}", "kg").slice(0, 8) })).toBeVisible();
    await expect(tick(page, l, 1)).toBeDisabled();
    await enter(page, l, "weight", "-5");
    await expect(tick(page, l, 1)).toBeDisabled();
    await enter(page, l, "weight", "0");
    await enter(page, l, "reps", "1.5");
    await expect(tick(page, l, 1)).toBeDisabled();
    await enter(page, l, "reps", "1");
    await expect(tick(page, l, 1)).toBeEnabled();
    // แตะ ✓ รัวๆ = เซ็ตเดียว
    await tick(page, l, 1).dblclick();
    await expect.poll(async () => (await counts(id)).t, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(2500);
    expect((await counts(id)).t).toBe(1);
  });
});

test.describe("R3a ออฟไลน์เปิดหน้าที่ไม่เคยเปิด (เกณฑ์ 15)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("หลังติดตั้ง SW → ออฟไลน์ → เปิด 6 หน้าได้ · สร้าง/แก้ท่าและสถานที่ได้ เข้าคิว · ออนไลน์ขึ้นเซิร์ฟเวอร์", async ({ page, context, baseURL }) => {
    const l: L = "th";
    const { u, id } = await asUser(page, baseURL!, l);
    await ensurePlace(u);
    const myEx = randomUUID();
    expect((await push(u, [{ entity: "exercise", id: myEx, action: "upsert", data: { name: "QA ท่าแก้ออฟไลน์", track_type: "weight_reps", load_mode: "external", is_unilateral: false, category: "core", equipment: null } }]))[0]).toMatchObject({ status: "applied" });
    await installOffline(page, id);
    await context.setOffline(true);
    for (const p of ["/log", "/me/exercises", "/me/exercises/new", "/me/exercises/edit", "/me/places", "/me/credits"]) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(200);
      // หน้าจดที่ยังไม่มีเซสชันไม่มี h1 — ดูข้อความ "ไม่มีเซสชัน" แทน
      if (p === "/log") await expect(page.getByText(msg(l, "log.noSession")), p).toBeVisible();
      // หน้าแก้ที่ยังไม่ได้เลือกท่า = จอ "ไม่เจอท่านี้" พร้อมทางกลับ (ไม่ใช่จอว่าง)
      else if (p === "/me/exercises/edit") await expect(page.getByText(msg(l, "exerciseForm.notFound")), p).toBeVisible();
      else await expect(page.getByRole("heading", { level: 1 }).first(), p).toBeVisible();
    }
    // แก้ท่าของฉันตอนออฟไลน์ (แตะแถว → หน้าแก้ path คงที่)
    await page.goto("/me/exercises");
    await page.getByRole("link", { name: /QA ท่าแก้ออฟไลน์/ }).click();
    await expect(page).toHaveURL(/\/me\/exercises\/edit$/);
    await page.getByLabel(msg(l, "exerciseForm.name")).fill("QA ท่าแก้ออฟไลน์ 2");
    await page.getByRole("button", { name: msg(l, "exerciseForm.save") }).click();
    await expect(page.getByRole("status").filter({ hasText: msg(l, "toast.saved") })).toBeVisible();
    // เพิ่มสถานที่ตอนออฟไลน์
    await page.goto("/me/places");
    await page.getByRole("button", { name: `+ ${msg(l, "places.add")}` }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel(msg(l, "places.name")).fill("QA ที่ใหม่ออฟไลน์");
    await sheet.getByRole("button", { name: msg(l, "places.addButton"), exact: true }).click();
    await expect(sheet).toBeHidden();
    // โหลดใหม่ทั้งหน้า (ออฟไลน์) → ยังเห็น (snapshot ทับด้วยคิว)
    await page.reload();
    await expect(page.getByRole("button", { name: /^QA ที่ใหม่ออฟไลน์/ })).toBeVisible();
    expect((await outbox(page, id)).map((o) => o.entity).sort()).toEqual(["exercise", "place"]);
    await context.setOffline(false);
    await expect.poll(() => sql("select name from exercise where id=$1", [myEx]), { timeout: 20_000 }).toEqual([{ name: "QA ท่าแก้ออฟไลน์ 2" }]);
    expect(await sql("select count(*)::int n from place where user_id=$1 and name='QA ที่ใหม่ออฟไลน์'", [id])).toEqual([{ n: 1 }]);
  });
});

test.describe("R3a หน้าตา 360 px TH/EN สว่าง/มืด (เกณฑ์ 16)", () => {
  test.use({ viewport: { width: 360, height: 760 } });
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  for (const theme of ["light", "dark"] as const) {
    for (const l of ["th", "en"] as const) {
      test(`${l} · ${theme}: หน้าจด · เลือกท่า · พัก · แถบสถานะ · สรุป — คอนทราสต์ · ฟอนต์ · ปุ่ม ≥ 44 · ✓ 56 · ไม่ล้นจอ · ส้มเฉพาะ ✓`, async ({ page, context, baseURL }) => {
        const { u, id } = await asUser(page, baseURL!, l, theme);
        await ensurePlace(u, l === "th" ? "ยิมหน้าปากซอยชื่อยาวมากๆๆๆๆๆๆๆๆๆๆๆๆ" : "A very long gym name near the office building");
        await page.goto("/");
        await waitLocalReady(page, id);

        async function check(where: string) {
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
          expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), where).toBe(TOKENS[theme].paper);
          await expectNoHorizontalOverflow(page);
          const a = await audit(page);
          const problems: string[] = [];
          for (const t of a.texts) {
            if (t.size < 14) problems.push(`font < 14px: "${t.text}" ${t.size}px`);
            if (!t.disabled && contrast(t.color, t.bg) < 4.5) problems.push(`contrast ${contrast(t.color, t.bg).toFixed(2)}: "${t.text}" (${t.cls})`);
          }
          expect(problems, `${where}: text`).toEqual([]);
          expect(a.small, `${where}: touch targets < 44px`).toEqual([]);
          if (l === "en") expect(a.visibleText.match(/[฀-๿][^\n]{0,30}/g) ?? [], `${where}: Thai text on an English screen`).toEqual([]);
          expect(a.visibleText, `${where}: raw i18n key`).not.toMatch(/\b(log|sync|account)\.[a-z]+\.[a-zA-Z]+/);
          // ส้มเฉพาะ ✓ ที่ติ๊กแล้ว (UX 6) + แมว
          const stray = await page.evaluate((accent) => {
            const out: string[] = [];
            for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
              if (el.closest("[aria-pressed=true]") || el.closest("svg")) continue;
              const cs = getComputedStyle(el);
              if (cs.display === "none" || cs.visibility === "hidden") continue;
              for (const p of ["backgroundColor", "color", "borderTopColor"] as const) if (cs[p] === accent && el.getBoundingClientRect().width > 0) out.push(`${el.tagName}.${String(el.className).slice(0, 40)} ${p}`);
            }
            return out;
          }, TOKENS.accent);
          expect(stray, `${where}: orange outside ticked ✓`).toEqual([]);
        }

        await page.getByRole("button", { name: msg(l, "log.start"), exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await check("picker");
        await pickBySearch(page, "bench press", /Bench Press - Medium Grip|เบนช์เพรส กริปกลาง/);
        await enter(page, l, "weight", "1000.5");
        await check("range-error");
        await enter(page, l, "weight", "22.5");
        await enter(page, l, "reps", "10");
        const box = (await tick(page, l, 1).boundingBox())!;
        expect(box.width, "✓ 56px").toBeGreaterThanOrEqual(56);
        expect(box.height, "✓ 56px").toBeGreaterThanOrEqual(56);
        await context.setOffline(true);
        await tick(page, l, 1).click();
        await expect(restClock(page, l)).toBeVisible();
        await check("log+rest+offline-bar");
        // ใช้มือเดียว: ปุ่มหลัก (✓ ถัดไป · เพิ่มท่า · จบ) อยู่ครึ่งล่างของจอ
        const vh = page.viewportSize()!.height;
        for (const b of [tick(page, l, 2), page.getByRole("button", { name: msg(l, "log.finish"), exact: true })]) {
          const bb = (await b.boundingBox())!;
          expect(bb.y + bb.height / 2, "อยู่ในระยะนิ้วโป้ง (ต่ำกว่า 1/4 บนของจอ)").toBeGreaterThan(vh * 0.25);
        }
        await context.setOffline(false);
        await expect(page.getByText(msg(l, "sync.bar.done"))).toBeVisible({ timeout: 20_000 });
        await page.getByRole("button", { name: msg(l, "log.finish"), exact: true }).click();
        await expect(page.getByText(msg(l, "log.summary.title"))).toBeVisible();
        await check("summary");
      });
    }
  }
});

test.describe("R3a สิทธิ์ข้อมูล + ลบบัญชี (เกณฑ์ 17 ส่วน e2e)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "จอมือถือ"));

  test("B เขียน/อ่านเซสชันของ A ไม่ได้ · ลบบัญชีแล้ว 0 แถวในตารางใหม่ + ฐานในเครื่องถูกลบ", async ({ page, baseURL }) => {
    const l: L = "en";
    const { u: a, id: aId } = await asUser(page, baseURL!, l);
    const b = await signUp(baseURL!);
    const placeA = await ensurePlace(a);
    const placeB = await ensurePlace(b);
    const bench = await catalogId(BENCH_REF);
    await pushSession(a, placeA, bench, Date.now() - DAY, [{ w: 50, r: 5 }]);
    const [sa] = await sql<{ id: string }>("select id from workout_session where user_id=$1", [aId]);
    const [ea] = await sql<{ id: string }>("select id from session_exercise where user_id=$1", [aId]);
    const [ta] = await sql<{ id: string }>("select id from set_record where user_id=$1", [aId]);
    const bkk = new Date(Date.now() + 7 * H).toISOString().slice(0, 10);
    const res = await push(b, [
      { entity: "workout_session", id: sa.id, action: "upsert", data: { place_id: placeB, started_at: new Date(Date.now() - H).toISOString(), ended_at: null, local_date: bkk, time_zone: "Asia/Bangkok" } },
      { entity: "session_exercise", id: randomUUID(), action: "upsert", data: { session_id: sa.id, exercise_id: bench, position: 1 } },
      { entity: "set_record", id: randomUUID(), action: "upsert", data: { session_exercise_id: ea.id, position: 5, set_kind: "normal", completed_at: new Date().toISOString(), weight_input: 1, weight_unit: "kg", reps: 1, duration_s: null, distance_input: null, distance_unit: null, speed_input: null, speed_unit: null, incline_pct: null } },
      { entity: "set_record", id: ta.id, action: "delete" },
      { entity: "workout_session", id: sa.id, action: "delete" },
    ]);
    expect(res.map((r) => (r.status === "rejected" ? r.code : r.status))).toEqual(["id_conflict", "parent_missing", "parent_missing", "id_conflict", "id_conflict"]);
    expect(await counts(aId)).toMatchObject({ s: 1, e: 1, t: 1 });
    const bootB = JSON.stringify(await (await b.api.get("/api/bootstrap")).json());
    for (const x of [sa.id, ea.id, ta.id]) expect(bootB).not.toContain(x);

    // ลบบัญชี A ผ่าน UI → 0 แถว + ฐานในเครื่องถูกลบ
    await page.goto("/");
    await waitLocalReady(page, aId);
    expect(await dbNames(page)).toContain(`fcf:v1:${aId}`);
    await page.goto("/me");
    await page.getByRole("button", { name: msg(l, "account.delete") }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(msg(l, "account.deleteScreen.understand")).click();
    await dialog.getByRole("button", { name: msg(l, "account.deleteScreen.confirm") }).click();
    await expect(dialog.getByRole("heading", { level: 1 })).toHaveText(msg(l, "account.deleteScreen.doneTitle"), { timeout: 20_000 });
    expect(await dbNames(page)).not.toContain(`fcf:v1:${aId}`);
    const rest = await residue(aId, a.email);
    for (const t of ["workout_session", "session_exercise", "set_record"]) expect(rest[t], t).toBe(0);
    expect(Object.values(rest).every((n) => n === 0), JSON.stringify(rest)).toBe(true);
    await b.api.dispose();
  });
});
