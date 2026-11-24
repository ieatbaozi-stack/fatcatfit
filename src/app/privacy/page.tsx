import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PrivacyNotice } from "@/components/privacy/privacy-notice";

// ประกาศความเป็นส่วนตัว — หน้าข้อความล้วน เปิดได้ทั้งก่อนและหลังล็อกอิน (ไม่มีด่าน ไม่มีแถบล่าง)
// ผู้ควบคุมข้อมูลอ่านจาก env ฝั่งเซิร์ฟเวอร์ตอน request (ห้ามใส่ชื่อ/อีเมลจริงใน repo)
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  return (
    <>
      <Link
        href="/"
        className="mb-4 inline-flex min-h-11 items-center self-start rounded-hand border border-line bg-paper-2 px-4 text-body font-medium text-ink no-underline transition-opacity active:opacity-80"
      >
        {t("back")}
      </Link>
      <PrivacyNotice
        controllerName={process.env.PRIVACY_CONTROLLER_NAME?.trim() || null}
        contactEmail={process.env.PRIVACY_CONTACT_EMAIL?.trim() || null}
      />
    </>
  );
}
