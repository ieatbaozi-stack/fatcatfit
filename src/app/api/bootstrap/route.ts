import { handle, json } from "@/lib/auth/http";
import { requireConsent, requireUser } from "@/lib/auth/server";
import { getBootstrap } from "@/lib/data/server/bootstrap";
import { getDataDb } from "@/lib/data/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bootstrap — snapshot ของผู้ใช้ปัจจุบัน (R2: profile, places, my_exercises) · ต้องล็อกอิน + ยินยอมแล้ว
export function GET(request: Request) {
  return handle(async () => {
    const u = await requireUser(request.headers);
    const db = getDataDb();
    await requireConsent(u.userId, db);
    return json(await getBootstrap(db, u.userId, new Date()));
  });
}
