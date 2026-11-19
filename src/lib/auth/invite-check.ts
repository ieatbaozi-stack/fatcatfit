import type { AppDb } from "@/db/types";
import { assertSameOrigin, errorResponse, handle, json, readJson } from "./http";
import { HttpError } from "@/lib/data/shared/http-error";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE_S, INVITE_COOKIE_PATH, normalizeInviteCode } from "./invite-code";
import { isInviteActive } from "./invite-store";
import { clientIp, hitThrottle, INVITE_IP_RULE, inviteIpKey } from "./throttle";

// POST /api/invite/check (ADR 0002 ข้อ 2) — ตรวจโค้ดโดยไม่ใช้สิทธิ์ · ถูก → ตั้ง cookie fcf_invite
// ตอบ { result: "ok" | "invalid" } · invalid ไม่แยกเหตุผล (ผิดรูปแบบ/ไม่มี/หมดอายุ/ครบ/ยกเลิก) · โค้ดมาใน body เท่านั้น
// จำกัดต่อ IP 10 ครั้ง/10 นาที ด้วย auth_throttle (route นี้ไม่ผ่าน limiter ของ Better Auth) · 429 + X-Retry-After

export function checkInvite(db: AppDb, request: Request, now: Date): Promise<Response> {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readJson(request);
    const raw = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;

    const th = await hitThrottle(db, inviteIpKey(clientIp(request.headers)), INVITE_IP_RULE, now);
    if (!th.allowed) {
      return errorResponse(new HttpError(429, "too_many_requests", {}, { "X-Retry-After": String(th.retryAfterS) }));
    }

    const code = normalizeInviteCode(raw);
    if (!code || !(await isInviteActive(db, code, now))) return json({ result: "invalid" });

    const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    const cookie = [
      `${INVITE_COOKIE}=${code}`,
      `Max-Age=${INVITE_COOKIE_MAX_AGE_S}`,
      `Path=${INVITE_COOKIE_PATH}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(proto === "https" ? ["Secure"] : []),
    ].join("; ");
    return json({ result: "ok" }, 200, { "Set-Cookie": cookie });
  });
}
