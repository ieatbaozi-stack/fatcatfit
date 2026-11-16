import { isDatabaseHealthy } from "@/lib/data/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — query ฐานข้อมูล 1 ครั้ง · 200 { ok: true } หรือ 503 { ok: false }
export async function GET() {
  const ok = await isDatabaseHealthy();
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
