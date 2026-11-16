import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";

export default async function ProgressPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("nav.progress")} />
      <EmptyState pose="lying">{t("empty.progress")}</EmptyState>
    </>
  );
}
