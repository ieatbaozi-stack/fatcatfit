"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { locales, type Locale } from "@/lib/i18n/config";
import { writeLocaleCookie } from "@/lib/i18n/client";

/** ตัวสลับภาษา TH/EN: เขียน cookie แล้ว refresh (ไม่มี locale ใน URL) */
export function LocaleSwitch() {
  const t = useTranslations("me.language");
  const current = useLocale();
  const router = useRouter();

  function choose(locale: Locale) {
    if (locale === current) return;
    writeLocaleCookie(locale);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t("label")} className="flex flex-wrap gap-2">
      {locales.map((locale) => (
        <Chip key={locale} pressed={current === locale} lang={locale} onClick={() => choose(locale)}>
          {t(locale)}
        </Chip>
      ))}
    </div>
  );
}
