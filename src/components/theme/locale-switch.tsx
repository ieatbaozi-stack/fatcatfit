"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { useOnline } from "@/pwa/use-online";
import { locales, type Locale } from "@/lib/i18n/config";
import { writeLocaleCookie } from "@/lib/i18n/client";
/**
 * ตัวสลับภาษา TH/EN: เขียน cookie แล้ว refresh (ไม่มี locale ใน URL)
 * - "ภาษาที่เลือก" เป็น state ของตัวเอง ไม่อิง useLocale() เพราะค่านั้นเป็นของเก่าจนกว่า refresh จะเสร็จ
 *   (กดรัวๆ แล้วเทียบกับ useLocale() ทำให้ข้ามการเขียน cookie ของปุ่มสุดท้าย)
 * - ออฟไลน์: เปลี่ยนไม่ได้ (router.refresh ดึง RSC ไม่ได้ · ADR 0005) → ปิดปุ่มภาษาอื่น + บอกผู้ใช้
 */
export function LocaleSwitch() {
  const t = useTranslations("me.language");
  const rendered = useLocale();
  const router = useRouter();
  const online = useOnline();
  const [selected, setSelected] = useState<string>(rendered);
  const latest = useRef<string>(rendered);

  function choose(locale: Locale) {
    if (!navigator.onLine || locale === latest.current) return;
    latest.current = locale;
    setSelected(locale);
    writeLocaleCookie(locale);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t("label")}
        aria-describedby={online ? undefined : "locale-offline-note"}
        className="flex flex-wrap gap-2"
      >
        {locales.map((locale) => (
          <Chip
            key={locale}
            pressed={selected === locale}
            lang={locale}
            disabled={!online && selected !== locale}
            onClick={() => choose(locale)}
          >
            {t(locale)}
          </Chip>
        ))}
      </div>
      {!online && (
        <p id="locale-offline-note" role="status" className="text-body text-ink-2">
          {t("offlineNote")}
        </p>
      )}
    </div>
  );
}
