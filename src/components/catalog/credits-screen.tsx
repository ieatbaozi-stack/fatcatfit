import { getTranslations } from "next-intl/server";
import { Divider } from "@/components/ui/divider";
import { SubPageHeader } from "./shared";

// ชื่อชุดข้อมูล ใบอนุญาต และลิงก์ไม่แปล (UX 12.8) — ต้องตรงกับ content/exercises/SOURCES.md
const FEDB = { name: "free-exercise-db", license: "Unlicense", url: "https://github.com/yuhonas/free-exercise-db" } as const;

/** ฉัน › เครดิตข้อมูลท่า: ข้อความล้วน (ไม่มีสถานะโหลด/ผิดพลาด) · ลิงก์เปิดแท็บใหม่ */
export async function CreditsScreen() {
  const t = await getTranslations("credits");
  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title={t("title")} />
      <p className="text-body text-ink-2">{t("intro")}</p>

      <section aria-labelledby="credits-fedb" className="flex flex-col gap-1.5">
        <h2 id="credits-fedb" className="text-section">
          {FEDB.name}
        </h2>
        <p className="text-body text-ink-2">{t("fedbBody")}</p>
        <p className="text-body text-ink-2">
          {t("license", { license: FEDB.license })} · {t("publicDomain")}
        </p>
        <a href={FEDB.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-body break-all text-ink underline-hand">
          {FEDB.url}
        </a>
      </section>

      <Divider className="my-2" />

      <section aria-labelledby="credits-cardio" className="flex flex-col gap-1.5">
        <h2 id="credits-cardio" className="text-section">
          {t("cardioTitle")}
        </h2>
        <p className="text-body text-ink-2">{t("cardioBody")}</p>
      </section>

      <Divider className="my-2" />

      <section aria-labelledby="credits-thai" className="flex flex-col gap-1.5">
        <h2 id="credits-thai" className="text-section">
          {t("thaiTitle")}
        </h2>
        <p className="text-body text-ink-2">{t("thaiBody")}</p>
      </section>
    </div>
  );
}
