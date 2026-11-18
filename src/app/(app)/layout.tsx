import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { BottomTabs } from "@/components/nav/bottom-tabs";
import { hasSessionCookie } from "@/lib/auth/session-cookie";

// กลุ่ม (app): ตรวจแค่ "มี cookie session ไหม" แล้ว 307 ไป /welcome (ADR 0006 ข้อ 2)
// ห้ามมี loading.tsx / <Suspense> ครอบ layout นี้ — จะกลายเป็น 200 + meta refresh ที่ service worker เก็บไว้
// ห้ามอ่านอะไรจาก session ที่นี่: HTML ต้องเหมือนกันทุกสถานะ (ADR 0005 กติกา 1)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!hasSessionCookie(await headers())) redirect("/welcome");
  return (
    <AuthGate kind="app">
      <div className="flex flex-1 flex-col pb-24">{children}</div>
      <BottomTabs />
    </AuthGate>
  );
}
