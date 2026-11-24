import { getTranslations } from "next-intl/server";
import { AccountSection } from "@/components/auth/account-section";
import { AboutSection, TrainingSection } from "@/components/catalog/me-sections";
import { Cat } from "@/components/doodle";
import { LocaleSwitch } from "@/components/theme/locale-switch";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { PageHeader } from "@/components/ui/empty-state";

const CARD = "rounded-card border border-line bg-paper-2 p-4";

// CR4.1 Studio Minimal: หัวหน้าโล่งคู่แมวขยับ + การ์ดพื้นรองแยกหมวดสะอาดตา (อีเมลยังโหลดฝั่งไคลเอนต์ใน AccountSection ตาม ADR 0005)
export default async function MePage() {
  const t = await getTranslations();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageHeader title={t("nav.me")} />
        <Cat pose="standing" size={76} motion className="flex-none text-ink" />
      </div>
      <div className={`${CARD} flex flex-col gap-5`}>
        <section className="flex flex-col gap-2.5">
          <h2 className="text-section">{t("me.theme.label")}</h2>
          <ThemeSwitch />
        </section>
        <section className="flex flex-col gap-2.5">
          <h2 className="text-section">{t("me.language.label")}</h2>
          <LocaleSwitch />
        </section>
      </div>
      <div className={CARD}>
        <TrainingSection />
      </div>
      <div className={CARD}>
        <AccountSection />
      </div>
      <div className={CARD}>
        <AboutSection />
      </div>
    </div>
  );
}
