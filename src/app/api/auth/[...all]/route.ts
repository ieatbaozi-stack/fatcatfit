import { getAuth } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Better Auth handler (ADR 0002) — สร้างอินสแตนซ์แบบ lazy เพื่อให้ build ได้โดยไม่ต้องมี DATABASE_URL
const handler = (request: Request) => getAuth().handler(request);
export const GET = handler;
export const POST = handler;
