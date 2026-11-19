import { getTranslations } from "next-intl/server";
import { PRIVACY_NOTICE_VERSION } from "@/lib/data/shared/privacy";

/** หัวข้อของประกาศ (ลำดับตามเกณฑ์ 8 ของ R1 + ม.23) — ข้อความอยู่ใน messages/*.json namespace "privacy.sections" */
export const PRIVACY_SECTIONS = [
  "purpose",
  "required",
  "collected",
  "recipients",
  "controller",
  "rights",
  "backup",
  "withdraw",
] as const;

function lines(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

/**
 * ประกาศความเป็นส่วนตัว (เซิร์ฟเวอร์ component)
 * controllerName/contactEmail มาจาก env ฝั่งเซิร์ฟเวอร์ (PRIVACY_CONTROLLER_NAME / PRIVACY_CONTACT_EMAIL)
 * ไม่ตั้ง = แสดงข้อความ "ยังไม่ได้ตั้งค่า" (ไม่ใส่ค่าสมมติ)
 */
export async function PrivacyNotice({
  controllerName,
  contactEmail,
}: {
  controllerName: string | null;
  contactEmail: string | null;
}) {
  const t = await getTranslations("privacy");
  return (
    <article className="mt-2 flex flex-col gap-8">
      <header>
        <h1 className="text-page">{t("title")}</h1>
        <p className="mt-1 text-caption text-ink-3">{t("version", { version: PRIVACY_NOTICE_VERSION })}</p>
        <p className="mt-3 text-body text-ink-2">{t("intro")}</p>
      </header>
      {PRIVACY_SECTIONS.map((key) => {
        const items = t.has(`sections.${key}.items`) ? lines(t.raw(`sections.${key}.items`)) : [];
        const paragraphs = t.has(`sections.${key}.paragraphs`) ? lines(t.raw(`sections.${key}.paragraphs`)) : [];
        return (
          <section key={key} aria-labelledby={`privacy-${key}`} className="flex flex-col gap-2">
            <h2 id={`privacy-${key}`} className="text-section">
              {t(`sections.${key}.title`)}
            </h2>
            {paragraphs.map((p) => (
              <p key={p} className="text-body text-ink-2">
                {p}
              </p>
            ))}
            {items.length > 0 ? (
              <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink-2">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {t.has(`sections.${key}.safety`) ? (
              <>
                <p className="mt-2 text-body text-ink-2">{t(`sections.${key}.safetyTitle`)}</p>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink-2">
                  {lines(t.raw(`sections.${key}.safety`)).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {t.has(`sections.${key}.after`) ? <p className="text-body text-ink-2">{t(`sections.${key}.after`)}</p> : null}
            {key === "controller" ? (
              <p className="text-body text-ink">
                {controllerName && contactEmail
                  ? t("sections.controller.contact", { name: controllerName, email: contactEmail })
                  : t("sections.controller.notSet")}
              </p>
            ) : null}
          </section>
        );
      })}
    </article>
  );
}
