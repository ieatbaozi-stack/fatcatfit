import { handle, json } from "@/lib/auth/http";
import { requireConsent, requireUser } from "@/lib/auth/server";
import { getCatalog, getCatalogVersion } from "@/lib/data/server/catalog";
import { getDataDb } from "@/lib/data/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/catalog — คลังท่ากลางทั้งก้อน · ETag = catalog_version → ถ้า If-None-Match ตรงตอบ 304 ไม่มี body
// ต้องล็อกอิน (401) + ยินยอมแล้ว (403) · ข้อมูลเหมือนกันทุกคน (ไม่มีข้อมูลผู้ใช้) · ไม่มี API ค้นฝั่งเซิร์ฟเวอร์

const etagOf = (version: string) => `"${version}"`;
// ยอมรับ weak validator (W/"...") และหลายค่าคั่น , ตามมาตรฐาน
const matches = (header: string | null, etag: string) =>
  header !== null && header.split(",").some((t) => t.trim().replace(/^W\//, "") === etag);

export function GET(request: Request) {
  return handle(async () => {
    const u = await requireUser(request.headers);
    const db = getDataDb();
    await requireConsent(u.userId, db);
    const headers = { "Cache-Control": "private, no-cache" };

    const version = await getCatalogVersion(db);
    if (matches(request.headers.get("if-none-match"), etagOf(version))) {
      return new Response(null, { status: 304, headers: { ...headers, ETag: etagOf(version) } });
    }
    const catalog = await getCatalog(db);
    return json(catalog, 200, { ...headers, ETag: etagOf(catalog.catalog_version) });
  });
}
