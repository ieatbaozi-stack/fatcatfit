import { requireAdmin } from "@/lib/auth/admin";
import { assertSameOrigin, handle, json, readJson } from "@/lib/auth/http";
import { createInvite, listInvites } from "@/lib/auth/invite-store";
import { ADMIN_INVITE_RULE, adminInviteKey, hitThrottle } from "@/lib/auth/throttle";
import { getDataDb } from "@/lib/data/server/context";
import { adminInviteInputSchema } from "@/lib/data/shared/admin-invite";
import { HttpError } from "@/lib/data/shared/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// API แอดมินของโค้ดเชิญ (ADR 0007 ข้อ 3) · ตรวจสิทธิ์ก่อนอ่าน body เสมอ · ไม่ log โค้ด/label/body

const notFound = () => json({ code: "not_found" }, 404);

// GET /api/admin/invites → 200 { invites: [...] } เรียงใหม่สุดก่อน สูงสุด 200 · ไม่มีโค้ดหรือ hash
export function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request.headers);
    const rows = await listInvites(getDataDb(), new Date(), { order: "newest", limit: 200 });
    return json({
      invites: rows.map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        usesCount: r.usesCount,
        maxUses: r.maxUses,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });
}

// POST /api/admin/invites { label, days, maxUses } → 201 { id, code, label, maxUses, expiresAt } (โค้ดดิบครั้งเดียว)
export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request, { requireOrigin: true });
    const admin = await requireAdmin(request.headers);
    const db = getDataDb();
    const now = new Date();
    const th = await hitThrottle(db, adminInviteKey(admin.userId), ADMIN_INVITE_RULE, now);
    if (!th.allowed) throw new HttpError(429, "too_many_requests", {}, { "X-Retry-After": String(th.retryAfterS) });
    const parsed = adminInviteInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "invalid_input");
    const inv = await createInvite(db, parsed.data, now);
    return json({ id: inv.id, code: inv.display, label: inv.label, maxUses: inv.maxUses, expiresAt: inv.expiresAt.toISOString() }, 201);
  });
}

// method อื่น: ตอบเหมือนคนนอก (404) ไม่ให้ Next ตอบ 405 ที่ต่างกัน
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound; // ไม่ให้ Next ตอบ 204 + Allow แทน (จะบอกคนนอกว่าเส้นทางมีอยู่)
