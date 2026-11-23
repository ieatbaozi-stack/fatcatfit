import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { hasSessionCookie } from "@/lib/auth/session-cookie";

// กลุ่ม (admin): หน้าแอดมิน (ADR 0007) — ด่าน cookie เหมือน (app) (307 /welcome) แต่ไม่มีแถบล่าง
// เหตุ: notFound() ในหน้า ทำให้ Next ตอบ error shell แล้วให้ไคลเอนต์วาด 404 ภายใน layout ของกลุ่มนี้ —
// ถ้าใช้ layout ที่มีแถบล่าง ผู้ใช้ทั่วไปจะเห็นแถบล่างในหน้า 404 (ต่างจาก path ที่ไม่มีอยู่)
// ห้ามมี loading.tsx / <Suspense> / not-found.tsx ใต้กลุ่มนี้ (ADR 0005 กติกา 1 · ADR 0007 ข้อ 4)
// ห้ามอ่านอะไรจาก session ที่นี่: HTML ต้องเหมือนกันทุกสถานะ
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!hasSessionCookie(await headers())) redirect("/welcome");
  return (
    <AuthGate kind="app">
      <div className="flex flex-1 flex-col pb-8">{children}</div>
    </AuthGate>
  );
}
