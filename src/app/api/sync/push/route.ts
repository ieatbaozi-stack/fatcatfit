import { assertSameOrigin, handle, json, readJson } from "@/lib/auth/http";
import { requireConsent, requireUser } from "@/lib/auth/server";
import { getDataDb } from "@/lib/data/server/context";
import { pushOps } from "@/lib/data/server/sync-push";
import { PUSH_LIMITS } from "@/lib/data/shared/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sync/push — เขียนข้อมูลแบบส่งซ้ำได้ (ADR 0004 ข้อ 4) · R2 รับ entity place/exercise · รูป body/ผล: src/lib/data/shared/sync.ts
export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const u = await requireUser(request.headers);
    const db = getDataDb();
    await requireConsent(u.userId, db);
    const body = await readJson(request, PUSH_LIMITS.maxBodyBytes);
    return json(await pushOps(db, u.userId, body, new Date()));
  });
}
