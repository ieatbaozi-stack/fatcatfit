import { getTranslations } from "next-intl/server";
import { AccountSection } from "@/components/auth/account-section";
import { Cat } from "@/components/doodle";
import { LocaleSwitch } from "@/components/theme/locale-switch";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { PageHeader } from "@/components/ui/empty-state";
import { Squiggle } from "@/components/ui/squiggle";

// ยึดแบบ R0 (boss ตัดสิน D1) แล้วต่อส่วนบัญชีด้านล่าง · อีเมลมาจาก /api/me ฝั่งไคลเอนต์ใน AccountSection (ไม่อยู่ใน HTML)
export default async function MePage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("nav.me")} />
      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-section">{t("me.theme.label")}</h2>
        <ThemeSwitch />
      </section>
      <Squiggle variant={1} className="my-8" />
      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t("me.language.label")}</h2>
        <LocaleSwitch />
      </section>
      <Squiggle variant={2} className="my-8" />
      <AccountSection />
      <div className="mt-12 flex justify-center">
        <Cat pose="standing" size={120} motion className="text-ink" />
      </div>
    </>
  );
}
