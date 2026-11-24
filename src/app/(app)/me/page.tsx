import { getTranslations } from "next-intl/server";
import { AccountSection } from "@/components/auth/account-section";
import { AboutSection, TrainingSection } from "@/components/catalog/me-sections";
import { Cat } from "@/components/doodle";
import { LocaleSwitch } from "@/components/theme/locale-switch";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Divider } from "@/components/ui/divider";
import { PageHeader } from "@/components/ui/empty-state";

// CR4 Studio Minimal: หัวหน้าโล่งคู่แมวขยับ + เส้นคั่นตรงบาง 1px (อีเมลยังโหลดฝั่งไคลเอนต์ใน AccountSection ตาม ADR 0005)
export default async function MePage() {
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeader title={t("nav.me")} />
        <Cat pose="standing" size={76} motion className="flex-none text-ink" />
      </div>
      <Divider className="my-5" />
      <section className="flex flex-col gap-3">
        <h2 className="text-section">{t("me.theme.label")}</h2>
        <ThemeSwitch />
      </section>
      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-section">{t("me.language.label")}</h2>
        <LocaleSwitch />
      </section>
      <Divider className="my-7" />
      <TrainingSection />
      <Divider className="my-7" />
      <AccountSection />
      <Divider className="my-7" />
      <AboutSection />
    </>
  );
}
