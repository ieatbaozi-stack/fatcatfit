import net from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { isDatabaseHealthy } from "./health";

// เกณฑ์ R1 ข้อ 15: ฐานข้อมูลไม่ตอบ → /api/health ต้องได้ false (503) ภายใน 5 วิ — ทดสอบกับเซิร์ฟเวอร์ TCP ที่รับสายแล้วเงียบ

describe("isDatabaseHealthy เมื่อฐานข้อมูลไม่ตอบ", () => {
  let server: net.Server;
  let port: number;
  const sockets = new Set<net.Socket>();
  const prevUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    server = net.createServer((s) => {
      sockets.add(s); // ไม่ตอบอะไรเลย
      s.on("close", () => sockets.delete(s));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as net.AddressInfo).port;
    process.env.DATABASE_URL = `postgresql://u:p@127.0.0.1:${port}/db`;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(async () => {
    await closeDb();
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    process.env.DATABASE_URL = prevUrl;
  });

  it("คืน false ภายใน 5 วินาที", async () => {
    const t0 = Date.now();
    expect(await isDatabaseHealthy()).toBe(false);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
