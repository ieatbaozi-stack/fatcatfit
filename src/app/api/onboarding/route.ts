import { assertSameOrigin, handle, json, readJson } from "@/lib/auth/http";
import { requireConsent, requireUser } from "@/lib/auth/server";
import { getDataDb } from "@/lib/data/server/context";
import { submitOnboarding } from "@/lib/data/server/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/onboarding — profile + สถานที่แรก + น้ำหนักแรก ใน transaction เดียว (รูป body: src/lib/data/shared/onboarding.ts)
export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const u = await requireUser(request.headers);
    const db = getDataDb();
    await requireConsent(u.userId, db);
    const { replay } = await submitOnboarding(db, u.userId, await readJson(request), new Date());
    return json({ ok: true, replay });
  });
}
