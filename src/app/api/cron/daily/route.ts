import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/auth/http";
import { runDailyCleanup } from "@/lib/auth/cleanup";
import { getDataDb } from "@/lib/data/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/daily — Vercel Cron ส่ง `Authorization: Bearer <CRON_SECRET>` (เอกสาร Vercel: Managing Cron Jobs → Securing cron jobs)
// ไม่มี CRON_SECRET หรือไม่ตรง = 401 · log เฉพาะจำนวนแถวที่ลบ
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ code: "unauthorized" }, 401);
  try {
    const deleted = await runDailyCleanup(getDataDb(), new Date());
    console.info(`[cron:daily] deleted rate_limit=${deleted.rateLimit} verification=${deleted.verification} auth_throttle=${deleted.authThrottle}`);
    return json({ ok: true, deleted });
  } catch (e) {
    console.error("[cron:daily] failed", e instanceof Error ? e.name : typeof e);
    return json({ code: "server_error" }, 500);
  }
}
