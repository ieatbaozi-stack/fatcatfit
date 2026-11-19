import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InvitesScreen } from "@/components/admin/invites-screen";
import { requireAdmin } from "@/lib/auth/admin";
import { HttpError } from "@/lib/data/shared/http-error";

// หน้าแอดมิน (ADR 0007): ตรวจสิทธิ์จากฐานข้อมูลทุกครั้งฝั่งเซิร์ฟเวอร์ · ไม่ใช่แอดมิน/ไม่มี session = 404 เหมือนกันทุกกรณี
// HTML ไม่มีโค้ดหรือรายการ (โหลดจาก API ฝั่งไคลเอนต์)
// ห้ามมี loading.tsx / <Suspense> / not-found.tsx ใต้ (app) หรือ admin/ — จะกลายเป็น 200 + meta refresh ที่ service worker เก็บไว้ (ADR 0005 กติกา 1)
export default async function AdminInvitesPage() {
  try {
    await requireAdmin(await headers());
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e; // DB ล่ม ฯลฯ → หน้าผิดพลาดรวม (500) ไม่ปลอมเป็น 404
  }
  return <InvitesScreen />;
}
