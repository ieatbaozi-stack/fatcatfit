import { requireAdmin } from "@/lib/auth/admin";
import { assertSameOrigin, handle, json } from "@/lib/auth/http";
import { revokeInviteById } from "@/lib/auth/invite-store";
import { getDataDb } from "@/lib/data/server/context";
import { HttpError } from "@/lib/data/shared/http-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const notFound = () => json({ code: "not_found" }, 404);

// POST /api/admin/invites/{id}/revoke → 200 { result: "revoked" | "unchanged" } · ไม่พบ/id ผิดรูป = 404 · ไม่อ่าน body
export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request, { requireOrigin: true });
    await requireAdmin(request.headers);
    const { id } = await ctx.params;
    if (!UUID.test(id)) throw new HttpError(404, "not_found");
    const result = await revokeInviteById(getDataDb(), id, new Date());
    if (result === "not_found") throw new HttpError(404, "not_found");
    return json({ result });
  });
}

export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound; // ไม่ให้ Next ตอบ 204 + Allow แทน (จะบอกคนนอกว่าเส้นทางมีอยู่)
