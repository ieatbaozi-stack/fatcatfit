"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ButtonLink, StatusScreen } from "@/components/ui/status-screen";

/** หน้าผิดพลาดทั้งจอ: แมวงง + ประโยคเดียว + ลองใหม่ (reset) + กลับหน้าหลัก */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("error");
  return (
    <StatusScreen pose="confused" title={t("text")}>
      <Button onClick={reset}>{t("retry")}</Button>
      <ButtonLink href="/" variant="text">
        {t("home")}
      </ButtonLink>
    </StatusScreen>
  );
}
