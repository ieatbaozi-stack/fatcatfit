import { test as base, expect } from "@playwright/test";
import { randomIp, signUp, applySession, type TestUser } from "./support/auth";

// test ของ E2E ที่ล็อกอินไว้แล้วโดยค่าเริ่มต้น (R1: หน้าแอปต้องมี session — ไม่มี = 307 ไป /welcome)
// - auth: "ready" (ค่าเริ่ม) = ผู้ใช้ที่ยินยอมและกรอกแบบสอบถามแล้ว ใช้ร่วมกันใน worker เดียว (เทสต์ที่ไม่แก้บัญชี)
// - auth: "none" = ไม่ล็อกอิน · เทสต์ที่ออกจากระบบ/ลบบัญชีต้องสร้างผู้ใช้ของตัวเองด้วย signUp()
// session ได้มาจาก flow จริง (โค้ดเชิญ + OTP จากเมล) ดู support/auth.ts

type Options = { auth: "ready" | "none" };

export const test = base.extend<Options & { _session: void }, { sharedUser: TestUser }>({
  auth: ["ready", { option: true }],
  sharedUser: [
    async ({}, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL as string;
      const u = await signUp(baseURL, { stage: "ready" });
      await use(u);
      await u.api.dispose();
    },
    { scope: "worker" },
  ],
  _session: [
    async ({ auth, context, sharedUser }, use) => {
      if (auth === "ready") await applySession(context, sharedUser);
      // ไม่ล็อกอิน: ให้ทุกเทสต์เป็น "คนละเครื่อง" (rate limit ต่อ IP ของแอปไม่ชนกันข้ามเทสต์ที่รันขนาน)
      else await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
