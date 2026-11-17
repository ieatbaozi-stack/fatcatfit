import { getTranslations } from "next-intl/server";
import { ButtonLink, StatusScreen } from "@/components/ui/status-screen";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <StatusScreen pose="confused" title={t("text")}>
      <ButtonLink href="/">{t("home")}</ButtonLink>
    </StatusScreen>
  );
}
