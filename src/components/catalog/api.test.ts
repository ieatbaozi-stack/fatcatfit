import { describe, expect, it, vi } from "vitest";
import { fetchBootstrap, fetchCatalog, pushOne } from "./api";

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const fake = (r: Response | Error) =>
  (async () => {
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;

describe("pushOne", () => {
  const input = { entity: "place", id: "i", action: "upsert", data: { name: "x" } } as const;

  it("ส่ง body ตามสัญญา: v, ops 1 รายการ มี op_id และ client_updated_at", async () => {
    const fetchMock = vi.fn(async () => res(200, { results: [{ op_id: "o", status: "applied" }], server_time: "t" }));
    const out = await pushOne(input, fetchMock as unknown as typeof fetch, () => new Date("2026-01-02T03:04:05.000Z"));
    expect(out).toEqual({ kind: "applied" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/sync/push");
    const body = JSON.parse(String(init.body));
    expect(body.v).toBe(1);
    expect(body.ops).toHaveLength(1);
    expect(body.ops[0]).toMatchObject({ entity: "place", id: "i", action: "upsert", data: { name: "x" }, client_updated_at: "2026-01-02T03:04:05.000Z" });
    expect(typeof body.ops[0].op_id).toBe("string");
  });
  it("delete ไม่ส่ง data", async () => {
    const fetchMock = vi.fn(async () => res(200, { results: [{ status: "applied" }] }));
    await pushOne({ entity: "exercise", id: "i", action: "delete" }, fetchMock as unknown as typeof fetch);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect("data" in JSON.parse(String(init.body)).ops[0]).toBe(false);
  });
  it("แปลผลของเซิร์ฟเวอร์", async () => {
    expect(await pushOne(input, fake(res(200, { results: [{ status: "stale" }] })))).toEqual({ kind: "stale" });
    expect(await pushOne(input, fake(res(200, { results: [{ status: "rejected", code: "limit_reached" }] })))).toEqual({ kind: "rejected", code: "limit_reached" });
    expect(await pushOne(input, fake(res(200, { results: [{ status: "rejected" }] })))).toEqual({ kind: "rejected", code: "unknown" });
  });
  it("401/403 = auth · 5xx/ตัวผิดรูป = error · fetch ล้ม = network", async () => {
    expect(await pushOne(input, fake(res(401)))).toEqual({ kind: "auth" });
    expect(await pushOne(input, fake(res(403)))).toEqual({ kind: "auth" });
    expect(await pushOne(input, fake(res(500)))).toEqual({ kind: "error" });
    expect(await pushOne(input, fake(res(200, { results: [] })))).toEqual({ kind: "error" });
    expect(await pushOne(input, fake(new TypeError("net")))).toEqual({ kind: "network" });
  });
});

describe("fetchCatalog / fetchBootstrap", () => {
  it("รับรูปที่ถูกต้อง · ปฏิเสธรูปผิด · แยกสาเหตุล้ม", async () => {
    expect(await fetchCatalog(fake(res(200, { catalog_version: "1-2", exercises: [] })))).toEqual({ ok: true, data: { catalog_version: "1-2", exercises: [] } });
    expect(await fetchCatalog(fake(res(200, { nope: 1 })))).toEqual({ ok: false, reason: "error" });
    expect(await fetchBootstrap(fake(res(401)))).toEqual({ ok: false, reason: "auth" });
    expect(await fetchBootstrap(fake(new TypeError("x")))).toEqual({ ok: false, reason: "network" });
    expect(await fetchBootstrap(fake(res(200, { places: [], my_exercises: [] })))).toMatchObject({ ok: true });
  });
});
