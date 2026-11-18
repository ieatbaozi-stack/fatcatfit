import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { hasSessionCookie } from "@/lib/auth/session-cookie";

// กลุ่ม (setup): /consent /onboarding — เหมือน (app): 307 ถ้าไม่มี cookie · ห้ามมี loading.tsx / Suspense ครอบ
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  if (!hasSessionCookie(await headers())) redirect("/welcome");
  return (
    <AuthGate kind="setup">
      <div className="flex flex-1 flex-col">{children}</div>
    </AuthGate>
  );
}
