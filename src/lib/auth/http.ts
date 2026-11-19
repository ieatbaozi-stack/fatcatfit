import { HttpError } from "@/lib/data/shared/http-error";

// ตัวช่วยของ route handler: คำตอบ JSON ที่ไม่ถูก cache · แปลง HttpError · ตรวจ origin ของคำขอที่เปลี่ยนข้อมูล

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function errorResponse(e: HttpError): Response {
  return json({ code: e.code, ...e.extra }, e.status, e.headers);
}

/** ครอบ handler: HttpError → คำตอบ · อย่างอื่น → 500 โดยไม่ปล่อยข้อความ/ข้อมูล (ไม่ log error ดิบเพราะอาจมีอีเมล) */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    console.error("api: unexpected error", e instanceof Error ? e.name : typeof e);
    return json({ code: "server_error" }, 500);
  }
}

/**
 * คำขอที่เปลี่ยนข้อมูล: ถ้ามี Origin ต้องเป็น host เดียวกับที่รับคำขอ (เสริมจาก SameSite=Lax)
 * `requireOrigin: true` (เส้นทางแอดมิน ADR 0007) = ไม่มี Origin ก็ปฏิเสธ 403 bad_origin · ค่าเริ่มต้น false
 */
export function assertSameOrigin(request: Request, opts: { requireOrigin?: boolean } = {}): void {
  // เบราว์เซอร์บอกชัดว่าคำขอมาจากคนละไซต์ → ปฏิเสธไม่ว่าจะมี Origin หรือไม่
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "bad_origin");
  const origin = request.headers.get("origin");
  if (!origin) {
    if (opts.requireOrigin) throw new HttpError(403, "bad_origin");
    return;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    // origin ผิดรูปแบบ → ปฏิเสธ
  }
  if (originHost !== host) throw new HttpError(403, "bad_origin");
}

/** อ่าน JSON body แบบจำกัดขนาด · ผิดรูป/ใหญ่เกิน → 400 */
export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}
