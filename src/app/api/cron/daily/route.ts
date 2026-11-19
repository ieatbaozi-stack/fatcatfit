import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/auth/http";
import { runDailyCleanup } from "@/lib/auth/cleanup";
import { getDataDb } from "@/lib/data/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/daily — Vercel Cron ส่ง `Authorization: Bearer <CRON_SECRET>` (เอกสาร Vercel: Managing Cron Jobs → Securing cron jobs)
// CRON_SECRET ไม่ได้ตั้ง/สั้นกว่า 32 ตัว = 500 (ตั้งค่าผิด · log ข้อความคงที่) · header ไม่ตรง = 401 · log เฉพาะจำนวนแถวที่ลบ
const MIN_SECRET_LENGTH = 32;

function authorized(request: Request, secret: string): boolean {
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error("[cron:daily] CRON_SECRET missing or too short");
    return json({ code: "server_error" }, 500);
  }
  if (!authorized(request, secret)) return json({ code: "unauthorized" }, 401);
  try {
    const deleted = await runDailyCleanup(getDataDb(), new Date());
    console.info(`[cron:daily] deleted rate_limit=${deleted.rateLimit} verification=${deleted.verification} auth_throttle=${deleted.authThrottle}`);
    return json({ ok: true, deleted });
  } catch (e) {
    console.error("[cron:daily] failed", e instanceof Error ? e.name : typeof e);
    return json({ code: "server_error" }, 500);
  }
}
