import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoreState, loadBootstrap, resetStore, upsertMyExercise } from "./store";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ex = (over: Record<string, unknown> = {}) => ({ id: ID, owner_user_id: "me", name: "Curl", archived_at: null, ...over });
const boot = (rows: unknown[]) => ({ profile: null, places: [], my_exercises: rows, catalog_version: "1", server_time: "t" });
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

let queue: Array<(r: Response) => void>;
let calls: number;

beforeEach(() => {
  resetStore();
  queue = [];
  calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          calls += 1;
          queue.push(resolve);
        }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

const tick = () => new Promise((r) => setTimeout(r, 0));
const mine = () => getStoreState().bootstrap.data?.my_exercises as unknown as Array<{ archived_at: string | null; name: string }>;

describe("store · bootstrap ไม่ย้อนกลับเป็นข้อมูลก่อนเขียน", () => {
  it("คำตอบที่ถามก่อนการเขียนในเครื่อง (เก็บเข้ากรุ) ถูกทิ้งแล้วถามใหม่ · ท่าที่เก็บไม่กลับมาโผล่", async () => {
    // โหลดครั้งแรกได้ท่าที่ยังไม่เก็บ
    const first = loadBootstrap();
    queue.shift()!(json(boot([ex()])));
    await first;
    expect(mine()[0].archived_at).toBeNull();

    // ขั้นก่อนหน้า (เช่นบันทึกชื่อ) ถามเงียบๆ ค้างอยู่ — ยังไม่ตอบ
    const stale = loadBootstrap();
    await tick();
    expect(calls).toBe(2);

    // ผู้ใช้เก็บเข้ากรุ: เซิร์ฟเวอร์ตอบ applied แล้ว store แก้ในเครื่อง
    upsertMyExercise({ ...ex(), archived_at: "2026-02-01T00:00:00.000Z" } as never);
    expect(mine()[0].archived_at).not.toBeNull();

    // คำตอบเก่า (ก่อนเก็บ) มาถึงทีหลัง — ต้องไม่ทับ
    queue.shift()!(json(boot([ex()])));
    await tick();
    expect(mine()[0].archived_at).not.toBeNull();
    // ...และถามใหม่หนึ่งรอบ ได้ค่าจริงจากเซิร์ฟเวอร์
    expect(calls).toBe(3);
    queue.shift()!(json(boot([ex({ archived_at: "2026-02-01T00:00:00.000Z", name: "Curl 2" })])));
    await stale;
    expect(mine()[0]).toMatchObject({ name: "Curl 2" });
    expect(mine()[0].archived_at).not.toBeNull();
  });

  it("ไม่มีการเขียนระหว่างรอ = ใช้คำตอบแรก ไม่ถามซ้ำ", async () => {
    const p = loadBootstrap();
    queue.shift()!(json(boot([ex({ name: "Only" })])));
    await p;
    expect(calls).toBe(1);
    expect(mine()[0].name).toBe("Only");
  });
});
