import { AuthGate } from "@/components/auth/auth-gate";

// กลุ่ม (public): /welcome — ห้าม redirect ฝั่งเซิร์ฟเวอร์ (HTML เหมือนกันทุกสถานะ service worker เก็บไว้ใช้ออฟไลน์)
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate kind="public">
      <div className="flex flex-1 flex-col">{children}</div>
    </AuthGate>
  );
}
