import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { emailOTP } from "better-auth/plugins";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";

// R0: config ขั้นต่ำเพื่อให้ schema ตรงกับ ADR 0002 · ยังไม่เปิด route /api/auth/* (งาน R1)

/** สร้างอินสแตนซ์จาก db ที่ส่งเข้ามา (เทสต์ส่ง PGlite · แอปส่ง getDb()) */
export function createAuth(db: Database | Parameters<typeof drizzleAdapter>[0]) {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // id สร้างในโค้ดเสมอ (ADR 0001) — ไม่ใช้ generateId: "uuid" เพราะโหมดนั้นให้ DB สร้างผ่าน gen_random_uuid()
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    rateLimit: { storage: "database" },
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        disableSignUp: false,
        async sendVerificationOTP() {
          // R1: ส่งผ่าน src/lib/email
          throw new Error("email transport is not configured yet");
        },
      }),
    ],
  });
}
