import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decide, migrateAndSeed } from "./release-migrate";

describe("release-migrate decide()", () => {
  const url = "postgresql://<user>:<password>@<host>/<db>";
  it("ไม่รันถ้าไม่ได้ตั้ง MIGRATE_ON_DEPLOY=1", () => {
    expect(decide({ VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: url })).toMatchObject({ run: false });
    expect(decide({ MIGRATE_ON_DEPLOY: "true", VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: url })).toMatchObject({ run: false });
  });
  it("ไม่รันบน preview/development/ในเครื่อง แม้ตั้ง MIGRATE_ON_DEPLOY=1 และมี URL", () => {
    for (const vercelEnv of ["preview", "development", undefined]) {
      const d = decide({ MIGRATE_ON_DEPLOY: "1", VERCEL_ENV: vercelEnv, DATABASE_URL_UNPOOLED: url });
      expect(d).toMatchObject({ run: false });
      expect("error" in d).toBe(false);
    }
  });
  it("ตั้งครบแต่ไม่มี DATABASE_URL_UNPOOLED = error (ไม่ถอยไปใช้ pooled)", () => {
    const d = decide({ MIGRATE_ON_DEPLOY: "1", VERCEL_ENV: "production", DATABASE_URL: url });
    expect(d).toMatchObject({ run: false, error: expect.any(String) });
  });
  it("รันเมื่อครบทั้งสามข้อ", () => {
    expect(decide({ MIGRATE_ON_DEPLOY: "1", VERCEL_ENV: "production", DATABASE_URL_UNPOOLED: url })).toEqual({ run: true, url });
  });
});

describe("release-migrate เป็นสคริปต์", () => {
  it("ไม่มี env = exit 0 และไม่ต่อฐานข้อมูล", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const env = { ...process.env };
    for (const k of ["MIGRATE_ON_DEPLOY", "VERCEL_ENV", "DATABASE_URL", "DATABASE_URL_UNPOOLED"]) delete env[k];
    const r = spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/release-migrate.ts"], { cwd: root, env, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ข้าม");
  });
});

describe("release-migrate migrateAndSeed()", () => {
  const db = {} as Parameters<typeof migrateAndSeed>[0];
  it("migrate ก่อน แล้ว seed ตามลำดับ", async () => {
    const calls: string[] = [];
    await migrateAndSeed(db, {
      migrate: async () => void calls.push("migrate"),
      seed: async () => (calls.push("seed"), "seed: เปลี่ยน 0 แถว"),
      log: (m) => calls.push(m),
    });
    expect(calls).toEqual(["migrate", "release-migrate: migration เสร็จ", "seed", "release-migrate: seed: เปลี่ยน 0 แถว"]);
  });
  it("migrate ล้ม = throw และไม่ seed", async () => {
    let seeded = false;
    await expect(
      migrateAndSeed(db, {
        migrate: async () => { throw new Error("boom"); },
        seed: async () => { seeded = true; return ""; },
        log: () => undefined,
      }),
    ).rejects.toThrow("boom");
    expect(seeded).toBe(false);
  });
  it("seed ล้ม = throw (deploy ล้ม)", async () => {
    await expect(
      migrateAndSeed(db, {
        migrate: async () => undefined,
        seed: async () => { throw new Error("catalog invalid"); },
        log: () => undefined,
      }),
    ).rejects.toThrow("catalog invalid");
  });
});
