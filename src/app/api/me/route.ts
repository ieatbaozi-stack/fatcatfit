import { assertSameOrigin, handle, json } from "@/lib/auth/http";
import { getAuth, requireUser } from "@/lib/auth/server";
import { deleteAccount } from "@/lib/data/server/account";
import { getDataDb } from "@/lib/data/server/context";
import { getMe } from "@/lib/data/server/me";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me — สถานะผู้ใช้ปัจจุบัน (ไม่ผ่าน requireConsent: จอยินยอม/แบบสอบถามต้องอ่านได้) · 401 = ไม่ล็อกอิน
export function GET(request: Request) {
  return handle(async () => {
    const u = await requireUser(request.headers);
    return json(await getMe(getDataDb(), u));
  });
}

// DELETE /api/me — ลบบัญชีและข้อมูลทั้งหมด (ออนไลน์เท่านั้น) · ตอบพร้อมลบ cookie session
export function DELETE(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const u = await requireUser(request.headers);
    await deleteAccount(getDataDb(), u.userId, u.email);
    const res = json({ ok: true });
    const { authCookies } = await getAuth().$context;
    for (const c of [authCookies.sessionToken, authCookies.sessionData, authCookies.dontRememberToken]) {
      res.headers.append(
        "Set-Cookie",
        `${c.name}=; Max-Age=0; Path=${c.attributes.path ?? "/"}; HttpOnly; SameSite=Lax${c.attributes.secure ? "; Secure" : ""}`,
      );
    }
    return res;
  });
}
