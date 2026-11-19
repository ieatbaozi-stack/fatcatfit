import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/server";
import { recordConsent } from "@/lib/data/server/consent";
import { getDataDb } from "@/lib/data/server/context";
import { HttpError } from "@/lib/data/shared/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ noticeVersion: z.string().min(1).max(32), locale: z.enum(["th", "en"]) });

// POST /api/consent { noticeVersion, locale } — ส่งซ้ำได้ (ไม่เกิดแถวซ้ำ) · เวอร์ชันไม่ตรงปัจจุบัน → 409 notice_version_mismatch
export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const u = await requireUser(request.headers);
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "invalid_input");
    return json(await recordConsent(getDataDb(), u.userId, parsed.data, new Date()));
  });
}
